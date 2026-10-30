import { Router } from 'express';
import { z } from 'zod';
import { login, registerPatient, revokeRefreshToken, rotateRefreshToken } from './service.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
const refreshSchema = z.object({ refreshToken: z.string().min(20) });

authRouter.post('/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid registration details.', details: parsed.error.flatten() });
  try {
    return res.status(201).json(await registerPatient(parsed.data));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid login details.' });
  try {
    const result = await login(parsed.data.email, parsed.data.password);
    if (!result) return res.status(401).json({ error: 'Invalid email or password.' });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A refresh token is required.' });
  try {
    const result = await rotateRefreshToken(parsed.data.refreshToken);
    if (!result) return res.status(401).json({ error: 'Refresh token is invalid or expired.' });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A refresh token is required.' });
  try {
    await revokeRefreshToken(parsed.data.refreshToken);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
