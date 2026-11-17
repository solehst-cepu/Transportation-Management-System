import cookieParser from 'cookie-parser';
import express from 'express';
import { apiRouter } from './routes.ts';

export function createApiApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  app.use('/api', apiRouter);
  return app;
}
