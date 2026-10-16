import { parse } from 'csv-parse/sync';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../../lib/database';
import { normalizeAcademicDomain } from '../../../../../../lib/university-domains';
import {
  canManageUniversityTenant,
  requireUniversityAdmin,
} from '../../../../../../lib/university-admin';

interface RosterRow {
  registration_number?: string;
  full_name?: string;
  school_email?: string;
  program_type?: string;
  enrollment_status?: string;
  cohort?: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
) {
  const admin = await requireUniversityAdmin(request);
  if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });

  const { tenantId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    return NextResponse.json({ message: 'Invalid university.' }, { status: 400 });
  }
  if (!canManageUniversityTenant(admin, tenantId)) {
    return NextResponse.json({ message: 'This university workspace is not available to your account.' }, { status: 404 });
  }

  try {
    const result = await getDatabase().query(
      `SELECT id, registration_number AS "registrationNumber", full_name AS "fullName",
              school_email AS "schoolEmail", program_type AS "programType",
              enrollment_status AS "enrollmentStatus", status AS "accountStatus",
              cohort, activated_at AS "activatedAt"
       FROM university_student_roster
       WHERE tenant_id = $1
       ORDER BY lower(full_name), lower(registration_number)`,
      [tenantId],
    );
    return NextResponse.json({ roster: result.rows }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Unable to load university roster:', error);
    return NextResponse.json({ message: 'Unable to load the student roster.' }, { status: 503 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
) {
  const admin = await requireUniversityAdmin(request);
  if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });

  const { tenantId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    return NextResponse.json({ message: 'Invalid university.' }, { status: 400 });
  }
  if (!canManageUniversityTenant(admin, tenantId)) {
    return NextResponse.json({ message: 'This university workspace is not available to your account.' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: 'Choose a CSV roster file.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 1 || file.size > 1_000_000) {
    return NextResponse.json({ message: 'Roster CSV must be between 1 byte and 1 MB.' }, { status: 400 });
  }

  const tenantResult = await getDatabase().query<{ domain: string }>(
    `SELECT domain FROM university_tenant_domains WHERE tenant_id = $1`,
    [tenantId],
  );
  const domain = tenantResult.rows[0]?.domain;
  if (!domain) return NextResponse.json({ message: 'University workspace not found.' }, { status: 404 });

  let rows: RosterRow[];
  try {
    rows = parse(await file.text(), {
      bom: true,
      columns: true,
      max_record_size: 8192,
      skip_empty_lines: true,
      trim: true,
    }) as RosterRow[];
  } catch {
    return NextResponse.json({ message: 'The CSV could not be parsed. Check its headers and quoting.' }, { status: 400 });
  }
  if (!rows.length || rows.length > 5000) {
    return NextResponse.json({ message: 'A roster must contain between 1 and 5,000 student rows.' }, { status: 400 });
  }

  const seenRegistrationNumbers = new Set<string>();
  const seenEmails = new Set<string>();
  const validatedRows: {
    registrationNumber: string;
    fullName: string;
    email: string;
    programType: string;
    enrollmentStatus: 'ongoing' | 'graduated';
    cohort: string | null;
  }[] = [];
  for (const [index, row] of rows.entries()) {
    const registrationNumber = row.registration_number?.trim() ?? '';
    const fullName = row.full_name?.trim() ?? '';
    const email = row.school_email?.trim().toLowerCase() ?? '';
    const programType = row.program_type?.trim() ?? '';
    const enrollmentStatus = row.enrollment_status?.trim().toLowerCase() ?? '';
    const emailDomain = email.split('@').at(-1) ?? '';
    if (
      registrationNumber.length < 3 || registrationNumber.length > 80 ||
      fullName.length < 2 || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      normalizeAcademicDomain(emailDomain) !== domain ||
      !['student_attachment', 'graduate_training'].includes(programType) ||
      !['ongoing', 'graduated'].includes(enrollmentStatus)
    ) {
      return NextResponse.json(
        { message: `Roster row ${index + 2} is invalid. Check registration number, name, exact ${domain} email, program_type, and enrollment_status (ongoing or graduated).` },
        { status: 400 },
      );
    }
    const normalizedRegistrationNumber = registrationNumber.toLowerCase();
    if (seenRegistrationNumbers.has(normalizedRegistrationNumber) || seenEmails.has(email)) {
      return NextResponse.json({ message: `Roster row ${index + 2} duplicates an email or registration number in this file.` }, { status: 400 });
    }
    seenRegistrationNumbers.add(normalizedRegistrationNumber);
    seenEmails.add(email);
    validatedRows.push({
      registrationNumber,
      fullName,
      email,
      programType,
      enrollmentStatus: enrollmentStatus as 'ongoing' | 'graduated',
      cohort: row.cohort?.trim().slice(0, 80) || null,
    });
  }

  const client = await getDatabase().connect();
  let importedCount = 0;
  let updatedCount = 0;
  try {
    await client.query('BEGIN');
    for (const [rowIndex, row] of validatedRows.entries()) {
      const existingResult = await client.query<{
        id: string;
        tenant_id: string;
        registration_number: string;
        school_email: string;
        user_id: string | null;
      }>(
        `SELECT id, tenant_id, registration_number, school_email, user_id
         FROM university_student_roster
         WHERE lower(registration_number) = lower($1) OR lower(school_email) = $2
         FOR UPDATE`,
        [row.registrationNumber, row.email],
      );
      const existing = existingResult.rows[0];
      if (existing && (
        existing.tenant_id !== tenantId ||
        existing.registration_number.toLowerCase() !== row.registrationNumber.toLowerCase() ||
        existing.school_email.toLowerCase() !== row.email
      )) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          message: `Registration number or email in this file is already assigned to a different roster entry (row ${rowIndex + 2}). No rows were changed.`,
        }, { status: 409 });
      }
      const duplicateAccount = await client.query(
        `SELECT u.id
         FROM users u
         LEFT JOIN trainee_profiles p ON p.user_id = u.id
         WHERE (lower(u.email) = $2 OR lower(u.alternative_email) = $2
                OR lower(p.registration_number) = lower($1))
           AND u.id IS DISTINCT FROM $3
         LIMIT 1
         FOR UPDATE OF u`,
        [row.registrationNumber, row.email, existing?.user_id ?? null],
      );
      if (duplicateAccount.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          message: `Email or registration number in row ${rowIndex + 2} is already assigned to another account. No rows were changed.`,
        }, { status: 409 });
      }
      const conflictingApplication = await client.query<{
        tenant_id: string | null;
        registration_number: string;
        school_email: string;
      }>(
        `SELECT tenant_id, registration_number, school_email
         FROM university_applications
         WHERE status IN ('pending', 'approved')
           AND (lower(school_email) = $2 OR lower(registration_number) = lower($1))
         LIMIT 1
         FOR UPDATE`,
        [row.registrationNumber, row.email],
      );
      const applicationConflict = conflictingApplication.rows[0];
      if (applicationConflict && (
        applicationConflict.tenant_id !== tenantId ||
        applicationConflict.registration_number.toLowerCase() !== row.registrationNumber.toLowerCase() ||
        applicationConflict.school_email.toLowerCase() !== row.email
      )) {
        await client.query('ROLLBACK');
        return NextResponse.json({
          message: `Email or registration number in row ${rowIndex + 2} belongs to a different pending request. No rows were changed.`,
        }, { status: 409 });
      }

      let rosterId: string;
      if (existing) {
        const profile = existing.user_id
          ? await client.query('SELECT 1 FROM trainee_profiles WHERE user_id = $1', [existing.user_id])
          : null;
        if (existing.user_id && profile?.rowCount) {
          const otherAccount = await client.query(
            `SELECT 1 FROM users u
             JOIN trainee_profiles p ON p.user_id = u.id
             WHERE u.id = $1
               AND (lower(u.email) = $2 OR lower(p.registration_number) = lower($3))`,
            [existing.user_id, row.email, row.registrationNumber],
          );
          if (!otherAccount.rowCount) {
            await client.query('ROLLBACK');
            return NextResponse.json({ message: 'The roster identity no longer matches its activated account.' }, { status: 409 });
          }
          await client.query(
            `UPDATE trainee_profiles
             SET program_type = $2, enrollment_status = $3,
                 stage = CASE WHEN $2 = 'graduate_training'
                   THEN 'Two-year Graduate Training' ELSE 'Student Attachment' END
             WHERE user_id = $1`,
            [existing.user_id, row.programType, row.enrollmentStatus],
          );
          if (row.enrollmentStatus === 'graduated') {
            await client.query(
              `UPDATE users SET email = alternative_email, alternative_email = NULL
               WHERE id = $1 AND alternative_email IS NOT NULL`,
              [existing.user_id],
            );
          }
        }
        await client.query(
          `UPDATE university_student_roster
           SET full_name = $2, program_type = $3, enrollment_status = $4, cohort = $5
           WHERE id = $1`,
          [existing.id, row.fullName, row.programType, row.enrollmentStatus, row.cohort],
        );
        rosterId = existing.id;
        updatedCount += 1;
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO university_student_roster
             (tenant_id, registration_number, full_name, school_email, program_type,
              enrollment_status, cohort)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id`,
          [tenantId, row.registrationNumber, row.fullName, row.email, row.programType,
            row.enrollmentStatus, row.cohort],
        );
        rosterId = inserted.rows[0].id;
        importedCount += 1;
      }
      const application = await client.query<{ id: string; status: 'pending' | 'approved' }>(
        `SELECT id, status FROM university_applications
         WHERE tenant_id = $1 AND lower(school_email) = $2
           AND lower(registration_number) = lower($3)
           AND status IN ('pending', 'approved')
           AND (roster_id IS NULL OR roster_id = $4)
         ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 1 FOR UPDATE`,
        [tenantId, row.email, row.registrationNumber, rosterId],
      );
      if (application.rows[0]) {
        await client.query(
          `UPDATE university_applications
           SET roster_id = $2, program_type = $3, enrollment_status = $4
           WHERE id = $1`,
          [application.rows[0].id, rosterId, row.programType, row.enrollmentStatus],
        );
        await client.query(
          `UPDATE university_student_roster
           SET application_id = $2,
               status = CASE WHEN status = 'activated' THEN status ELSE 'invited' END
           WHERE id = $1`,
          [rosterId, application.rows[0].id],
        );
      }
    }
    await client.query('COMMIT');
    return NextResponse.json({ importedCount, updatedCount }, { status: importedCount ? 201 : 200 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ message: 'An email or registration number already exists in this university roster. No rows were imported.' }, { status: 409 });
    }
    console.error('Unable to import university roster:', error);
    return NextResponse.json({ message: 'Unable to import this roster.' }, { status: 503 });
  } finally {
    client.release();
  }
}