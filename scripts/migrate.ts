import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Set DATABASE_URL before running database migrations.');
}

const migrationsDirectory = path.join(process.cwd(), 'db', 'migrations');
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const name of migrationFiles) {
    const alreadyApplied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (alreadyApplied.rowCount) continue;

    await client.query('BEGIN');
    try {
      await client.query(await readFile(path.join(migrationsDirectory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.info(`Applied database migration ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
