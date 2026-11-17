import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './env.js';
import { beginDbWork, resetDb, sqlClient } from './db/index.js';
import { api } from './routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';

const REQUEST_TIMEOUT_MS = 15_000;

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
  /*
   * Fresh database connections after a quiet spell, and a ceiling on how
   * long a request may hang: past it the client gets a clear error well
   * before the platform's 30 s cut-off, and the pool is replaced.
   */
  app.use((req, res, next) => {
    const end = beginDbWork();
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      resetDb(`${req.method} ${req.path} took over ${REQUEST_TIMEOUT_MS / 1000}s`);
      res.status(503).set('Retry-After', '1').json({ error: { code: 'BUSY', message: 'Máy chủ phản hồi chậm. Thử lại sau giây lát.' } });
    }, REQUEST_TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      end();
    };
    res.on('finish', finish);
    res.on('close', finish);
    next();
  });
  // API answers are personal or change often; no shared cache should keep them.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  // Both paths answer, so a platform health check works either way.
  const health = async (req: Request, res: Response) => {
    const body: Record<string, unknown> = { status: 'ok', env: env.NODE_ENV, time: new Date().toISOString() };
    // ?db=1 also round-trips to the database, for the status line in the footer.
    if (req.query.db) {
      const t = Date.now();
      const ping = sqlClient`select 1`.then(() => 'ok' as const);
      const timeout = new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), 4000));
      body.db = await Promise.race([ping, timeout]).catch(() => 'down' as const);
      body.dbMs = Date.now() - t;
      if (body.db === 'down') {
        body.status = 'degraded';
        resetDb('health check could not reach the database');
      }
    }
    res.set('Cache-Control', 'no-store').status(body.status === 'ok' ? 200 : 503).json(body);
  };
  app.get('/health', health);
  app.get('/api/health', health);

  app.use('/api', apiLimiter, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
