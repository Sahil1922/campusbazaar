import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './auth/routes.js';
import { profileRouter } from './profile/routes.js';
import { adminRouter } from './admin/routes.js';
import { errorHandler, notFoundHandler } from './http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
