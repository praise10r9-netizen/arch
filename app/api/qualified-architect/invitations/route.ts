import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';
import { createActivationToken, hashActivationToken } from '../../../../lib/university-activation';
import { escapeEmailHtml, getAppUrl, sendUniversityEmail } from '../../../../lib/university-email';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in as a qualified architect.' }, { status: 401 });
    if (user.role !== 'qualified_architect') {
      return NextResponse.json({ message: 'Qualified architect access is required.' }, { status: 403 });
    }
    const database = getDatabase();
    const [result, activeResult] = await Promise.all([database.query<{
      id: string;
      email: string;
      name: string | null;
      organization: string;
      enrollment_status: 'ongoing' | 'graduated';
      status: 'pending' | 'accepted' | 'expired';
      created_at: Date;
      expires_at: Date;
      accepted_at: Date | null;
    }>(
      `SELECT invitation.id,
              invitation.trainee_email AS email,
              trainee.name,
              invitation.organization_name AS organization,
              invitation.enrollment_status,
              invitation.status,
              invitation.created_at,
              invitation.expires_at,
              invitation.accepted_at
       FROM qualified_architect_invitations invitation
       LEFT JOIN users trainee ON trainee.id = invitation.trainee_id
       WHERE invitation.architect_id = $1
       ORDER BY invitation.created_at DESC
       LIMIT 100`,
      [user.id],
    ), database.query<{
      id: string;
      email: string;
      name: string;
      organization: string | null;
      program_type: 'student_attachment' | 'graduate_training';
      enrollment_status: 'ongoing' | 'graduated';
      assigned_at: Date;
    }>(
      `SELECT trainee.id, trainee.email, trainee.name,
              assignment.organization_name AS organization,
              profile.program_type,
              profile.enrollment_status,
              assignment.assigned_at
       FROM mentor_assignments assignment
       JOIN users trainee ON trainee.id = assignment.trainee_id
       JOIN trainee_profiles profile ON profile.user_id = trainee.id
       WHERE assignment.mentor_id = $1 AND assignment.ended_at IS NULL
       ORDER BY trainee.name, trainee.email`,
      [user.id],
    )]);
    return NextResponse.json({
      activeTrainees: activeResult.rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        organization: row.organization,
        programType: row.program_type,
        enrollmentStatus: row.enrollment_status,
        assignedAt: row.assigned_at.toISOString(),
      })),
      invitations: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        traineeName: row.name,
        organization: row.organization,
        enrollmentStatus: row.enrollment_status,
        status: row.status === 'pending' && row.expires_at <= new Date() ? 'expired' : row.status,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        acceptedAt: row.accepted_at?.toISOString() ?? null,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to load qualified architect invitations:', error);
    return NextResponse.json({ message: 'Unable to load mentorship invitations.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in as a qualified architect.' }, { status: 401 });
    if (user.role !== 'qualified_architect') {
      return NextResponse.json({ message: 'Qualified architect access is required.' }, { status: 403 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: 'Invitation details are required.' }, { status: 400 });
    }
    const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const organization = typeof input.organization === 'string' ? input.organization.trim() : '';
    if (typeof input.isGraduate !== 'boolean') {
      return NextResponse.json({ message: 'Select whether the trainee has graduated.' }, { status: 400 });
    }
    const enrollmentStatus = input.isGraduate ? 'graduated' : 'ongoing';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ message: 'Enter a valid trainee email address.' }, { status: 400 });
    }
    if (organization.length < 2 || organization.length > 160) {
      return NextResponse.json({ message: 'Enter the organization where the training relationship applies.' }, { status: 400 });
    }

    const appUrl = getAppUrl();
    const token = createActivationToken();
    const client = await getDatabase().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE qualified_architect_invitations
         SET status = 'expired'
         WHERE architect_id = $1
           AND lower(trainee_email) = $2
           AND status = 'pending'
           AND expires_at <= now()`,
        [user.id, email],
      );
      const existingAssignment = await client.query(
        `SELECT 1
         FROM users trainee
         JOIN mentor_assignments assignment ON assignment.trainee_id = trainee.id
         WHERE lower(trainee.email) = $1
           AND assignment.ended_at IS NULL
         LIMIT 1`,
        [email],
      );
      if (existingAssignment.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ message: 'This trainee already has an active qualified architect relationship.' }, { status: 409 });
      }
      const invite = await client.query(
        `INSERT INTO qualified_architect_invitations
           (architect_id, trainee_email, organization_name, enrollment_status, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '48 hours')
         RETURNING id`,
        [user.id, email, organization, enrollmentStatus, hashActivationToken(token)],
      );
      const acceptanceUrl = `${appUrl}/training-invitation?token=${encodeURIComponent(token)}`;
      const trainingTrack = input.isGraduate
        ? 'two-year graduate training'
        : 'pre-graduate academic internship';
      await sendUniversityEmail(
        email,
        'A qualified architect invited you to connect on ArchPath',
        `<p>Hello,</p>
         <p>${escapeEmailHtml(user.name)} has invited you to connect for a ${trainingTrack} placement at ${escapeEmailHtml(organization)}.</p>
         <p>Your training logs will be shared with this architect only after you accept.</p>
         <p><a href="${acceptanceUrl}">Review and accept this invitation</a></p>
         <p>This private link expires in 48 hours and can only be used once. Sign in with your trainee account to accept.</p>`,
      );
      await client.query('COMMIT');
      return NextResponse.json({ invitationId: invite.rows[0].id, message: 'Invitation sent.' }, { status: 201 });
    } catch (error) {
      await client.query('ROLLBACK').catch((rollbackError: unknown) => {
        console.error('Unable to roll back qualified architect invitation:', rollbackError);
      });
      if (isUniqueViolation(error)) {
        return NextResponse.json({ message: 'A pending invitation already exists for this trainee.' }, { status: 409 });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to send qualified architect invitation:', error);
    return NextResponse.json({ message: 'Unable to send this invitation.' }, { status: 503 });
  }
}
