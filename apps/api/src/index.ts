// Express 4 does not forward rejected promises from async handlers, so this
// shim must be imported before the routes are registered.
import 'express-async-errors';
import { createApp } from './app.js';
import { env } from './env.js';
import { configuredProviders } from './modules/auth/oauth/providers.js';
import { sweepActivity } from './modules/activity/activity.service.js';
import { sqlClient } from './db/index.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`\n  Kaned API ready on http://localhost:${env.PORT}`);
  console.log(`  Environment : ${env.NODE_ENV}`);
  console.log(`  CORS origins: ${env.corsOrigins.join(', ')}`);
  const providers = configuredProviders().map((p) => p.label);
  console.log(`  Sign-in with: ${providers.length ? providers.join(', ') : 'password only (no provider configured)'}`);
  console.log(`  Cloudinary  : ${env.cloudinaryEnabled ? 'enabled' : 'not configured'}\n`);
});

// Old activity history is dropped a minute after start, then every six hours.
const sweep = () =>
  sweepActivity(env.ACTIVITY_RETENTION_DAYS).catch((e: Error) => console.warn(`  [activity] sweep failed: ${e.message}`));
setTimeout(sweep, 60_000).unref();
setInterval(sweep, 6 * 60 * 60 * 1000).unref();

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down.`);
  server.close();
  await sqlClient.end({ timeout: 5 });
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
