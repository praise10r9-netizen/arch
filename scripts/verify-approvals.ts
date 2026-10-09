import { createHash, createPublicKey, verify } from 'node:crypto';
import { Client } from 'pg';

interface AuditRecord {
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
  approved_at: Date;
}

interface ApprovalPayload {
  schemaVersion: number;
  approvalId: string;
  entryId: string;
  traineeId: string;
  mentorId: string;
  approvedAt: string;
  algorithm: string;
  keyId: string;
}

const connectionString = process.env.DATABASE_URL;
const trustedKeyBase64 = process.env.APPROVAL_SIGNING_PUBLIC_KEY;
if (!connectionString) throw new Error('Set DATABASE_URL before verifying approval records.');
if (!trustedKeyBase64) {
  throw new Error('Set APPROVAL_SIGNING_PUBLIC_KEY to the independently trusted public key.');
}

const trustedPublicKey = createPublicKey({
  key: Buffer.from(trustedKeyBase64, 'base64'),
  format: 'der',
  type: 'spki',
});
if (trustedPublicKey.asymmetricKeyType !== 'ed25519') {
  throw new Error('APPROVAL_SIGNING_PUBLIC_KEY must be an Ed25519 key.');
}

const trustedPublicKeyDer = trustedPublicKey.export({ type: 'spki', format: 'der' });
const client = new Client({ connectionString });
let failed = false;
try {
  await client.connect();
  const result = await client.query<AuditRecord>(
    `SELECT id, entry_id, trainee_id, mentor_id, algorithm, key_id, payload,
            payload_sha256, signature, public_key_pem, approved_at
     FROM approval_audit_events
     ORDER BY approved_at, id`,
  );

  if (!result.rowCount) console.info('No signed approval records found.');

  for (const record of result.rows) {
    let payload: ApprovalPayload | null = null;
    try {
      payload = JSON.parse(record.payload) as ApprovalPayload;
    } catch {
      payload = null;
    }
    const payloadBytes = Buffer.from(record.payload, 'utf8');
    const digest = createHash('sha256').update(payloadBytes).digest('hex');
    const rowMatchesPayload =
      payload !== null &&
      payload.schemaVersion === 1 &&
      payload.approvalId === record.id &&
      payload.entryId === record.entry_id &&
      payload.traineeId === record.trainee_id &&
      payload.mentorId === record.mentor_id &&
      payload.algorithm === record.algorithm &&
      payload.keyId === record.key_id &&
      new Date(payload.approvedAt).getTime() === record.approved_at.getTime();

    let eventPublicKeyMatches = false;
    let signatureValid = false;
    try {
      const eventPublicKey = createPublicKey(record.public_key_pem);
      eventPublicKeyMatches = eventPublicKey
        .export({ type: 'spki', format: 'der' })
        .equals(trustedPublicKeyDer);
      signatureValid = verify(null, payloadBytes, trustedPublicKey, record.signature);
    } catch {
      eventPublicKeyMatches = false;
      signatureValid = false;
    }

    const valid =
      digest === record.payload_sha256 &&
      rowMatchesPayload &&
      eventPublicKeyMatches &&
      signatureValid;
    console.info(
      `${valid ? 'VALID' : 'INVALID'} approval=${record.id} entry=${record.entry_id} sha256=${record.payload_sha256}`,
    );
    if (!valid) failed = true;
  }
} finally {
  await client.end();
}

if (failed) process.exitCode = 1;
