import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getAuthenticatedUserFromToken,
  SESSION_COOKIE,
  type AuthenticatedUser,
  type UserRole,
} from './auth';

export async function requirePageSession(): Promise<AuthenticatedUser> {
  const cookieStore = await cookies();
  const user = await getAuthenticatedUserFromToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) redirect('/login');
  return user;
}

export async function requirePageRole(role: UserRole): Promise<AuthenticatedUser> {
  const user = await requirePageSession();
  if (user.role !== role && !(role === 'university_admin' && user.universityAdmin)) {
    redirect('/login');
  }
  return user;
}