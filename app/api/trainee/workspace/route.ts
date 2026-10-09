import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getTraineeWorkspace } from '../../../../lib/trainee-store';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { message: 'Please sign in to continue.' },
        { status: 401 },
      );
    }
    if (user.role !== 'trainee') {
      return NextResponse.json({ message: 'This workspace is for trainees.' }, { status: 403 });
    }
    const workspace = await getTraineeWorkspace(user.id);
    if (!workspace) {
      return NextResponse.json({ message: 'Trainee profile was not found.' }, { status: 404 });
    }
    return NextResponse.json(workspace, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to load trainee workspace:', error);
    return NextResponse.json(
      { message: 'Unable to load the trainee workspace. Check the database configuration.' },
      { status: 503 },
    );
  }
}
