import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, setSessionCookie, type UserRole } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';

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
  const password = typeof input.password === 'string' ? input.password : '';
  const role = input.role === undefined ? 'trainee' : input.role;

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ message: 'Name must be between 2 and 120 characters.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return NextResponse.json(
      { message: 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.' },
      { status: 400 },
    );
  }
  if (role !== 'trainee' && role !== 'mentor') {
    return NextResponse.json({ message: 'Select a valid account role.' }, { status: 400 });
  }
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    console.error('Registration is unavailable because JWT_SECRET is missing or too short.');
    return NextResponse.json(
      { message: 'Account registration is not configured on this server.' },
      { status: 503 },
    );
  }

  let client;
  try {
    client = await getDatabase().connect();
  } catch (error) {
    console.error('Unable to connect to PostgreSQL for registration:', error);
    return NextResponse.json({ message: 'The account service is unavailable.' }, { status: 503 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      name: string;
      email: string;
      role: UserRole;
    }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role],
    );
    const user = result.rows[0];
    if (user.role === 'trainee') {
      await client.query('INSERT INTO trainee_profiles (user_id) VALUES ($1)', [user.id]);
    }
    const token = await createSessionToken(user.id, user.role, client);
    await client.query('COMMIT');

    const response = NextResponse.json({ user }, { status: 201 });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back failed registration:', rollbackError);
    });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return NextResponse.json({ message: 'An account with this email already exists.' }, { status: 409 });
    }
    console.error('Registration failed:', error);
    return NextResponse.json({ message: 'Unable to create the account right now.' }, { status: 500 });
  } finally {
    client.release();
  }
}
