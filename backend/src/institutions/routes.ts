import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import type { AuthenticatedRequest } from '../auth/types.js';

export const institutionsRouter = Router();

institutionsRouter.post('/onboard', async (req, res, next) => {
  const parsed = z.object({
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(100),
    licenseReference: z.string().trim().min(1).max(100),
    institutionName: z.string().trim().min(2).max(180),
    institutionType: z.string().trim().min(2).max(80),
    registrationReference: z.string().trim().min(2).max(120),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid institution onboarding details.', details: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await client.query<{ id: string }>(
      `INSERT INTO users(email, password_hash, role) VALUES ($1, $2, 'provider') RETURNING id`,
      [parsed.data.email.toLowerCase(), passwordHash],
    );
    const userId = user.rows[0]!.id;
    const institution = await client.query<{ id: string }>(
      `INSERT INTO healthcare_institutions(name, institution_type, registration_reference)
       VALUES ($1, $2, $3) RETURNING id`,
      [parsed.data.institutionName, parsed.data.institutionType, parsed.data.registrationReference],
    );
    await client.query(
      'INSERT INTO healthcare_professionals(user_id, license_reference) VALUES ($1, $2)',
      [userId, parsed.data.licenseReference],
    );
    await client.query(
      'INSERT INTO institution_staff(institution_id, user_id, institution_admin) VALUES ($1, $2, true)',
      [institution.rows[0]!.id, userId],
    );
    await client.query('COMMIT');
    return res.status(201).json({
      userId,
      institutionId: institution.rows[0]!.id,
      status: 'pending',
      message: 'Institution onboarding is pending independent platform verification.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'An account or institution registration reference already exists.' });
    }
    return next(error);
  } finally {
    client.release();
  }
});

institutionsRouter.get('/me', requireAuth, requireRole('provider'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT i.id, i.name, i.institution_type AS "type", i.status, s.institution_admin AS "isAdmin"
       FROM institution_staff s JOIN healthcare_institutions i ON i.id = s.institution_id
       WHERE s.user_id = $1 AND s.active = true`,
      [req.user!.id],
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

institutionsRouter.get('/pending', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, institution_type AS "type", registration_reference AS "registrationReference", created_at AS "createdAt"
       FROM healthcare_institutions WHERE status = 'pending' ORDER BY created_at`,
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

institutionsRouter.post('/:id/verify', requireAuth, requireRole('admin'), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const decision = z.object({ verified: z.boolean() }).safeParse(req.body);
  if (!id.success || !decision.success) return res.status(400).json({ error: 'Invalid verification request.' });
  try {
    const status = decision.data.verified ? 'verified' : 'revoked';
    const result = await pool.query(
      `UPDATE healthcare_institutions SET status = $1, verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE verified_at END
       WHERE id = $2 AND status = 'pending' RETURNING id, status`,
      [status, id.data],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Pending institution was not found.' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

institutionsRouter.post('/:id/status', requireAuth, requireRole('admin'), async (req, res, next) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const body = z.object({ status: z.enum(['verified', 'suspended', 'revoked']) }).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: 'Invalid institution status request.' });
  try {
    const result = await pool.query(
      `UPDATE healthcare_institutions
       SET status = $1, verified_at = CASE WHEN $1 = 'verified' THEN COALESCE(verified_at, now()) ELSE verified_at END
       WHERE id = $2 RETURNING id, status`,
      [body.data.status, id.data],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Institution was not found.' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});
