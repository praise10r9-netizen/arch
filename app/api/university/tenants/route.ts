import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/database';
import { normalizeAcademicDomain } from '../../../../lib/university-domains';
import { requireUniversityAdmin } from '../../../../lib/university-admin';

export async function GET(request: NextRequest) {
  const admin = await requireUniversityAdmin(request);
  if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });

  try {
    const result = await getDatabase().query(
      `SELECT t.id, t.name, t.admin_email AS "adminEmail", d.domain,
              t.created_at AS "createdAt", count(r.id)::integer AS "rosterCount",
              count(r.id) FILTER (WHERE r.status = 'available')::integer AS "availableCount",
              count(r.id) FILTER (WHERE r.status = 'activated')::integer AS "activatedCount"
       FROM university_tenants t
       JOIN university_tenant_domains d ON d.tenant_id = t.id
       LEFT JOIN university_student_roster r ON r.tenant_id = t.id
       GROUP BY t.id, d.domain
       ORDER BY t.created_at DESC`,
    );
    return NextResponse.json({ tenants: result.rows }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Unable to load university tenants:', error);
    return NextResponse.json({ message: 'Unable to load university tenants.' }, { status: 503 });
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
  const adminEmail = typeof input.adminEmail === 'string' ? input.adminEmail.trim().toLowerCase() : '';
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

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO university_tenants (name, admin_email) VALUES ($1, $2) RETURNING id`,
      [name, adminEmail],
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
    console.error('Unable to create university tenant:', error);
    return NextResponse.json({ message: 'Unable to register this university.' }, { status: 503 });
  } finally {
    client.release();
  }
}