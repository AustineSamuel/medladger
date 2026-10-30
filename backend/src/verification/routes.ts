import { createHash } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { isSupportedDocument } from '../records/storage.js';

export const verificationRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 } });

verificationRouter.post('/', upload.single('document'), async (req, res, next) => {
  const reference = z.string().uuid().safeParse(req.body.recordId);
  if (!reference.success || !req.file) {
    return res.status(400).json({ error: 'Provide a valid verification reference and document.' });
  }
  if (!isSupportedDocument(req.file.buffer)) {
    return res.status(400).json({ error: 'The uploaded bytes are not a supported PDF, JPEG, or PNG document.' });
  }
  try {
    const candidateHash = createHash('sha256').update(req.file.buffer).digest();
    const result = await pool.query<{
      id: string;
      content_hash: Buffer;
      institution_name: string;
      institution_status: string;
    }>(
      `SELECT r.id, r.content_hash, i.name AS institution_name, i.status AS institution_status
       FROM medical_records r JOIN healthcare_institutions i ON i.id = r.institution_id
       WHERE r.id = $1`,
      [reference.data],
    );
    const record = result.rows[0];
    if (!record) {
      await pool.query(
        'INSERT INTO verification_logs(record_id, matched, verified_institution) VALUES (NULL, false, false)',
      );
      return res.json({
        matched: false,
        institutionVerified: false,
        message: 'No matching record was found. This result reveals no patient or record details.',
        limitation: 'A matching hash can show that bytes match a registered commitment, but cannot prove medical accuracy or identity.',
      });
    }
    const matched = record.content_hash.equals(candidateHash);
    const institutionVerified = record.institution_status === 'verified';
    await pool.query(
      'INSERT INTO verification_logs(record_id, institution_id, matched, verified_institution) SELECT $1, institution_id, $2, $3 FROM medical_records WHERE id = $1',
      [reference.data, matched, institutionVerified],
    );
    return res.json({
      matched,
      institutionVerified,
      institution: record.institution_name,
      message: matched
        ? 'Document bytes match the registered record commitment.'
        : 'Document bytes do not match the registered record commitment.',
      limitation: 'This check does not reveal patient information and does not prove the medical content is accurate, clinically appropriate, or associated with a particular identity.',
    });
  } catch (error) {
    return next(error);
  }
});
