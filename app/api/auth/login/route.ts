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
    console.error('Unable to read login request:', error);
    return NextResponse.json({ message: 'Unable to sign in right now.' }, { status: 500 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email || !password) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
  }

  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    console.error('Login is unavailable because JWT_SECRET is missing or too short.');
    return NextResponse.json({ message: 'Sign-in is not configured on this server.' }, { status: 503 });
  }

  try {
    const result = await getDatabase().query<{
      id: string;
      name: string;
      email: string;
      role: UserRole;
      password_hash: string;
    }>(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    const token = await createSessionToken(user.id, user.role);
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json(
      { message: 'Unable to sign in right now. Check the database configuration and try again.' },
      { status: 503 },
    );
  }
}
