import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sqlClient } from './index.js';

/** Applies everything in ./drizzle — this is what Render runs on deploy. */
async function main() {
  console.log('Applying migrations…');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await sqlClient.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
