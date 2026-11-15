import type { RequestHandler } from 'express';
import type { ZodTypeAny, output } from 'zod';

/** Replaces req.body with the parsed value so handlers get typed, clean data. */
export const validateBody =
  <S extends ZodTypeAny>(schema: S): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };

/**
 * Query strings arrive as strings, so the parsed value rarely matches what
 * Express put on req.query. It is stored on res.locals instead and read back
 * with parsedQuery, which keeps both objects honest.
 */
export const validateQuery =
  <S extends ZodTypeAny>(schema: S): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    res.locals.query = result.data as output<S>;
    next();
  };

export function parsedQuery<T>(res: { locals: Record<string, unknown> }): T {
  return res.locals.query as T;
}
