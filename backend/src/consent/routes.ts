import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import { pool } from '../db/pool.js';

export const consentRouter = Router();
consentRouter.use(requireAuth);

consentRouter.post('/requests', requireRole('provider'), async (req: AuthenticatedRequest, res, next) => {
  const parsed = z.object({
    patientUserId: z.string().uuid(),
    institutionId: z.string().uuid(),
    recordIds: z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length).default([]),
    categoryIds: z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length).default([]),
    expiresAt: z.string().datetime(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid access request.', details: parsed.error.flatten() });
  if (!parsed.data.recordIds.length && !parsed.data.categoryIds.length) {
    return res.status(400).json({ error: 'Select at least one record or category.' });
  }
  const expiresAt = new Date(parsed.data.expiresAt);
  if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'Access requests may expire within the next 30 days.' });
  }

  try {
    const membership = await pool.query(
      `SELECT 1 FROM institution_staff s JOIN healthcare_institutions i ON i.id = s.institution_id
       WHERE s.user_id = $1 AND s.institution_id = $2 AND s.active AND i.status = 'verified'`,
      [req.user!.id, parsed.data.institutionId],
    );
    if (!membership.rowCount) return res.status(403).json({ error: 'Provider is not part of a verified institution.' });
    const request = await pool.query(
      `INSERT INTO consent_requests(patient_user_id, provider_user_id, institution_id, requested_record_ids, requested_category_ids, expires_at)
       VALUES ($1, $2, $3, $4::uuid[], $5::uuid[], $6) RETURNING id, status, expires_at`,
      [parsed.data.patientUserId, req.user!.id, parsed.data.institutionId, parsed.data.recordIds, parsed.data.categoryIds, expiresAt],
    );
    await pool.query(
      `INSERT INTO notifications(user_id, kind, payload) VALUES ($1, 'consent.requested', jsonb_build_object('requestId', $2))`,
      [parsed.data.patientUserId, request.rows[0]!.id],
    );
    return res.status(201).json(request.rows[0]);
  } catch (error) {
    return next(error);
  }
});

consentRouter.get('/requests', requireRole('patient'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cr.id, cr.status, cr.expires_at AS "expiresAt", cr.created_at AS "createdAt",
              u.email AS "providerEmail", i.name AS institution,
              cr.requested_record_ids AS "recordIds", cr.requested_category_ids AS "categoryIds"
       FROM consent_requests cr
       JOIN users u ON u.id = cr.provider_user_id
       JOIN healthcare_institutions i ON i.id = cr.institution_id
       WHERE cr.patient_user_id = $1 ORDER BY cr.created_at DESC`,
      [req.user!.id],
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

consentRouter.post('/requests/:requestId/respond', requireRole('patient'), async (req: AuthenticatedRequest, res, next) => {
  const requestId = z.string().uuid().safeParse(req.params.requestId);
  const body = z.object({ decision: z.enum(['approve', 'reject']) }).safeParse(req.body);
  if (!requestId.success || !body.success) return res.status(400).json({ error: 'Invalid consent decision.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const request = await client.query(
      `SELECT * FROM consent_requests WHERE id = $1 AND patient_user_id = $2 AND status = 'pending'
       AND expires_at > now() FOR UPDATE`,
      [requestId.data, req.user!.id],
    );
    const row = request.rows[0] as {
      id: string;
      patient_user_id: string;
      provider_user_id: string;
      requested_record_ids: string[];
      requested_category_ids: string[];
      expires_at: Date;
    } | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending access request was not found.' });
    }

    if (body.data.decision === 'approve') {
      if (row.requested_record_ids.length) {
        const validRecords = await client.query(
          'SELECT count(*)::int AS count FROM medical_records WHERE patient_user_id = $1 AND id = ANY($2::uuid[])',
          [req.user!.id, row.requested_record_ids],
        );
        if (validRecords.rows[0]!.count !== row.requested_record_ids.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Request includes records not owned by this patient.' });
        }
      }
      if (row.requested_category_ids.length) {
        const validCategories = await client.query(
          'SELECT count(*)::int AS count FROM record_categories WHERE id = ANY($1::uuid[])',
          [row.requested_category_ids],
        );
        if (validCategories.rows[0]!.count !== row.requested_category_ids.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Request includes an invalid record category.' });
        }
      }
      await client.query(
        `INSERT INTO consent_permissions(request_id, patient_user_id, provider_user_id, record_ids, category_ids, expires_at)
         VALUES ($1, $2, $3, $4::uuid[], $5::uuid[], $6)`,
        [row.id, row.patient_user_id, row.provider_user_id, row.requested_record_ids, row.requested_category_ids, row.expires_at],
      );
    }
    const nextStatus = body.data.decision === 'approve' ? 'approved' : 'rejected';
    await client.query('UPDATE consent_requests SET status = $1 WHERE id = $2', [nextStatus, row.id]);
    await client.query(
      `INSERT INTO notifications(user_id, kind, payload) VALUES ($1, $2, jsonb_build_object('requestId', $3))`,
      [row.provider_user_id, `consent.${nextStatus}`, row.id],
    );
    await client.query('COMMIT');
    return res.json({ id: row.id, status: nextStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

consentRouter.get('/permissions', requireRole('patient'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cp.id, cp.expires_at AS "expiresAt", cp.revoked_at AS "revokedAt",
              cp.record_ids AS "recordIds", cp.category_ids AS "categoryIds",
              u.email AS "providerEmail", i.name AS institution
       FROM consent_permissions cp
       JOIN consent_requests cr ON cr.id = cp.request_id
       JOIN users u ON u.id = cp.provider_user_id
       JOIN healthcare_institutions i ON i.id = cr.institution_id
       WHERE cp.patient_user_id = $1 ORDER BY cp.created_at DESC`,
      [req.user!.id],
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

consentRouter.post('/permissions/:permissionId/revoke', requireRole('patient'), async (req: AuthenticatedRequest, res, next) => {
  const id = z.string().uuid().safeParse(req.params.permissionId);
  if (!id.success) return res.status(400).json({ error: 'Invalid permission reference.' });
  try {
    const result = await pool.query(
      `UPDATE consent_permissions SET revoked_at = now()
       WHERE id = $1 AND patient_user_id = $2 AND revoked_at IS NULL RETURNING id`,
      [id.data, req.user!.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Active permission was not found.' });
    await pool.query(
      `INSERT INTO notifications(user_id, kind, payload)
       SELECT provider_user_id, 'consent.revoked', jsonb_build_object('permissionId', id)
       FROM consent_permissions WHERE id = $1`,
      [id.data],
    );
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
