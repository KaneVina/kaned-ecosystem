import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './env.js';
import { api } from './routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';

export function createApp() {
  const app = express();

  // Render and Vercel both sit behind a proxy; without this the rate limiter
  // and secure cookies see the wrong client address.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests and server-to-server calls have no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replayed', 'Retry-After'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  // Both paths answer, so a platform health check works either way.
  const health = (_req: Request, res: Response) => {
    res.json({ status: 'ok', env: env.NODE_ENV, time: new Date().toISOString() });
  };
  app.get('/health', health);
  app.get('/api/health', health);

  app.use('/api', apiLimiter, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
