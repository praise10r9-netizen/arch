import 'server-only';
import type { NextRequest } from 'next/server';
import { getAuthenticatedUser, type AuthenticatedUser } from './auth';

export async function requireUniversityAdmin(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const user = await getAuthenticatedUser(request);
  return user?.universityAdmin ? user : null;
}

export function canManageUniversityTenant(
  admin: AuthenticatedUser,
  tenantId: string,
): boolean {
  return admin.universityTenantId === tenantId;
}