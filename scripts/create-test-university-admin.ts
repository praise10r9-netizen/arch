import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
const email = (process.env.TEST_UNIVERSITY_ADMIN_EMAIL ?? 'test-university-admin@demo.ac.mw')
  .trim()
  .toLowerCase();
const name = process.env.TEST_UNIVERSITY_ADMIN_NAME?.trim() || 'Test University Administrator';

if (!connectionString) throw new Error('Set DATABASE_URL before creating the test university administrator.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error('TEST_UNIVERSITY_ADMIN_EMAIL must be a valid email address.');
}

const password = randomBytes(24).toString('base64url');
const client = new Client({ connectionString });

try {
  await client.connect();
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'university_admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [name, email, passwordHash],
  );
  if (!result.rowCount) {
    throw new Error(`An account already exists for ${email}; no account or password was changed.`);
  }
  console.info(`Created test university administrator: ${email}`);
  console.info(`Temporary password: ${password}`);
  console.info('Sign in, register the test university domain, then import the student roster.');
} finally {
  await client.end();
}
