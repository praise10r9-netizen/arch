import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { addTrainingEntry } from '../../../../lib/trainee-store';
import { TRAINING_CATEGORIES } from '../../../../lib/trainee-types';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
    }
    console.error('Unable to read experience entry:', error);
    return NextResponse.json({ message: 'Unable to read the experience entry.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ message: 'Experience entry details are required.' }, { status: 400 });
  }

  let user;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    console.error('Unable to authorize experience entry:', error);
    return NextResponse.json({ message: 'Unable to verify your account.' }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ message: 'Sign in with a trainee account to log experience.' }, { status: 401 });
  }
  if (user.role !== 'trainee') {
    return NextResponse.json({ message: 'Experience entries are available to trainees only.' }, { status: 403 });
  }

  const { date, category, activity, hours } = body as Record<string, unknown>;
  const normalizedActivity = typeof activity === 'string' ? activity.trim() : '';
  const hoursValue = typeof hours === 'number' ? hours : Number.NaN;
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  ) {
    return NextResponse.json({ message: 'Enter a valid activity date.' }, { status: 400 });
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ message: 'Activity date cannot be in the future.' }, { status: 400 });
  }
  const selectedCategory = TRAINING_CATEGORIES.find((item) => item === category);
  if (!selectedCategory) {
    return NextResponse.json({ message: 'Select a valid training category.' }, { status: 400 });
  }
  if (normalizedActivity.length < 10 || normalizedActivity.length > 500) {
    return NextResponse.json(
      { message: 'Activity details must be between 10 and 500 characters.' },
      { status: 400 },
    );
  }
  if (
    !Number.isFinite(hoursValue) ||
    hoursValue <= 0 ||
    hoursValue > 24 ||
    Math.round(hoursValue * 4) !== hoursValue * 4
  ) {
    return NextResponse.json(
      { message: 'Hours must be between 0.25 and 24 in 0.25 hour increments.' },
      { status: 400 },
    );
  }

  try {
    const result = await addTrainingEntry(user.id, {
      date,
      category: selectedCategory,
      activity: normalizedActivity,
      hours: hoursValue,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Unable to save training entry:', error);
    return NextResponse.json({ message: 'Unable to save the experience entry.' }, { status: 503 });
  }
}
