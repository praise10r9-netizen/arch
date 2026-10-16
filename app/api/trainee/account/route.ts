import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ message: 'Please sign in to continue.' }, { status: 401 });
  if (user.role !== 'trainee') {
    return NextResponse.json({ message: 'This account setting is for trainees.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Enter an alternative email address.' }, { status: 400 });
  }
  const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const alternativeEmail = typeof input.alternativeEmail === 'string'
    ? input.alternativeEmail.trim().toLowerCase()
    : '';
  if (alternativeEmail && (
    alternativeEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alternativeEmail)
  )) {
    return NextResponse.json({ message: 'Enter a valid alternative email address.' }, { status: 400 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const profile = await client.query<{ enrollment_status: 'ongoing' | 'graduated' }>(
      `SELECT enrollment_status FROM trainee_profiles WHERE user_id = $1 FOR UPDATE`,
      [user.id],
    );
    if (!profile.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ message: 'Trainee profile was not found.' }, { status: 404 });
    }

    const graduated = profile.rows[0].enrollment_status === 'graduated';
    const result = await client.query<{ email: string; alternative_email: string | null }>(
      `UPDATE users
       SET email = CASE WHEN $2 <> '' AND $3 THEN $2 ELSE email END,
           alternative_email = CASE WHEN $2 <> '' AND $3 THEN NULL ELSE NULLIF($2, '') END
       WHERE id = $1
       RETURNING email, alternative_email`,
      [user.id, alternativeEmail, graduated],
    );
    await client.query('COMMIT');
    return NextResponse.json({
      email: result.rows[0].email,
      alternativeEmail: result.rows[0].alternative_email,
      message: graduated && alternativeEmail
        ? 'Your account email has been changed to your alternative email.'
        : 'Alternative email saved.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ message: 'That email address is already assigned to an account.' }, { status: 409 });
    }
    console.error('Unable to update trainee account email:', error);
    return NextResponse.json({ message: 'Unable to update your account email.' }, { status: 503 });
  } finally {
    client.release();
  }
}