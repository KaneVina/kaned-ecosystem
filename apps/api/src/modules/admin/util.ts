import { ApiError } from '../../lib/errors.js';

/** Postgres unique violation → a 409 the form can attach to the right field. */
export async function uniqueGuard<T>(work: Promise<T>, field: string, message: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '23505') throw ApiError.conflict(message, { [field]: message });
    throw error;
  }
}

export function notFound(what: string): never {
  throw ApiError.notFound(`Không tìm thấy ${what}.`);
}

/** Today in the server's calendar, as YYYY-MM-DD. */
export const today = () => new Date().toISOString().slice(0, 10);
