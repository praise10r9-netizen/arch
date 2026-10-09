import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getAuthenticatedUser } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });
    return NextResponse.json({ user }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to validate session:', error);
    return NextResponse.json({ message: 'Unable to validate your session.' }, { status: 503 });
  }
}
