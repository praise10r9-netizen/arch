import { unstable_rethrow } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getBoardDashboard } from '../../../../lib/board-admin';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in to view board records.' }, { status: 401 });
    if (!user.boardAdmin) {
      return NextResponse.json({ message: 'Board of Architects administrator access is required.' }, { status: 403 });
    }

    const dashboard = await getBoardDashboard(user.id);
    return NextResponse.json(dashboard, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to load board administrator dashboard:', error);
    return NextResponse.json({ message: 'Unable to load board oversight records.' }, { status: 503 });
  }
}
