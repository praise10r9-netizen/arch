import 'server-only';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { getDatabase } from './database';

export type UserRole = 'trainee' | 'mentor';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const SESSION_COOKIE = 'archpath_session';
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

function signingKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  userId: string,
  role: UserRole,
  client?: PoolClient,
): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(signingKey());

  const query = client ?? getDatabase();
  await query.query(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [id, userId, expiresAt],
  );
  return token;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const key = signingKey();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    }));
  } catch {
    return null;
  }

  const sessionId = payload.jti;
  const userId = payload.sub;
  if (
    typeof sessionId !== 'string' ||
    typeof userId !== 'string' ||
    (payload.role !== 'trainee' && payload.role !== 'mentor')
  ) {
    return null;
  }

  const result = await getDatabase().query<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }>(
    `SELECT u.id, u.name, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.user_id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > now()`,
    [sessionId, userId],
  );
  const user = result.rows[0];
  if (!user || user.role !== payload.role) return null;
  return user;
}

export async function revokeSession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;

  const key = signingKey();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      clockTolerance: SESSION_DURATION_SECONDS,
    }));
  } catch {
    return;
  }

  if (typeof payload.jti === 'string') {
    await getDatabase().query(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [payload.jti],
    );
  }
}

export async function requireRole(
  request: NextRequest,
  role: UserRole,
): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser(request);
  return user?.role === role ? user : null;
}
