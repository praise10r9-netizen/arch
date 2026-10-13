import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, setSessionCookie } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';
import { hashActivationToken } from '../../../../lib/university-activation';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Activation details are required.' }, { status: 400 });
  }
  const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const token = typeof input.token === 'string' ? input.token : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ message: 'This invitation link is invalid or expired.' }, { status: 400 });
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return NextResponse.json(
      { message: 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.' },
      { status: 400 },
    );
  }
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    return NextResponse.json({ message: 'Account activation is not configured on this server.' }, { status: 503 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      full_name: string;
      school_email: string;
      registration_number: string;
      program_type: 'student_attachment' | 'graduate_training';
      roster_id: string | null;
    }>(
      `SELECT a.id, a.full_name, a.school_email, a.registration_number, a.program_type, a.roster_id
       FROM university_activation_tokens t
       JOIN university_applications a ON a.id = t.application_id
       WHERE t.token_hash = $1 AND t.consumed_at IS NULL AND t.expires_at > now()
         AND a.status = 'approved'
       FOR UPDATE OF t, a`,
      [hashActivationToken(token)],
    );
    const application = result.rows[0];
    if (!application) {
      await client.query('ROLLBACK');
      return NextResponse.json({ message: 'This invitation link is invalid or expired.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query<{ id: string; name: string; email: string }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'trainee')
       RETURNING id, name, email`,
      [application.full_name, application.school_email, passwordHash],
    );
    const user = userResult.rows[0];
    const stage = application.program_type === 'graduate_training' ? 'Two-year Graduate Training' : 'Student Attachment';
    await client.query(
      `INSERT INTO trainee_profiles (user_id, stage, registration_number, program_type)
       VALUES ($1, $2, $3, $4)`,
      [user.id, stage, application.registration_number, application.program_type],
    );
    await client.query(
      `UPDATE university_activation_tokens SET consumed_at = now() WHERE application_id = $1`,
      [application.id],
    );
    await client.query(`UPDATE university_applications SET status = 'activated' WHERE id = $1`, [application.id]);
    if (application.roster_id) {
      await client.query(
        `UPDATE university_student_roster
         SET status = 'activated', user_id = $2, activated_at = now()
         WHERE id = $1`,
        [application.roster_id, user.id],
      );
    }
    const sessionToken = await createSessionToken(user.id, 'trainee', client);
    await client.query('COMMIT');

    const response = NextResponse.json({ user: { ...user, role: 'trainee' } });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back account activation:', rollbackError);
    });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ message: 'An account already exists for this email or registration number.' }, { status: 409 });
    }
    console.error('Unable to activate university account:', error);
    return NextResponse.json({ message: 'Unable to activate your account right now.' }, { status: 503 });
  } finally {
    client.release();
  }
}