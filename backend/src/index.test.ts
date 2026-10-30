import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './index.js';

describe('MedLedger HTTP boundary', () => {
  it('reports liveness', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('requires a valid access token for the patient records API', async () => {
    const response = await request(createApp()).get('/api/records');
    expect(response.status).toBe(401);
  });

  it('requires authentication before reading the private audit feed', async () => {
    const response = await request(createApp()).get('/api/records/activity');
    expect(response.status).toBe(401);
  });

  it('rejects malformed registration data', async () => {
    const response = await request(createApp()).post('/api/auth/register').send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
  });
});
