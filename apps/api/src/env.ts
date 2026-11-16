import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — copy .env.example to .env'),
  /** Leave unset to decide from the host: TLS for hosted Postgres, none locally. */
  DATABASE_SSL: z.enum(['require', 'disable']).optional(),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** Where the web app lives; sign-in with a provider ends there. Defaults to the first CORS origin. */
  WEB_URL: z.string().url().optional(),
  /**
   * The API's address as the browser sees it, used to build provider callback
   * URLs. Defaults to WEB_URL, because in development the API is reached
   * through the Vite proxy at the same address.
   */
  API_PUBLIC_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  MICROSOFT_CLIENT_ID: z.string().optional().default(''),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(''),
  /** common = personal and work/school accounts; or a tenant id / domain to allow one school only. */
  MICROSOFT_TENANT: z.string().optional().default('common'),
  GITHUB_CLIENT_ID: z.string().optional().default(''),
  GITHUB_CLIENT_SECRET: z.string().optional().default(''),
  FACEBOOK_CLIENT_ID: z.string().optional().default(''),
  FACEBOOK_CLIENT_SECRET: z.string().optional().default(''),
  /** Days of page views, visits and history kept for the admin activity screens. */
  ACTIVITY_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(180),
  /** Tests only (NODE_ENV=test): send every provider to a local fake server. */
  OAUTH_TEST_SERVER: z.string().url().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().optional().default('kaned/documents'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`);
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n`);
  process.exit(1);
}

const raw = parsed.data;
const corsOrigins = raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
const trimSlash = (u: string) => u.replace(/\/+$/, '');
const webUrl = trimSlash(raw.WEB_URL ?? corsOrigins[0] ?? 'http://localhost:5173');

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  corsOrigins,
  webUrl,
  apiPublicUrl: trimSlash(raw.API_PUBLIC_URL ?? webUrl),
  cloudinaryEnabled: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET,
  ),
};

export type Env = typeof env;
