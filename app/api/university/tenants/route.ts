import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/database';
import { getAcademicEmailDomain, normalizeAcademicDomain } from '../../../../lib/university-domains';
import { requireUniversityAdmin } from '../../../../lib/university-admin';

export async function GET(request: NextRequest) {
  const admin = await requireUniversityAdmin(request);
  if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });

  try {
    const result = await getDatabase().query(
      `SELECT t.id, t.name, t.admin_email AS "adminEmail", d.domain,
              t.created_at AS "createdAt", count(r.id)::integer AS "rosterCount",
              count(r.id) FILTER (WHERE r.status = 'available')::integer AS "availableCount",
              count(r.id) FILTER (WHERE r.status = 'activated')::integer AS "activatedCount",
              count(r.id) FILTER (WHERE r.enrollment_status = 'ongoing')::integer AS "ongoingCount",
              count(r.id) FILTER (WHERE r.enrollment_status = 'graduated')::integer AS "graduatedCount"
       FROM university_tenants t
       JOIN university_tenant_domains d ON d.tenant_id = t.id
       LEFT JOIN university_student_roster r ON r.tenant_id = t.id
       WHERE t.id = $1
       GROUP BY t.id, d.domain
       ORDER BY t.created_at DESC`,
      [admin.universityTenantId],
    );
    const university = result.rows[0];
    if (!university) {
      return NextResponse.json({ university: null }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const rosterResult = await getDatabase().query(
      `SELECT id, registration_number AS "registrationNumber", full_name AS "fullName",
              school_email AS "schoolEmail", program_type AS "programType",
              enrollment_status AS "enrollmentStatus", status AS "accountStatus",
              cohort, activated_at AS "activatedAt"
       FROM university_student_roster
       WHERE tenant_id = $1
       ORDER BY lower(full_name), lower(registration_number)`,
      [admin.universityTenantId],
    );
    return NextResponse.json(
      { university: { ...university, roster: rosterResult.rows } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Unable to load university workspace:', error);
    return NextResponse.json({ message: 'Unable to load your university workspace.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireUniversityAdmin(request);
  if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'University details are required.' }, { status: 400 });
  }
  const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const adminEmail = admin.email.toLowerCase();
  const domain = typeof input.domain === 'string' ? normalizeAcademicDomain(input.domain) : null;
  if (name.length < 2 || name.length > 160) {
    return NextResponse.json({ message: 'University name must be between 2 and 160 characters.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 254) {
    return NextResponse.json({ message: 'Enter a valid university admin email.' }, { status: 400 });
  }
  if (!domain) {
    return NextResponse.json({ message: 'Use a university domain ending in .ac.mw, such as example.ac.mw.' }, { status: 400 });
  }
  if (getAcademicEmailDomain(adminEmail) !== domain) {
    return NextResponse.json(
      { message: 'Use an administrator email at the same .ac.mw domain you are registering.' },
      { status: 400 },
    );
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const account = await client.query<{ university_tenant_id: string | null }>(
      'SELECT university_tenant_id FROM users WHERE id = $1 FOR UPDATE',
      [admin.id],
    );
    if (!account.rows[0] || account.rows[0].university_tenant_id) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { message: 'Your account already has a university workspace.' },
        { status: 409 },
      );
    }
    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO university_tenants (name, admin_email) VALUES ($1, $2) RETURNING id`,
      [name, adminEmail],
    );
    await client.query(
      'UPDATE users SET university_tenant_id = $2 WHERE id = $1',
      [admin.id, tenantResult.rows[0].id],
    );
    await client.query(
      `INSERT INTO university_tenant_domains (domain, tenant_id, verification_mode)
       VALUES ($1, $2, 'simulation')`,
      [domain, tenantResult.rows[0].id],
    );
    await client.query('COMMIT');
    return NextResponse.json({ id: tenantResult.rows[0].id, name, adminEmail, domain }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ message: 'That domain is already registered.' }, { status: 409 });
    }
    console.error('Unable to create university workspace:', error);
    return NextResponse.json({ message: 'Unable to set up your university workspace.' }, { status: 503 });
  } finally {
    client.release();
  }
}