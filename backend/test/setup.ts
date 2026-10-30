import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
process.env.API_PORT = '4000';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-characters';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-characters';
process.env.DOCUMENT_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.DOCUMENT_STORAGE_PATH = join(tmpdir(), 'medledger-test-encrypted');
