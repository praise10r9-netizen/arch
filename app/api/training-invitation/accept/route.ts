import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getDatabase } from '../../../../lib/database';
import { hashActivationToken } from '../../../../lib/university-activation';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invitation acceptance details are required.' }, { status: 400 });
  }
  const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const token = typeof input.token === 'string' ? input.token : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ message: 'This invitation link is invalid or expired.' }, { status: 400 });
  }
  if (!password || Buffer.byteLength(password, 'utf8') > 72) {
    return NextResponse.json({ message: 'Enter your trainee account password.' }, { status: 400 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const invitationResult = await client.query<{
      id: string;
      architect_id: string;
      trainee_email: string;
      organization_name: string;
      enrollment_status: 'ongoing' | 'graduated';
      expires_at: Date;
    }>(
      `SELECT id, architect_id, trainee_email, organization_name, enrollment_status, expires_at
       FROM qualified_architect_invitations
       WHERE token_hash = $1 AND status = 'pending'
       FOR UPDATE`,
      [hashActivationToken(token)],
    );
    const invitation = invitationResult.rows[0];
    if (!invitation || invitation.expires_at <= new Date()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ message: 'This invitation link is invalid or expired.' }, { status: 400 });
    }

    const traineeResult = await client.query<{
      id: string;
      password_hash: string;
    }>(
      `SELECT user_account.id, user_account.password_hash
       FROM users user_account
       JOIN trainee_profiles profile ON profile.user_id = user_account.id
       WHERE lower(user_account.email) = $1
         AND user_account.role = 'trainee'
         AND profile.enrollment_status = $2
         AND profile.program_type = CASE WHEN $2 = 'graduated'
           THEN 'graduate_training' ELSE 'student_attachment' END
       FOR UPDATE OF user_account, profile`,
      [invitation.trainee_email.toLowerCase(), invitation.enrollment_status],
    );
    const trainee = traineeResult.rows[0];
    if (!trainee || !(await bcrypt.compare(password, trainee.password_hash))) {
      await client.query('ROLLBACK');
      return NextResponse.json({
        message: invitation.enrollment_status === 'graduated'
          ? 'The password does not match a graduate trainee account for this invited email.'
          : 'The password does not match an ongoing student internship account for this invited email.',
      }, { status: 401 });
    }

    await client.query(
      `INSERT INTO mentor_assignments
         (trainee_id, mentor_id, assigned_by, assignment_source, organization_name)
       VALUES ($1, $2, $2, 'organization', $3)`,
      [trainee.id, invitation.architect_id, invitation.organization_name],
    );
    await client.query(
      `UPDATE qualified_architect_invitations
       SET status = 'accepted', trainee_id = $2, accepted_at = now()
       WHERE id = $1`,
      [invitation.id, trainee.id],
    );
    await client.query('COMMIT');
    return NextResponse.json({ accepted: true, message: 'You accepted the qualified architect relationship.' });
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back training invitation acceptance:', rollbackError);
    });
    if (isUniqueViolation(error)) {
      return NextResponse.json({ message: 'You already have an active qualified architect relationship. Contact your university administrator if this needs to change.' }, { status: 409 });
    }
    unstable_rethrow(error);
    console.error('Unable to accept qualified architect invitation:', error);
    return NextResponse.json({ message: 'Unable to accept this invitation.' }, { status: 503 });
  } finally {
    client.release();
  }
}
