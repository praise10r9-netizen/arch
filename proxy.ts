import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from './lib/auth';

const protectedRouteRoles: Record<string, 'trainee' | 'qualified_architect' | 'university_admin' | 'board_admin'> = {
  '/trainee': 'trainee',
  '/architect': 'qualified_architect',
  '/mentor': 'qualified_architect',
  '/university-admin': 'university_admin',
  '/board-admin': 'board_admin',
};

function loginRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function proxy(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return loginRedirect(request);

    const requiredRole = protectedRouteRoles[request.nextUrl.pathname];
    if (requiredRole && user.role !== requiredRole && !(requiredRole === 'university_admin' && user.universityAdmin)) {
      return loginRedirect(request);
    }
    return NextResponse.next();
  } catch (error) {
    console.error('Unable to validate page session:', error);
    return NextResponse.json({ message: 'Unable to verify your session right now.' }, { status: 503 });
  }
}

export const config = {
  matcher: ['/', '/trainee/:path*', '/architect/:path*', '/mentor/:path*', '/university-admin/:path*', '/board-admin/:path*'],
};