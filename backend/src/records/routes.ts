import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { isSupportedDocument, readEncryptedDocument, storeEncryptedDocument } from './storage.js';

export const recordsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    if (!allowed.has(file.mimetype)) {
      callback(new Error('Only PDF, JPEG, or PNG documents are accepted.'));
      return;
    }
    callback(null, true);
  },
});

recordsRouter.use(requireAuth);

recordsRouter.get('/', requireRole('patient'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.title, c.name AS category, i.name AS institution, r.created_at AS "createdAt",
              encode(r.content_hash, 'hex') AS "contentHash", r.status
       FROM medical_records r
       JOIN record_categories c ON c.id = r.category_id
       JOIN healthcare_institutions i ON i.id = r.institution_id
       WHERE r.patient_user_id = $1 ORDER BY r.created_at DESC`,
      [req.user!.id],
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

recordsRouter.get('/activity', requireRole('patient'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.action, a.created_at AS "createdAt",
              r.title AS "recordTitle", u.email AS "actorEmail"
       FROM access_audit_logs a
       LEFT JOIN medical_records r ON r.id = a.record_id
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.patient_user_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
      [req.user!.id],
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

recordsRouter.post('/', requireRole('provider'), upload.single('document'), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    patientUserId: z.string().uuid(),
    institutionId: z.string().uuid(),
    categoryId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    supersedesRecordId: z.string().uuid().optional(),
    correctionReason: z.string().trim().min(1).max(500).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !req.file) {
    return res.status(400).json({ error: 'A valid patient, institution, category, title, and document are required.' });
  }
  if (!isSupportedDocument(req.file.buffer)) {
    return res.status(400).json({ error: 'The uploaded bytes are not a supported PDF, JPEG, or PNG document.' });
  }
  if (Boolean(parsed.data.supersedesRecordId) !== Boolean(parsed.data.correctionReason)) {
    return res.status(400).json({ error: 'A correction must include both the prior record reference and a reason.' });
  }

  let storageKey: string | undefined;
  try {
    const staff = await pool.query(
      `SELECT 1 FROM institution_staff s
       JOIN healthcare_institutions i ON i.id = s.institution_id
       JOIN healthcare_professionals p ON p.user_id = s.user_id
       WHERE s.user_id = $1 AND s.institution_id = $2 AND s.active = true AND i.status = 'verified'`,
      [req.user!.id, parsed.data.institutionId],
    );
    if (!staff.rowCount) return res.status(403).json({ error: 'Provider is not authorized by a verified institution.' });

    const patient = await pool.query('SELECT 1 FROM patient_profiles WHERE user_id = $1', [parsed.data.patientUserId]);
    if (!patient.rowCount) return res.status(404).json({ error: 'Patient account was not found.' });

    const professional = await pool.query('SELECT id FROM healthcare_professionals WHERE user_id = $1', [req.user!.id]);
    const category = await pool.query('SELECT 1 FROM record_categories WHERE id = $1', [parsed.data.categoryId]);
    if (!category.rowCount) return res.status(400).json({ error: 'Record category was not found.' });

    const recordId = randomUUID();
    const contentHash = createHash('sha256').update(req.file.buffer).digest();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (parsed.data.supersedesRecordId) {
        const prior = await client.query(
          `SELECT id FROM medical_records
           WHERE id = $1 AND patient_user_id = $2 AND institution_id = $3 AND status = 'active'
           FOR UPDATE`,
          [parsed.data.supersedesRecordId, parsed.data.patientUserId, parsed.data.institutionId],
        );
        if (!prior.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Active prior record was not found for this patient and institution.' });
        }
      }
      const storedKey = await storeEncryptedDocument(recordId, req.file.buffer);
      storageKey = storedKey;
      const record = await client.query(
        `INSERT INTO medical_records(id, patient_user_id, institution_id, issued_by, category_id, title, content_hash, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
        [recordId, parsed.data.patientUserId, parsed.data.institutionId, professional.rows[0]!.id, parsed.data.categoryId, parsed.data.title, contentHash, storedKey],
      );
      if (parsed.data.supersedesRecordId && parsed.data.correctionReason) {
        await client.query(
          `UPDATE medical_records SET status = 'superseded' WHERE id = $1`,
          [parsed.data.supersedesRecordId],
        );
        await client.query(
          `INSERT INTO medical_record_versions(record_id, supersedes_record_id, reason) VALUES ($1, $2, $3)`,
          [recordId, parsed.data.supersedesRecordId, parsed.data.correctionReason],
        );
      }
      await client.query(
        `INSERT INTO access_audit_logs(patient_user_id, actor_user_id, record_id, action)
         VALUES ($1, $2, $3, 'record.issued')`,
        [parsed.data.patientUserId, req.user!.id, recordId],
      );
      await client.query(
        `INSERT INTO notifications(user_id, kind, payload) VALUES ($1, 'record.created', jsonb_build_object('recordId', $2))`,
        [parsed.data.patientUserId, recordId],
      );
      await client.query('COMMIT');
      return res.status(201).json({ id: record.rows[0]!.id, createdAt: record.rows[0]!.created_at });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (storageKey) {
      const { unlink } = await import('node:fs/promises');
      await unlink(`${config.DOCUMENT_STORAGE_PATH}/${storageKey}`).catch((cleanupError: unknown) => {
        console.error('Unable to remove encrypted document after failed record transaction', cleanupError);
      });
    }
    return next(error);
  }
});

