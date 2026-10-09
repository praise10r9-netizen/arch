import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDatabase } from './database';
import { signApprovalPayload } from './approval-signatures';

export interface PendingApproval {
  entryId: string;
  traineeId: string;
  traineeName: string;
  date: string;
  category: string;
  activity: string;
  hours: number;
  submittedAt: string;
}

export interface ReviewAttachment {
  id: string;
  kind: 'evidence' | 'certificate';
  entryId: string | null;
  filename: string;
  mediaType: string;
  sizeBytes: number;
}

export interface ApprovalReview {
  entry: PendingApproval;
  attachments: ReviewAttachment[];
}

export async function getPendingApprovals(mentorId: string): Promise<PendingApproval[]> {
  const result = await getDatabase().query<{
    entry_id: string;
    trainee_id: string;
    trainee_name: string;
    occurred_on: string;
    category: string;
    activity: string;
    hours: string;
    created_at: Date;
  }>(
    `SELECT entry.id AS entry_id,
            trainee.id AS trainee_id,
            trainee.name AS trainee_name,
            entry.occurred_on::text AS occurred_on,
            entry.category,
            entry.activity,
            entry.hours,
            entry.created_at
     FROM experience_entries entry
     JOIN mentor_assignments assignment
       ON assignment.trainee_id = entry.trainee_id
      AND assignment.mentor_id = $1
      AND assignment.ended_at IS NULL
     JOIN users trainee ON trainee.id = entry.trainee_id
     WHERE entry.status = 'pending'
     ORDER BY entry.occurred_on DESC, entry.created_at DESC
     LIMIT 100`,
    [mentorId],
  );

  return result.rows.map((row) => ({
    entryId: row.entry_id,
    traineeId: row.trainee_id,
    traineeName: row.trainee_name,
    date: row.occurred_on,
    category: row.category,
    activity: row.activity,
    hours: Number(row.hours),
    submittedAt: row.created_at.toISOString(),
  }));
}

export async function getApprovalReview(
  mentorId: string,
  entryId: string,
): Promise<ApprovalReview | null> {
  const database = getDatabase();
  const result = await database.query<{
    entry_id: string;
    trainee_id: string;
    trainee_name: string;
    occurred_on: string;
    category: string;
    activity: string;
    hours: string;
    created_at: Date;
  }>(
    `SELECT entry.id AS entry_id,
            trainee.id AS trainee_id,
            trainee.name AS trainee_name,
            entry.occurred_on::text AS occurred_on,
            entry.category,
            entry.activity,
            entry.hours,
            entry.created_at
     FROM experience_entries entry
     JOIN users trainee ON trainee.id = entry.trainee_id
     JOIN mentor_assignments assignment
       ON assignment.trainee_id = entry.trainee_id
      AND assignment.mentor_id = $1
      AND assignment.ended_at IS NULL
     WHERE entry.id = $2 AND entry.status = 'pending'`,
    [mentorId, entryId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const attachments = await database.query<{
    id: string;
    kind: ReviewAttachment['kind'];
    entry_id: string | null;
    filename: string;
    media_type: string;
    size_bytes: number;
  }>(
    `SELECT id, kind, entry_id, filename, media_type, size_bytes
     FROM trainee_attachments
     WHERE trainee_id = $1
       AND (entry_id = $2 OR (kind = 'certificate' AND entry_id IS NULL))
     ORDER BY kind, created_at`,
    [row.trainee_id, row.entry_id],
  );

  return {
    entry: {
      entryId: row.entry_id,
      traineeId: row.trainee_id,
      traineeName: row.trainee_name,
      date: row.occurred_on,
      category: row.category,
      activity: row.activity,
      hours: Number(row.hours),
      submittedAt: row.created_at.toISOString(),
    },
    attachments: attachments.rows.map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      entryId: attachment.entry_id,
      filename: attachment.filename,
      mediaType: attachment.media_type,
      sizeBytes: attachment.size_bytes,
    })),
  };
}

export async function approveExperienceEntry(mentorId: string, entryId: string) {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      trainee_id: string;
      trainee_name: string;
      mentor_name: string;
      occurred_on: string;
      category: string;
      activity: string;
      hours: string;
      created_at: Date;
      status: 'pending' | 'approved' | 'changes-requested';
    }>(
      `SELECT entry.id,
              entry.trainee_id,
              trainee.name AS trainee_name,
              mentor.name AS mentor_name,
              entry.occurred_on::text AS occurred_on,
              entry.category,
              entry.activity,
              entry.hours,
              entry.created_at,
              entry.status
       FROM experience_entries entry
       JOIN users trainee ON trainee.id = entry.trainee_id
       JOIN users mentor ON mentor.id = $2
       JOIN mentor_assignments assignment
         ON assignment.trainee_id = entry.trainee_id
        AND assignment.mentor_id = mentor.id
        AND assignment.ended_at IS NULL
       WHERE entry.id = $1
       FOR UPDATE OF entry, assignment`,
      [entryId, mentorId],
    );

    const entry = result.rows[0];
    if (!entry) {
      await client.query('ROLLBACK');
      return { kind: 'not-found' as const };
    }
    if (entry.status !== 'pending') {
      await client.query('ROLLBACK');
      return { kind: 'not-pending' as const };
    }

    const keyId = process.env.APPROVAL_SIGNING_KEY_ID;
    if (!keyId) throw new Error('APPROVAL_SIGNING_KEY_ID is not configured.');
    const approvalId = randomUUID();
    const approvedAt = new Date();
    const signed = signApprovalPayload({
      schemaVersion: 1,
      approvalId,
      entryId: entry.id,
      traineeId: entry.trainee_id,
      traineeName: entry.trainee_name,
      mentorId,
      mentorName: entry.mentor_name,
      activity: {
        date: entry.occurred_on,
        category: entry.category,
        description: entry.activity,
        hours: Number(entry.hours),
        submittedAt: entry.created_at.toISOString(),
      },
      approvedAt: approvedAt.toISOString(),
      algorithm: 'Ed25519',
      keyId,
    });

    const update = await client.query(
      `UPDATE experience_entries
       SET status = 'approved'
       WHERE id = $1 AND status = 'pending'`,
      [entry.id],
    );
    if (update.rowCount !== 1) {
      await client.query('ROLLBACK');
      return { kind: 'not-pending' as const };
    }

    await client.query(
      `INSERT INTO approval_audit_events
         (id, entry_id, trainee_id, mentor_id, algorithm, key_id, payload,
          payload_sha256, signature, public_key_pem, approved_at)
       VALUES ($1, $2, $3, $4, 'Ed25519', $5, $6, $7, $8, $9, $10)`,
      [
        approvalId,
        entry.id,
        entry.trainee_id,
        mentorId,
        signed.keyId,
        signed.serializedPayload,
        signed.payloadSha256,
        signed.signature,
        signed.publicKeyPem,
        approvedAt,
      ],
    );
    await client.query(
      `UPDATE mentor_notifications
       SET read_at = COALESCE(read_at, now())
       WHERE mentor_id = $1 AND entry_id = $2`,
      [mentorId, entry.id],
    );
    await client.query('COMMIT');
    return { kind: 'approved' as const, approvalId };
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back approval transaction:', rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }
}
