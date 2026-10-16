import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { createSessionToken, setSessionCookie } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';
import { hashActivationToken } from '../../../../lib/university-activation';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Activation details are required.' }, { status: 400 });
  }
  const input = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const token = typeof input.token === 'string' ? input.token : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ message: 'This activation link is invalid or expired.' }, { status: 400 });
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return NextResponse.json({ message: 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.' }, { status: 400 });
  }
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    return NextResponse.json({ message: 'Account activation is not configured on this server.' }, { status: 503 });
  }

  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string; name: string; email: string }>(
      `SELECT user_account.id, user_account.name, user_account.email
       FROM qualified_architect_activation_tokens token
       JOIN qualified_architect_profiles profile ON profile.user_id = token.user_id
       JOIN users user_account ON user_account.id = token.user_id
       WHERE token.token_hash = $1
         AND token.consumed_at IS NULL
         AND token.expires_at > now()
         AND profile.activation_completed_at IS NULL
         AND user_account.role = 'qualified_architect'
       FOR UPDATE OF token, profile, user_account`,
      [hashActivationToken(token)],
    );
    const account = result.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return NextResponse.json({ message: 'This activation link is invalid or expired.' }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [account.id, passwordHash]);
    await client.query(
      'UPDATE qualified_architect_profiles SET activation_completed_at = now() WHERE user_id = $1',
      [account.id],
    );
    await client.query(
      'UPDATE qualified_architect_activation_tokens SET consumed_at = now() WHERE user_id = $1',
      [account.id],
    );
    const sessionToken = await createSessionToken(account.id, 'qualified_architect', client);
    await client.query('COMMIT');
    const response = NextResponse.json({ user: { ...account, role: 'qualified_architect' } });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back qualified architect activation:', rollbackError);
    });
    unstable_rethrow(error);
    console.error('Unable to activate qualified architect account:', error);
    return NextResponse.json({ message: 'Unable to activate your account right now.' }, { status: 503 });
  } finally {
    client.release();
  }
}
