import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, revokeSession } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  try {
    await revokeSession(request);
  } catch (error) {
    console.error('Unable to revoke session:', error);
    const failure = NextResponse.json(
      { message: 'Your browser session was cleared, but the server could not revoke it.' },
      { status: 503 },
    );
    clearSessionCookie(failure);
    return failure;
  }
  clearSessionCookie(response);
  return response;
}