recordsRouter.get('/:recordId/document', async (req: AuthenticatedRequest, res, next) => {
  const recordId = z.string().uuid().safeParse(req.params.recordId);
  if (!recordId.success) return res.status(400).json({ error: 'Invalid record reference.' });
  try {
    const record = await pool.query<{ patient_user_id: string; storage_key: string; title: string; content_hash: Buffer }>(
      'SELECT patient_user_id, storage_key, title, content_hash FROM medical_records WHERE id = $1',
      [recordId.data],
    );
    const row = record.rows[0];
    if (!row) return res.status(404).json({ error: 'Record not found.' });

    let allowed = row.patient_user_id === req.user!.id;
    if (!allowed && req.user!.role === 'provider') {
      const permission = await pool.query(
        `SELECT 1 FROM consent_permissions cp
         WHERE cp.patient_user_id = $1 AND cp.provider_user_id = $2
           AND cp.revoked_at IS NULL AND cp.expires_at > now()
           AND EXISTS (
             SELECT 1 FROM consent_requests cr
             JOIN institution_staff s ON s.institution_id = cr.institution_id AND s.user_id = cp.provider_user_id AND s.active
             JOIN healthcare_institutions i ON i.id = s.institution_id AND i.status = 'verified'
             WHERE cr.id = cp.request_id
           )
           AND (
             (cardinality(cp.record_ids) > 0 AND $3 = ANY(cp.record_ids))
             OR (cardinality(cp.category_ids) > 0 AND EXISTS (
               SELECT 1 FROM medical_records mr WHERE mr.id = $3 AND mr.category_id = ANY(cp.category_ids)
             ))
           )`,
        [row.patient_user_id, req.user!.id, recordId.data],
      );
      allowed = Boolean(permission.rowCount);
    }
    if (!allowed) return res.status(403).json({ error: 'No valid permission to access this document.' });

    await pool.query(
      'INSERT INTO access_audit_logs(patient_user_id, actor_user_id, record_id, action) VALUES ($1, $2, $3, $4)',
      [row.patient_user_id, req.user!.id, recordId.data, req.user!.id === row.patient_user_id ? 'record.download.patient' : 'record.download.provider'],
    );
    const document = await readEncryptedDocument(row.storage_key);
    const currentHash = createHash('sha256').update(document).digest();
    if (!currentHash.equals(row.content_hash)) return res.status(500).json({ error: 'Stored document integrity check failed.' });
    res.type('application/octet-stream');
    res.attachment(`${row.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`);
    return res.send(document);
  } catch (error) {
    return next(error);
  }
});
