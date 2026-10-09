import { unstable_rethrow } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { approveExperienceEntry, getPendingApprovals } from '../../../../lib/approval-store';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in to view pending logs.' }, { status: 401 });
    if (user.role !== 'mentor') return NextResponse.json({ message: 'Mentor access is required.' }, { status: 403 });

    const entries = await getPendingApprovals(user.id);
    return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to load mentor approval queue:', error);
    return NextResponse.json({ message: 'Unable to load pending logs.' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
    }
    console.error('Unable to read approval request:', error);
    return NextResponse.json({ message: 'Unable to read the approval request.' }, { status: 400 });
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    !('entryId' in body) ||
    typeof body.entryId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.entryId)
  ) {
    return NextResponse.json({ message: 'A valid experience entry id is required.' }, { status: 400 });
  }

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in to approve logs.' }, { status: 401 });
    if (user.role !== 'mentor') return NextResponse.json({ message: 'Mentor access is required.' }, { status: 403 });

    const result = await approveExperienceEntry(user.id, body.entryId);
    if (result.kind === 'not-found') {
      return NextResponse.json({ message: 'This log is not assigned to you or no longer exists.' }, { status: 404 });
    }
    if (result.kind === 'not-pending') {
      return NextResponse.json({ message: 'This log has already been reviewed.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, status: 'approved' });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to approve experience entry:', error);
    return NextResponse.json({ message: 'Unable to approve this log.' }, { status: 503 });
  }
}
