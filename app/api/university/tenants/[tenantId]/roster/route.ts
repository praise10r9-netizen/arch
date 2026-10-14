import { parse } from 'csv-parse/sync';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../../lib/database';
import { normalizeAcademicDomain } from '../../../../../../lib/university-domains';
import { requireUniversityAdmin } from '../../../../../../lib/university-admin';

interface RosterRow {
  registration_number?: string;
  full_name?: string;
  school_email?: string;
  program_type?: string;
  cohort?: string;
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
  if (!domain) return NextResponse.json({ message: 'University tenant not found.' }, { status: 404 });

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
  const validatedRows: { registrationNumber: string; fullName: string; email: string; programType: string; cohort: string | null }[] = [];
  for (const [index, row] of rows.entries()) {
    const registrationNumber = row.registration_number?.trim() ?? '';
    const fullName = row.full_name?.trim() ?? '';
    const email = row.school_email?.trim().toLowerCase() ?? '';
    const programType = row.program_type?.trim() ?? '';
    const emailDomain = email.split('@').at(-1) ?? '';
    if (
      registrationNumber.length < 3 || registrationNumber.length > 80 ||
      fullName.length < 2 || fullName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      normalizeAcademicDomain(emailDomain) !== domain ||
      !['student_attachment', 'graduate_training'].includes(programType)
    ) {
      return NextResponse.json(
        { message: `Roster row ${index + 2} is invalid. Check registration number, name, exact ${domain} email, and program_type.` },
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
      cohort: row.cohort?.trim().slice(0, 80) || null,
    });
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    for (const row of validatedRows) {
      await client.query(
        `INSERT INTO university_student_roster
           (tenant_id, registration_number, full_name, school_email, program_type, cohort)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, row.registrationNumber, row.fullName, row.email, row.programType, row.cohort],
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ importedCount: validatedRows.length }, { status: 201 });
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