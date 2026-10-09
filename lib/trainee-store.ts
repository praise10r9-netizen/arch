import 'server-only';
import { getDatabase } from './database';
import {
  TRAINING_CATEGORIES,
  type NewTrainingEntry,
  type TraineeAttachment,
  type TraineeWorkspaceData,
  type TrainingEntry,
} from './trainee-types';

export async function getTraineeWorkspace(
  traineeId: string,
): Promise<TraineeWorkspaceData | null> {
  const database = getDatabase();
  const profileResult = await database.query<{
    id: string;
    name: string;
    email: string;
    stage: string;
  }>(
    `SELECT u.id, u.name, u.email, p.stage
     FROM users u
     JOIN trainee_profiles p ON p.user_id = u.id
     WHERE u.id = $1 AND u.role = 'trainee'`,
    [traineeId],
  );
  const profile = profileResult.rows[0];
  if (!profile) return null;

  const [entriesResult, attachmentsResult] = await Promise.all([
    database.query<{
      id: string;
      date: string;
      category: TrainingEntry['category'];
      activity: string;
      hours: string;
      status: TrainingEntry['status'];
      created_at: Date;
    }>(
      `SELECT id, occurred_on::text AS date, category, activity, hours, status, created_at
       FROM experience_entries
       WHERE trainee_id = $1
       ORDER BY occurred_on DESC, created_at DESC`,
      [traineeId],
    ),
    database.query<{
      id: string;
      kind: TraineeAttachment['kind'];
      entry_id: string | null;
      filename: string;
      media_type: string;
      size_bytes: number;
      created_at: Date;
    }>(
      `SELECT id, kind, entry_id, filename, media_type, size_bytes, created_at
       FROM trainee_attachments
       WHERE trainee_id = $1
       ORDER BY created_at DESC`,
      [traineeId],
    ),
  ]);

  return {
    trainee: profile,
    categories: [...TRAINING_CATEGORIES],
    entries: entriesResult.rows.map((entry) => ({
      id: entry.id,
      date: entry.date,
      category: entry.category,
      activity: entry.activity,
      hours: Number(entry.hours),
      status: entry.status,
      createdAt: entry.created_at.toISOString(),
    })),
    attachments: attachmentsResult.rows.map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      entryId: attachment.entry_id,
      filename: attachment.filename,
      mediaType: attachment.media_type,
      sizeBytes: attachment.size_bytes,
      createdAt: attachment.created_at.toISOString(),
    })),
  };
}

export async function addTrainingEntry(
  traineeId: string,
  input: NewTrainingEntry,
): Promise<{ entry: TrainingEntry; notificationCreated: boolean }> {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      date: string;
      category: TrainingEntry['category'];
      activity: string;
      hours: string;
      status: TrainingEntry['status'];
      created_at: Date;
    }>(
      `INSERT INTO experience_entries (trainee_id, occurred_on, category, activity, hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, occurred_on::text AS date, category, activity, hours, status, created_at`,
      [traineeId, input.date, input.category, input.activity, input.hours],
    );
    const row = result.rows[0];
    const assignedMentor = await client.query<{ mentor_id: string }>(
      `SELECT mentor_id
       FROM mentor_assignments
       WHERE trainee_id = $1 AND ended_at IS NULL`,
      [traineeId],
    );
    const mentorId = assignedMentor.rows[0]?.mentor_id;
    if (mentorId) {
      await client.query(
        `INSERT INTO mentor_notifications (mentor_id, trainee_id, entry_id)
         VALUES ($1, $2, $3)`,
        [mentorId, traineeId, row.id],
      );
    }
    await client.query('COMMIT');
    return {
      entry: {
        id: row.id,
        date: row.date,
        category: row.category,
        activity: row.activity,
        hours: Number(row.hours),
        status: row.status,
        createdAt: row.created_at.toISOString(),
      },
      notificationCreated: Boolean(mentorId),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back experience save:', rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }
}
