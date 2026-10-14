import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;
const email = process.env.UNIVERSITY_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.UNIVERSITY_ADMIN_BOOTSTRAP_PASSWORD;

if (!connectionString) throw new Error('Set DATABASE_URL before creating the university administrator.');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Set UNIVERSITY_ADMIN_EMAIL to the administrator account email.');
}
if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  throw new Error('Set UNIVERSITY_ADMIN_BOOTSTRAP_PASSWORD to a 12-72 byte password for this one-time command.');
}

const client = new Client({ connectionString });
try {
  await client.connect();
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('University Administrator', $1, $2, 'mentor')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, passwordHash],
  );
  if (!result.rowCount) {
    throw new Error('An account already exists for UNIVERSITY_ADMIN_EMAIL; no account or password was changed.');
  }
  console.info(`Created university administrator account for ${email}.`);
} finally {
  await client.end();
}