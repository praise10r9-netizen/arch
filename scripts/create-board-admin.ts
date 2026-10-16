import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
const name = process.env.BOARD_ADMIN_NAME?.trim() ?? '';
const email = process.env.BOARD_ADMIN_EMAIL?.trim().toLowerCase() ?? '';
const password = process.env.BOARD_ADMIN_PASSWORD ?? '';

if (!connectionString) throw new Error('Set DATABASE_URL before creating the board administrator.');
if (name.length < 2 || name.length > 120) {
  throw new Error('BOARD_ADMIN_NAME must be between 2 and 120 characters.');
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error('BOARD_ADMIN_EMAIL must be a valid email address.');
}
if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('BOARD_ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
}

const client = new Client({ connectionString });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(834769282001)');
  const existingAdmin = await client.query(
    `SELECT 1 FROM users WHERE role = 'board_admin' LIMIT 1`,
  );
  if (existingAdmin.rowCount) {
    throw new Error('A board administrator already exists. This bootstrap command can only be used once.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'board_admin')`,
    [name, email, passwordHash],
  );
  await client.query('COMMIT');
  console.info(`Created the board administrator account for ${email}.`);
} catch (error) {
  await client.query('ROLLBACK').catch((rollbackError: unknown) => {
    console.error('Unable to roll back board administrator creation:', rollbackError);
  });
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  ) {
    throw new Error(`An account already exists for ${email}; no account or password was changed.`);
  }
  throw error;
} finally {
  await client.end();
}
