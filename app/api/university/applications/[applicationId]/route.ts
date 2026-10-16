import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../lib/database';
import { requireUniversityAdmin } from '../../../../../lib/university-admin';
import { createActivationToken, hashActivationToken } from '../../../../../lib/university-activation';
import {
  assertUniversityEmailConfigured,
  escapeEmailHtml,
  getAppUrl,
  sendUniversityEmail,
} from '../../../../../lib/university-email';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  const admin = await requireUniversityAdmin(request);
  if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });
  if (!admin.universityTenantId) {
    return NextResponse.json({ message: 'Set up your university workspace before reviewing requests.' }, { status: 409 });
  }

  let appUrl: string;
  try {
    appUrl = getAppUrl();
    assertUniversityEmailConfigured();
  } catch (error) {
    console.error('University invitation email is not configured:', error);
    return NextResponse.json({ message: 'University email is not configured on this server.' }, { status: 503 });
  }

  const { applicationId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return NextResponse.json({ message: 'Invalid application.' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'A review decision is required.' }, { status: 400 });
  }
  const action = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).action : null;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ message: 'Select approve or reject.' }, { status: 400 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      full_name: string;
      registration_number: string;
      school_email: string;
      program_type: 'student_attachment' | 'graduate_training';
      status: string;
      roster_id: string | null;
    }>(
      `SELECT id, full_name, registration_number, school_email, program_type, status, roster_id
       FROM university_applications
       WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [applicationId, admin.universityTenantId],
    );
    const application = result.rows[0];
    if (!application || !['pending', 'approved'].includes(application.status)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ message: 'This request is no longer awaiting review.' }, { status: 409 });
    }

    if (action === 'reject') {
      if (application.status !== 'pending') {
        await client.query('ROLLBACK');
        return NextResponse.json({ message: 'An approved invitation cannot be rejected here.' }, { status: 409 });
      }
      await client.query(
        `UPDATE university_applications SET status = 'rejected', reviewed_at = now(), reviewer_email = $2
         WHERE id = $1`,
        [applicationId, admin.email],
      );
      if (application.roster_id) {
        await client.query(
          `UPDATE university_student_roster
           SET status = 'available', application_id = NULL
           WHERE id = $1 AND status = 'invited'`,
          [application.roster_id],
        );
      }
      await client.query('COMMIT');
      return NextResponse.json({ message: 'Request rejected.' });
    }

    const activationToken = createActivationToken();
    await client.query(
      `UPDATE university_applications SET status = 'approved', reviewed_at = now(), reviewer_email = $2
       WHERE id = $1`,
      [applicationId, admin.email],
    );
    if (application.roster_id) {
      await client.query(
        `UPDATE university_student_roster
         SET status = 'invited', application_id = $2
         WHERE id = $1 AND status <> 'activated'`,
        [application.roster_id, applicationId],
      );
    }
    await client.query(
      `INSERT INTO university_activation_tokens (application_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '48 hours')
       ON CONFLICT (application_id) DO UPDATE
         SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at,
             consumed_at = NULL, created_at = now()`,
      [applicationId, hashActivationToken(activationToken)],
    );
    await client.query('COMMIT');

    const activationUrl = `${appUrl}/register/complete?token=${encodeURIComponent(activationToken)}`;
    try {
      await sendUniversityEmail(
        application.school_email,
        'Your university account has been approved',
        `<p>Hello ${escapeEmailHtml(application.full_name)},</p>
         <p>Your university verified your registration details. Use the secure link below to set your password and sign in. This link expires in 48 hours and can be used once.</p>
         <p><a href="${activationUrl}">Complete registration and sign in</a></p>
         <p>If you did not request this account, you can ignore this email.</p>`,
      );
    } catch (error) {
      console.error('Application approved but activation email delivery failed:', applicationId, error);
      return NextResponse.json(
        { message: 'Approved, but the email could not be delivered. Use approve again to issue a fresh link.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ message: 'Approved. A sign-in link was emailed to the applicant.' });
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back application review:', rollbackError);
    });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ message: 'This email or registration number is already registered.' }, { status: 409 });
    }
    console.error('Unable to review university application:', error);
    return NextResponse.json({ message: 'Unable to update this request.' }, { status: 503 });
  } finally {
    client.release();
  }
}