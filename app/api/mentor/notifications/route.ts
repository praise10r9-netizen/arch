import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';

interface MentorNotificationRow {
  id: string;
  trainee_name: string;
  entry_category: string;
  activity: string;
  occurred_on: string;
  hours: string;
  created_at: Date;
  read_at: Date | null;
}

async function getMentor(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ message: 'Sign in to view notifications.' }, { status: 401 }),
    };
  }
  if (user.role !== 'mentor') {
    return {
      user: null,
      response: NextResponse.json({ message: 'Mentor access is required.' }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const { user, response } = await getMentor(request);
    if (!user) return response;

    const result = await getDatabase().query<MentorNotificationRow>(
      `SELECT n.id,
              trainee.name AS trainee_name,
              entry.category AS entry_category,
              entry.activity,
              entry.occurred_on::text AS occurred_on,
              entry.hours,
              n.created_at,
              n.read_at
       FROM mentor_notifications n
       JOIN users trainee ON trainee.id = n.trainee_id
       JOIN experience_entries entry ON entry.id = n.entry_id
       WHERE n.mentor_id = $1
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 30`,
      [user.id],
    );
    const unreadResult = await getDatabase().query<{ count: string }>(
      'SELECT count(*)::text AS count FROM mentor_notifications WHERE mentor_id = $1 AND read_at IS NULL',
      [user.id],
    );

    return NextResponse.json(
      {
        unreadCount: Number(unreadResult.rows[0].count),
        notifications: result.rows.map((row) => ({
          id: row.id,
          traineeName: row.trainee_name,
          category: row.entry_category,
          activity: row.activity,
          date: row.occurred_on,
          hours: Number(row.hours),
          createdAt: row.created_at.toISOString(),
          readAt: row.read_at?.toISOString() ?? null,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Unable to load mentor notifications:', error);
    return NextResponse.json({ message: 'Unable to load notifications right now.' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
    }
    console.error('Unable to read notification update:', error);
    return NextResponse.json({ message: 'Unable to read the notification update.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string') {
    return NextResponse.json({ message: 'A notification id is required.' }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
    return NextResponse.json({ message: 'Enter a valid notification id.' }, { status: 400 });
  }

  try {
    const { user, response } = await getMentor(request);
    if (!user) return response;
    const result = await getDatabase().query(
      `UPDATE mentor_notifications
       SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND mentor_id = $2`,
      [body.id, user.id],
    );
    if (!result.rowCount) {
      return NextResponse.json({ message: 'Notification not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unable to mark mentor notification as read:', error);
    return NextResponse.json({ message: 'Unable to update this notification.' }, { status: 503 });
  }
}
