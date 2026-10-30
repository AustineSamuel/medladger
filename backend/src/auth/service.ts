import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import type { UserRole } from './types.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function issueAccessToken(userId: string, role: UserRole): string {
  return jwt.sign({ role, type: 'access' }, config.ACCESS_TOKEN_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TTL,
  });
}

function issueRefreshToken(userId: string): string {
  return jwt.sign({ type: 'refresh', nonce: randomBytes(16).toString('hex') }, config.REFRESH_TOKEN_SECRET, {
    subject: userId,
    expiresIn: '30d',
  });
}

export async function registerPatient(input: { email: string; password: string; displayName: string }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await client.query<{ id: string }>(
      `INSERT INTO users(email, password_hash, role) VALUES ($1, $2, 'patient') RETURNING id`,
      [input.email.toLowerCase(), passwordHash],
    );
    const userId = user.rows[0]!.id;
    const patientRef = randomBytes(32);
    await client.query(
      'INSERT INTO patient_profiles(user_id, patient_ref, display_name) VALUES ($1, $2, $3)',
      [userId, patientRef, input.displayName],
    );
    const refreshToken = issueRefreshToken(userId);
    await client.query(
      'INSERT INTO sessions(user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, hashToken(refreshToken), new Date(Date.now() + REFRESH_TTL_MS)],
    );
    await client.query('COMMIT');
    return { user: { id: userId, role: 'patient' as const }, accessToken: issueAccessToken(userId, 'patient'), refreshToken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function login(email: string, password: string) {
  const result = await pool.query<{ id: string; password_hash: string; role: UserRole; disabled_at: Date | null }>(
    'SELECT id, password_hash, role, disabled_at FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  const user = result.rows[0];
  if (!user || user.disabled_at || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }
  const refreshToken = issueRefreshToken(user.id);
  await pool.query(
    'INSERT INTO sessions(user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hashToken(refreshToken), new Date(Date.now() + REFRESH_TTL_MS)],
  );
  return {
    user: { id: user.id, role: user.role },
    accessToken: issueAccessToken(user.id, user.role),
    refreshToken,
  };
}

export async function rotateRefreshToken(token: string) {
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, config.REFRESH_TOKEN_SECRET) as jwt.JwtPayload;
  } catch {
    return null;
  }
  if (claims.type !== 'refresh' || typeof claims.sub !== 'string') return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query(
      `SELECT s.id, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1 AND s.refresh_token_hash = $2 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.disabled_at IS NULL FOR UPDATE`,
      [claims.sub, hashToken(token)],
    );
    const row = session.rows[0] as { id: string; role: UserRole } | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    const nextRefreshToken = issueRefreshToken(claims.sub);
    await client.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [row.id]);
    await client.query(
      'INSERT INTO sessions(user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3)',
      [claims.sub, hashToken(nextRefreshToken), new Date(Date.now() + REFRESH_TTL_MS)],
    );
    await client.query('COMMIT');
    return {
      accessToken: issueAccessToken(claims.sub, row.role),
      refreshToken: nextRefreshToken,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(token: string) {
  await pool.query('UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL', [
    hashToken(token),
  ]);
}
