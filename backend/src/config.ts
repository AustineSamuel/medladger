import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: resolve(fileURLToPath(new URL('../../.env', import.meta.url))) });

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  DOCUMENT_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  DOCUMENT_STORAGE_PATH: z.string().default('./var/encrypted-documents'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

export const config = configSchema.parse(process.env);
