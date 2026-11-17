import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { env } from '../env.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
};

/** Postgres unique-violation and foreign-key errors surfaced by postgres-js. */
interface PgError {
  code?: string;
  constraint_name?: string;
  detail?: string;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // The request already got an answer (e.g. the slow-request guard); nothing more to send.
  if (res.headersSent) return;

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, fields: err.fields },
    });
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields },
    });
    return;
  }

  const pg = err as PgError;
  if (pg?.code === '23505') {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'That value is already taken.' },
    });
    return;
  }
  if (pg?.code === '23503') {
    res.status(400).json({
      error: { code: 'BAD_REFERENCE', message: 'That record refers to something that no longer exists.' },
    });
    return;
  }

  console.error('[api] unhandled error', err);
  // Admins get the underlying reason, so a failure can be diagnosed from the browser.
  const detail = req.user?.role === 'ADMIN' ? `${(err as Error)?.name ?? 'Error'}: ${(err as Error)?.message ?? String(err)}`.slice(0, 500) : undefined;
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      ...(detail ? { detail } : {}),
      message: env.isProd
        ? 'Something went wrong on our side.'
        : String((err as Error)?.message ?? err),
    },
  });
};
