import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { isSupportedDocument, readEncryptedDocument, storeEncryptedDocument } from './storage.js';

const storedKeys: string[] = [];

afterEach(async () => {
  await Promise.all(storedKeys.splice(0).map((key) => rm(join(tmpdir(), 'medledger-test-encrypted', key), { force: true })));
});

describe('encrypted document storage', () => {
  it('accepts supported document signatures instead of trusting file extensions', () => {
    expect(isSupportedDocument(Buffer.from('%PDF-1.7 synthetic'))).toBe(true);
    expect(isSupportedDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isSupportedDocument(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(true);
    expect(isSupportedDocument(Buffer.from('not a document'))).toBe(false);
  });

  it('encrypts documents at rest and decrypts only through the storage service', async () => {
    const id = randomUUID();
    const plaintext = Buffer.from('synthetic test document');
    const key = await storeEncryptedDocument(id, plaintext);
    storedKeys.push(key);
    const encrypted = await import('node:fs/promises').then(({ readFile }) =>
      readFile(join(tmpdir(), 'medledger-test-encrypted', key)),
    );

    expect(encrypted.includes(plaintext)).toBe(false);
    expect(await readEncryptedDocument(key)).toEqual(plaintext);
  });

  it('rejects modified ciphertext', async () => {
    const id = randomUUID();
    const key = await storeEncryptedDocument(id, Buffer.from('synthetic content'));
    storedKeys.push(key);
    const filePath = join(tmpdir(), 'medledger-test-encrypted', key);
    const { readFile, writeFile } = await import('node:fs/promises');
    const encrypted = await readFile(filePath);
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
    await writeFile(filePath, encrypted);

    await expect(readEncryptedDocument(key)).rejects.toThrow();
  });
});
