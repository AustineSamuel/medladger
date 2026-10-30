import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from './pool.js';

const input = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(16),
}).parse(process.env);

try {
  const passwordHash = await bcrypt.hash(input.ADMIN_PASSWORD, 12);
  const result = await pool.query(
    `INSERT INTO users(email, password_hash, role, email_verified_at)
     VALUES ($1, $2, 'admin', now()) ON CONFLICT DO NOTHING RETURNING id`,
    [input.ADMIN_EMAIL.toLowerCase(), passwordHash],
  );
  if (!result.rowCount) {
    throw new Error('The requested administrator email already exists; no account was changed.');
  }
  console.info(`Created initial administrator account ${input.ADMIN_EMAIL.toLowerCase()}.`);
} finally {
  await pool.end();
}
