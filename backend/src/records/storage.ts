import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';

const key = Buffer.from(config.DOCUMENT_ENCRYPTION_KEY, 'hex');

export function isSupportedDocument(data: Buffer): boolean {
  const isPdf = data.subarray(0, 5).toString() === '%PDF-';
  const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  return isPdf || isPng || isJpeg;
}

export async function storeEncryptedDocument(id: string, plaintext: Buffer): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = Buffer.concat([Buffer.from('MLD1'), iv, cipher.getAuthTag(), ciphertext]);
  const storageKey = `${id}.enc`;
  const filePath = resolve(config.DOCUMENT_STORAGE_PATH, storageKey);
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, envelope, { mode: 0o600, flag: 'wx' });
  return storageKey;
}

export async function readEncryptedDocument(storageKey: string): Promise<Buffer> {
  if (!/^[0-9a-f-]+\.enc$/i.test(storageKey)) throw new Error('Invalid storage key.');
  const envelope = await readFile(resolve(config.DOCUMENT_STORAGE_PATH, storageKey));
  if (envelope.subarray(0, 4).toString() !== 'MLD1' || envelope.length < 32) {
    throw new Error('Encrypted document envelope is invalid.');
  }
  const iv = envelope.subarray(4, 16);
  const authTag = envelope.subarray(16, 32);
  const ciphertext = envelope.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
