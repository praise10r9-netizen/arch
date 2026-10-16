import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../../../../lib/database';
import {
  assertUniversityEmailConfigured,
  escapeEmailHtml,
  getAppUrl,
  sendUniversityEmail,
} from '../../../../lib/university-email';
import { createActivationToken, hashActivationToken } from '../../../../lib/university-activation';
import { getAcademicEmailDomain } from '../../../../lib/university-domains';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
    }
    console.error('Unable to read registration request:', error);
    return NextResponse.json({ message: 'Unable to register right now.' }, { status: 500 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ message: 'Registration details are required.' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const role = input.role === undefined ? 'trainee' : input.role;

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ message: 'Name must be between 2 and 120 characters.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
  }

  if (role === 'university_admin') {
    const password = typeof input.password === 'string' ? input.password : '';
    if (!getAcademicEmailDomain(email)) {
      return NextResponse.json(
        { message: 'Use a university email ending in .ac.mw. You will register its domain after signing in.' },
        { status: 400 },
      );
    }
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      return NextResponse.json(
        { message: 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.' },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await getDatabase().query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'university_admin')`,
        [name, email, passwordHash],
      );
      return NextResponse.json({
        universityAdminCreated: true,
        message: 'Your university administrator account is ready. Sign in, then register your university and school email domain in your workspace.',
      }, { status: 201 });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return NextResponse.json(
          { message: 'An account already exists for this email.' },
          { status: 409 },
        );
      }
      console.error('Unable to create university account:', error);
      return NextResponse.json({ message: 'Unable to register this university account right now.' }, { status: 503 });
    }
  }

  if (role !== 'trainee') {
    return NextResponse.json({ message: 'Qualified architect accounts must be provisioned by the Board of Architects.' }, { status: 403 });
  }

  const registrationNumber =
    typeof input.registrationNumber === 'string' ? input.registrationNumber.trim() : '';
  const programType = input.programType;
  if (registrationNumber.length < 3 || registrationNumber.length > 80) {
    return NextResponse.json(
      { message: 'Enter a registration number between 3 and 80 characters.' },
      { status: 400 },
    );
  }
  if (programType !== 'student_attachment' && programType !== 'graduate_training') {
    return NextResponse.json({ message: 'Select a valid university program.' }, { status: 400 });
  }
  const domain = getAcademicEmailDomain(email);
  if (!domain) {
    return NextResponse.json({ message: 'Use a university email ending in .ac.mw.' }, { status: 400 });
  }

  let appUrl: string;
  try {
    appUrl = getAppUrl();
    assertUniversityEmailConfigured();
  } catch (error) {
    console.error('University registration email is not configured:', error);
    return NextResponse.json(
      { message: 'University registration is not configured on this server.' },
      { status: 503 },
    );
  }

  const database = getDatabase();
  const client = await database.connect();
  try {
    const tenantResult = await client.query<{ tenant_id: string; admin_email: string }>(
      `SELECT d.tenant_id, t.admin_email
       FROM university_tenant_domains d
       JOIN university_tenants t ON t.id = d.tenant_id
       WHERE d.domain = $1`,
      [domain],
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        { message: 'Your university domain is not registered. Contact your university administrator.' },
        { status: 403 },
      );
    }
    const tenantAdminEmail = tenantResult.rows[0].admin_email;

    const existingAccount = await client.query(
      `SELECT 1 FROM users WHERE lower(email) = $1 OR lower(alternative_email) = $1
       UNION ALL
       SELECT 1 FROM trainee_profiles
        WHERE lower(registration_number) = lower($2)
       UNION ALL
       SELECT 1 FROM university_student_roster r
       WHERE (lower(r.school_email) = $1 OR lower(r.registration_number) = lower($2))
         AND NOT (r.tenant_id = $3 AND lower(r.school_email) = $1
                  AND lower(r.registration_number) = lower($2) AND r.status = 'available')
       LIMIT 1`,
      [email, registrationNumber, tenantId],
    );
    if (existingAccount.rowCount) {
      return NextResponse.json(
        { message: 'An account already exists for this email or registration number.' },
        { status: 409 },
      );
    }

    await client.query('BEGIN');
    const rosterResult = await client.query<{
      id: string;
      tenant_id: string;
      registration_number: string;
      full_name: string;
      school_email: string;
      program_type: 'student_attachment' | 'graduate_training';
      enrollment_status: 'ongoing' | 'graduated';
    }>(
      `SELECT r.id, r.tenant_id, r.registration_number, r.full_name, r.school_email,
              r.program_type, r.enrollment_status
       FROM university_student_roster r
       JOIN university_tenant_domains d ON d.tenant_id = r.tenant_id
       WHERE d.domain = $1 AND lower(r.school_email) = $2
         AND lower(r.registration_number) = lower($3) AND r.status = 'available'
       FOR UPDATE OF r`,
      [domain, email, registrationNumber],
    );
    const rosterStudent = rosterResult.rows[0];
    if (rosterStudent) {
      const applicationResult = await client.query<{ id: string }>(
        `INSERT INTO university_applications
           (full_name, registration_number, school_email, program_type, enrollment_status, status,
            reviewed_at, reviewer_email, tenant_id, roster_id)
         VALUES ($1, $2, $3, $4, $5, 'approved', now(), 'domain-roster-simulation', $6, $7)
         RETURNING id`,
        [rosterStudent.full_name, rosterStudent.registration_number, rosterStudent.school_email,
          rosterStudent.program_type, rosterStudent.enrollment_status,
          rosterStudent.tenant_id, rosterStudent.id],
      );
      const applicationId = applicationResult.rows[0].id;
      const activationToken = createActivationToken();
      await client.query(
        `INSERT INTO university_activation_tokens (application_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '48 hours')`,
        [applicationId, hashActivationToken(activationToken)],
      );
      await client.query(
        `UPDATE university_student_roster SET status = 'invited', application_id = $2 WHERE id = $1`,
        [rosterStudent.id, applicationId],
      );
      await client.query('COMMIT');

      const activationUrl = `${appUrl}/register/complete?token=${encodeURIComponent(activationToken)}`;
      try {
        await sendUniversityEmail(
          rosterStudent.school_email,
          'Your university student account is ready',
          `<p>Hello ${escapeEmailHtml(rosterStudent.full_name)},</p>
           <p>Your school email and registration number matched the university roster.</p>
           <p><a href="${activationUrl}">Set your password and activate your account</a></p>
           <p>This private link expires in 48 hours and can be used once.</p>`,
        );
      } catch (error) {
        console.error('Roster matched but student activation email failed:', applicationId, error);
        return NextResponse.json(
          { message: 'Your university details matched, but we could not send the activation link. Contact the university administrator to resend it.' },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { applicationSubmitted: true, message: 'Your university details matched. Check your school email for a private activation link.' },
        { status: 201 },
      );
    }

    const applicationResult = await client.query<{ id: string }>(
      `INSERT INTO university_applications
         (full_name, registration_number, school_email, program_type, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name, registrationNumber, email, programType, tenantId],
    );
    await client.query('COMMIT');

    try {
      await sendUniversityEmail(
        tenantAdminEmail,
        'University account registration requires review',
        `<p>A student request needs manual review because it did not match an available roster entry.</p>
         <p><strong>Name:</strong> ${escapeEmailHtml(name)}<br>
         <strong>Registration number:</strong> ${escapeEmailHtml(registrationNumber)}<br>
         <strong>School email:</strong> ${escapeEmailHtml(email)}<br>
         <strong>Program:</strong> ${programType === 'student_attachment' ? 'Student attachment' : 'Graduate training'}</p>
         <p><a href="${appUrl}/university-admin">Review the request</a></p>`,
      );
    } catch (error) {
      console.error('Application saved but admin email delivery failed:', applicationResult.rows[0].id, error);
      return NextResponse.json(
        { message: 'Your request was saved, but the university could not be notified. Please contact the university administrator.' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { applicationSubmitted: true, message: 'Your request needs manual university review. The university will email you after verification.' },
      { status: 201 },
    );
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back failed university registration:', rollbackError);
    });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json(
        { message: 'An account or request already exists for this email or registration number.' },
        { status: 409 },
      );
    }
    console.error('University registration request failed:', error);
    return NextResponse.json({ message: 'Unable to submit your request right now.' }, { status: 503 });
  } finally {
    client.release();
  }
}
