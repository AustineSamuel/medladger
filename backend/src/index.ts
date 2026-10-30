import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { authRouter } from './auth/routes.js';
import { config } from './config.js';
import { consentRouter } from './consent/routes.js';
import { institutionsRouter } from './institutions/routes.js';
import { recordsRouter } from './records/routes.js';
import { verificationRouter } from './verification/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/institutions', institutionsRouter);
  app.use('/api/records', recordsRouter);
  app.use('/api/consent', consentRouter);
  app.use('/api/verify', verificationRouter);

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof Error && error.name === 'MulterError') {
      return res.status(error.message.includes('File too large') ? 413 : 400).json({ error: error.message });
    }
    if (error instanceof Error && error.message.startsWith('Only PDF')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Unhandled API error', error);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  };
  app.use(errorHandler);
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(config.API_PORT, () => {
    console.info(`MedLedger API listening on port ${config.API_PORT}`);
  });
}
