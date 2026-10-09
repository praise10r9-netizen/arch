import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const originalDatabaseUrl = process.env.DATABASE_URL;
if (!originalDatabaseUrl) throw new Error('Set DATABASE_URL before running the approval flow test.');
if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET before running the approval flow test.');

const schema = `approval_test_${crypto.randomUUID().replaceAll('-', '')}`;
const schemaSqlName = `"${schema}"`;
const databaseAdmin = new Client({ connectionString: originalDatabaseUrl });
let closeApplicationPool: (() => Promise<void>) | undefined;
let databaseAdminConnected = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  await databaseAdmin.connect();
  databaseAdminConnected = true;
  await databaseAdmin.query(`CREATE SCHEMA ${schemaSqlName}`);
  await databaseAdmin.query(`SET search_path TO ${schemaSqlName}, public`);

  const migrationsDirectory = path.join(process.cwd(), 'db', 'migrations');
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrationNames) {
    await databaseAdmin.query(
      await readFile(path.join(migrationsDirectory, name), 'utf8'),
    );
  }

  const testDatabaseUrl = new URL(originalDatabaseUrl);
  testDatabaseUrl.searchParams.set('options', `-c search_path=${schema},public`);
  process.env.DATABASE_URL = testDatabaseUrl.toString();

  const [{ addTrainingEntry }, { approveExperienceEntry, getApprovalReview, getPendingApprovals }] =
    await Promise.all([
      import('../lib/trainee-store'),
      import('../lib/approval-store'),
    ]);
  const { getDatabase } = await import('../lib/database');
  const pool = getDatabase();
  closeApplicationPool = () => pool.end();
  const currentSchema = await pool.query<{ schema: string }>('SELECT current_schema() AS schema');
  assert(currentSchema.rows[0].schema === schema, 'Application pool did not use the isolated test schema.');

  const mentorResult = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Approval Test Mentor', $1, 'unused', 'mentor')
     RETURNING id`,
    [`mentor-${schema}@example.invalid`],
  );
  const traineeResult = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Approval Test Trainee', $1, 'unused', 'trainee')
     RETURNING id`,
    [`trainee-${schema}@example.invalid`],
  );
  const otherMentorResult = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Unassigned Test Mentor', $1, 'unused', 'mentor')
     RETURNING id`,
    [`other-${schema}@example.invalid`],
  );
  const mentorId = mentorResult.rows[0].id;
  const traineeId = traineeResult.rows[0].id;
  const otherMentorId = otherMentorResult.rows[0].id;
  await pool.query('INSERT INTO trainee_profiles (user_id) VALUES ($1)', [traineeId]);
  await pool.query(
    `INSERT INTO mentor_assignments (trainee_id, mentor_id, assigned_by, assignment_source)
     VALUES ($1, $2, $2, 'mentor')`,
    [traineeId, mentorId],
  );

  const saved = await addTrainingEntry(traineeId, {
    date: new Date().toISOString().slice(0, 10),
    category: 'Design & documentation',
    activity: 'Approval integration test entry with a signed audit record.',
    hours: 1.5,
  });
  const entryId = saved.entry.id;
  assert(saved.entry.status === 'pending', 'New log was not pending review.');
  assert(saved.notificationCreated, 'Assigned mentor was not notified.');
  await pool.query(
    `INSERT INTO trainee_attachments
       (trainee_id, entry_id, kind, filename, media_type, size_bytes, content)
     VALUES ($1, $2, 'evidence', 'review-test.png', 'image/png', 8, $3)`,
    [traineeId, entryId, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
  );
  console.info('PASS trainee log save and mentor notification');

  const secondSaved = await addTrainingEntry(traineeId, {
    date: new Date().toISOString().slice(0, 10),
    category: 'Site supervision',
    activity: 'Second entry proves that evidence limits apply per log.',
    hours: 1,
  });
  await pool.query(
    `INSERT INTO trainee_attachments
       (trainee_id, entry_id, kind, filename, media_type, size_bytes, content)
     VALUES ($1, $2, 'evidence', 'second-review-test.png', 'image/png', 8, $3)`,
    [traineeId, secondSaved.entry.id, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
  );
  let duplicateEvidenceRejected = false;
  try {
    await pool.query(
      `INSERT INTO trainee_attachments
         (trainee_id, entry_id, kind, filename, media_type, size_bytes, content)
       VALUES ($1, $2, 'evidence', 'duplicate-review-test.png', 'image/png', 8, $3)`,
      [traineeId, entryId, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    );
  } catch (error) {
    duplicateEvidenceRejected =
      typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
  assert(duplicateEvidenceRejected, 'A log accepted more than one evidence image.');
  console.info('PASS one evidence image per log, with separate evidence on another log');

  const review = await getApprovalReview(mentorId, entryId);
  assert(review?.entry.entryId === entryId, 'Focused review detail did not include the pending log.');
  assert(
    review.attachments.length === 1 &&
      review.attachments[0].kind === 'evidence' &&
      review.attachments[0].filename === 'review-test.png' &&
      review.attachments[0].entryId === entryId,
    'Focused review detail did not include only this log’s visual evidence metadata.',
  );
  assert(
    (await getApprovalReview(otherMentorId, entryId)) === null,
    'An unrelated mentor could load the focused review detail.',
  );
  console.info('PASS focused review detail includes evidence and enforces mentor assignment');

  const queue = await getPendingApprovals(mentorId);
  assert(queue.length === 2, 'Assigned mentor approval queue should contain both entries.');
  assert(queue.some((item) => item.entryId === entryId), 'Approval queue omitted the reviewed entry.');
  console.info('PASS assignment-scoped mentor approval queue');

  const unassignedQueue = await getPendingApprovals(otherMentorId);
  assert(unassignedQueue.length === 0, 'Unassigned mentor received another mentor’s entry.');
  console.info('PASS unrelated mentor cannot view assigned trainee log');

  const approvalResult = await approveExperienceEntry(mentorId, entryId);
  assert(approvalResult.kind === 'approved', 'Mentor approval did not complete.');
  console.info('PASS mentor approval creates the signed audit record');

  const repeatApprovalResult = await approveExperienceEntry(mentorId, entryId);
  assert(repeatApprovalResult.kind === 'not-pending', 'Duplicate approval was not rejected.');
  console.info('PASS duplicate approval is rejected');

  const auditResult = await pool.query<{
    id: string;
    entry_id: string;
    trainee_id: string;
    mentor_id: string;
    algorithm: string;
    key_id: string;
    payload: string;
    payload_sha256: string;
    signature: Buffer;
    public_key_pem: string;
  }>(
    `SELECT id, entry_id, trainee_id, mentor_id, algorithm, key_id, payload,
            payload_sha256, signature, public_key_pem
     FROM approval_audit_events`,
  );
  assert(auditResult.rowCount === 1, 'Expected exactly one signed audit row.');
  const audit = auditResult.rows[0];
  const digest = createHash('sha256').update(audit.payload).digest('hex');
  const trustedPublicKey = createPublicKey({
    key: Buffer.from(process.env.APPROVAL_SIGNING_PUBLIC_KEY ?? '', 'base64'),
    format: 'der',
    type: 'spki',
  });
  const storedPublicKey = createPublicKey(audit.public_key_pem);
  const publicKeysMatch = trustedPublicKey
    .export({ type: 'spki', format: 'der' })
    .equals(storedPublicKey.export({ type: 'spki', format: 'der' }));
  assert(digest === audit.payload_sha256, 'Stored SHA-256 digest does not match the signed payload.');
  assert(publicKeysMatch, 'Audit row signing key does not match configured trusted key.');
  assert(
    verify(null, Buffer.from(audit.payload), trustedPublicKey, audit.signature),
    'Ed25519 signature verification failed.',
  );
  const payload = JSON.parse(audit.payload) as {
    entryId: string;
    traineeId: string;
    mentorId: string;
    activity: { description: string };
  };
  assert(payload.entryId === entryId, 'Signed payload entry id mismatch.');
  assert(payload.traineeId === traineeId && payload.mentorId === mentorId, 'Signed payload party ids mismatch.');
  assert(payload.activity.description === 'Approval integration test entry with a signed audit record.', 'Signed log snapshot mismatch.');
  console.info('PASS audit SHA-256, signer key, and Ed25519 signature verification');

  const approvedStatus = await pool.query<{ status: string }>(
    'SELECT status FROM experience_entries WHERE id = $1',
    [entryId],
  );
  assert(approvedStatus.rows[0].status === 'approved', 'Approved log status was not persisted.');
  assert(
    (await getApprovalReview(mentorId, entryId)) === null,
    'Approved log remained in the pending review detail endpoint.',
  );
  let immutable = false;
  try {
    await pool.query('UPDATE approval_audit_events SET payload = payload WHERE id = $1', [audit.id]);
  } catch {
    immutable = true;
  }
  assert(immutable, 'Approval audit row accepted an update.');
  console.info('PASS approved log and signed audit record are immutable');
} finally {
  try {
    if (closeApplicationPool) await closeApplicationPool();
  } finally {
    if (databaseAdminConnected) {
      await databaseAdmin.query('RESET search_path').catch(() => undefined);
      await databaseAdmin.query(`DROP SCHEMA IF EXISTS ${schemaSqlName} CASCADE`).catch((error: unknown) => {
        console.error('Unable to remove isolated approval test schema:', error);
      });
      await databaseAdmin.end();
    } else {
      await databaseAdmin.end().catch(() => undefined);
    }
  }
}
