import { unstable_rethrow } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../../lib/auth';
import { getApprovalReview } from '../../../../../lib/approval-store';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in to review logs.' }, { status: 401 });
    if (user.role !== 'mentor') return NextResponse.json({ message: 'Mentor access is required.' }, { status: 403 });

    const { entryId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryId)) {
      return NextResponse.json({ message: 'Enter a valid experience entry id.' }, { status: 400 });
    }

    const review = await getApprovalReview(user.id, entryId);
    if (!review) {
      return NextResponse.json(
        { message: 'This log is not pending review for one of your assigned trainees.' },
        { status: 404 },
      );
    }
    return NextResponse.json(review, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to load mentor log review:', error);
    return NextResponse.json({ message: 'Unable to load this log for review.' }, { status: 503 });
  }
}
