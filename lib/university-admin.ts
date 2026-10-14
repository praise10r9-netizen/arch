import 'server-only';
import type { NextRequest } from 'next/server';
import { getAuthenticatedUser, type AuthenticatedUser } from './auth';

export async function requireUniversityAdmin(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser(request);
  const adminEmail = process.env.UNIVERSITY_ADMIN_EMAIL?.trim().toLowerCase();
  return user && adminEmail && user.email.toLowerCase() === adminEmail ? user : null;
}