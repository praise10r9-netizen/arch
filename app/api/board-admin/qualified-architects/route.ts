import { randomBytes } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';
import { createActivationToken, hashActivationToken } from '../../../../lib/university-activation';
import { escapeEmailHtml, getAppUrl, sendUniversityEmail } from '../../../../lib/university-email';

interface ArchitectInput {
  name: string;
  email: string;
  registrationNumber: string | null;
  qualificationDate: string | null;
}

interface TraineePromotionInput {
  currentEmail: string;
  newEmail: string;
  registrationNumber: string | null;
  qualificationDate: string | null;
}

class RosterConflictError extends Error {}

function normalizeRecord(record: Record<string, string>): ArchitectInput {
  const name = record.name?.trim() ?? '';
  const email = record.email?.trim().toLowerCase() ?? '';
  const registrationNumber =
    record.board_registration_number?.trim() || record.registration_number?.trim() || null;
  const qualificationDate = record.qualification_date?.trim() || null;
  if (name.length < 2 || name.length > 120) throw new Error('Each name must be between 2 and 120 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error(`Invalid email address: ${email || '(blank)'}.`);
  }
  if (registrationNumber && registrationNumber.length > 80) {
    throw new Error(`Board registration number is too long for ${email}.`);
  }
  if (
    qualificationDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(qualificationDate) ||
      Number.isNaN(Date.parse(`${qualificationDate}T00:00:00.000Z`)) ||
      new Date(`${qualificationDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== qualificationDate)
  ) {
    throw new Error(`Qualification date for ${email} must use YYYY-MM-DD.`);
  }
  return { name, email, registrationNumber, qualificationDate };
}

function parseInputs(input: Record<string, unknown>): ArchitectInput[] {
  if (typeof input.csv === 'string') {
    if (input.csv.length > 1_000_000) throw new Error('CSV uploads must be 1 MB or smaller.');
    const rows = parse(input.csv, {
      bom: true,
      columns: (headers: string[]) =>
        headers.map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_')),
      skip_empty_lines: true,
      trim: true,
      max_record_size: 4096,
    }) as Record<string, string>[];
    if (!rows.length || !('name' in rows[0]) || !('email' in rows[0])) {
      throw new Error('CSV must include name and email headers.');
    }
    if (rows.length > 1000) throw new Error('A single CSV upload can include at most 1,000 architects.');
    return rows.map(normalizeRecord);
  }
  if (typeof input.architect === 'object' && input.architect !== null) {
    const row = input.architect as Record<string, string>;
    return [normalizeRecord(row)];
  }
  throw new Error('Provide a CSV file or one qualified architect record.');
}

function parseTraineePromotion(value: unknown): TraineePromotionInput {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Provide the current and replacement trainee email addresses.');
  }
  const record = value as Record<string, unknown>;
  const currentEmail = typeof record.current_email === 'string' ? record.current_email.trim().toLowerCase() : '';
  const newEmail = typeof record.new_email === 'string' ? record.new_email.trim().toLowerCase() : '';
  for (const email of [currentEmail, newEmail]) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error(`Invalid email address: ${email || '(blank)'}.`);
    }
  }
  if (currentEmail === newEmail) {
    throw new Error('The replacement email must be different from the current trainee email.');
  }
  const registrationNumber =
    typeof record.board_registration_number === 'string'
      ? record.board_registration_number.trim() || null
      : null;
  if (registrationNumber && registrationNumber.length > 80) {
    throw new Error('Board registration number must be 80 characters or fewer.');
  }
  const qualificationDate =
    typeof record.qualification_date === 'string' ? record.qualification_date.trim() || null : null;
  if (
    qualificationDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(qualificationDate) ||
      Number.isNaN(Date.parse(`${qualificationDate}T00:00:00.000Z`)) ||
      new Date(`${qualificationDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== qualificationDate)
  ) {
    throw new Error('Qualification date must use YYYY-MM-DD.');
  }
  return { currentEmail, newEmail, registrationNumber, qualificationDate };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'Sign in as a board administrator.' }, { status: 401 });
    if (user.role !== 'board_admin') return NextResponse.json({ message: 'Board administrator access is required.' }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: 'Provide valid JSON containing the roster CSV or architect record.' }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ message: 'Provide a roster CSV or architect record.' }, { status: 400 });
    }

    let inputs: ArchitectInput[] = [];
    let traineePromotion: TraineePromotionInput | null = null;
    try {
      const input = body as Record<string, unknown>;
      if ('promoteTrainee' in input) {
        if ('csv' in input || 'architect' in input) {
          throw new Error('Submit either a roster update or an existing trainee promotion, not both.');
        }
        traineePromotion = parseTraineePromotion(input.promoteTrainee);
      } else {
        inputs = parseInputs(input);
      }
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : 'Unable to parse this roster.' },
        { status: 400 },
      );
    }
    if (!traineePromotion && !inputs.length) {
      return NextResponse.json({ message: 'The roster contains no architect records.' }, { status: 400 });
    }
    if (new Set(inputs.map((row) => row.email)).size !== inputs.length) {
      return NextResponse.json({ message: 'The roster contains duplicate email addresses.' }, { status: 400 });
    }

    const pendingActivations: { email: string; name: string; token: string }[] = [];
    let promoted = 0;
    let provisioned = 0;
    const client = await getDatabase().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(834769282002)');
      if (traineePromotion) {
        const sourceResult = await client.query<{
          id: string;
          name: string;
          role: string;
        }>(
          'SELECT id, name, role FROM users WHERE lower(email) = $1 FOR UPDATE',
          [traineePromotion.currentEmail],
        );
        if (sourceResult.rowCount !== 1) {
          throw new RosterConflictError(`No unique account matches ${traineePromotion.currentEmail}.`);
        }
        const source = sourceResult.rows[0];
        if (source.role !== 'trainee') {
          throw new RosterConflictError(`${traineePromotion.currentEmail} is not a trainee account.`);
        }
        const targetResult = await client.query<{ id: string }>(
          'SELECT id FROM users WHERE lower(email) = $1 FOR UPDATE',
          [traineePromotion.newEmail],
        );
        if (targetResult.rowCount) {
          throw new RosterConflictError(`${traineePromotion.newEmail} already belongs to an account.`);
        }

        const replacementPasswordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
        await client.query(
          `UPDATE users SET email = $2, role = 'qualified_architect', password_hash = $3 WHERE id = $1`,
          [source.id, traineePromotion.newEmail, replacementPasswordHash],
        );
        await client.query(
          `INSERT INTO qualified_architect_profiles
             (user_id, board_registration_number, qualification_date, activation_completed_at)
           VALUES ($1, $2, $3, NULL)
           ON CONFLICT (user_id) DO UPDATE SET
             board_registration_number = COALESCE(EXCLUDED.board_registration_number, qualified_architect_profiles.board_registration_number),
             qualification_date = COALESCE(EXCLUDED.qualification_date, qualified_architect_profiles.qualification_date),
             activation_completed_at = NULL`,
          [source.id, traineePromotion.registrationNumber, traineePromotion.qualificationDate],
        );
        await client.query(
          'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [source.id],
        );
        await client.query(
          `UPDATE qualified_architect_invitations
           SET status = 'expired', expires_at = LEAST(expires_at, now())
           WHERE lower(trainee_email) = $1 AND status = 'pending'`,
          [traineePromotion.currentEmail],
        );
        const token = createActivationToken();
        await client.query(
          `INSERT INTO qualified_architect_activation_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '48 hours')
           ON CONFLICT (user_id) DO UPDATE SET
             token_hash = EXCLUDED.token_hash,
             expires_at = EXCLUDED.expires_at,
             consumed_at = NULL,
             created_at = now()`,
          [source.id, hashActivationToken(token)],
        );
        pendingActivations.push({ email: traineePromotion.newEmail, name: source.name, token });
        promoted = 1;
      } else for (const input of inputs) {
        const matchingUsers = await client.query<{
          id: string;
          role: string;
        }>(
          'SELECT id, role FROM users WHERE lower(email) = $1 FOR UPDATE',
          [input.email],
        );
        if (matchingUsers.rowCount && matchingUsers.rowCount !== 1) {
          throw new RosterConflictError(`Multiple accounts match ${input.email}; resolve the duplicate accounts first.`);
        }
        const existing = matchingUsers.rows[0];
        let userId: string;
        let needsActivation = false;
        if (existing) {
          if (existing.role !== 'trainee' && existing.role !== 'qualified_architect') {
            throw new RosterConflictError(`${input.email} already belongs to a ${existing.role.replaceAll('_', ' ')} account.`);
          }
          userId = existing.id;
          await client.query(
            `UPDATE users SET name = $2, role = 'qualified_architect' WHERE id = $1`,
            [userId, input.name],
          );
          await client.query(
            `INSERT INTO qualified_architect_profiles
               (user_id, board_registration_number, qualification_date, activation_completed_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id) DO UPDATE SET
               board_registration_number = COALESCE(EXCLUDED.board_registration_number, qualified_architect_profiles.board_registration_number),
               qualification_date = COALESCE(EXCLUDED.qualification_date, qualified_architect_profiles.qualification_date)`,
            [userId, input.registrationNumber, input.qualificationDate],
          );
          if (existing.role === 'trainee') promoted += 1;
          const activation = await client.query<{ activation_completed_at: Date | null }>(
            'SELECT activation_completed_at FROM qualified_architect_profiles WHERE user_id = $1',
            [userId],
          );
          needsActivation = activation.rows[0]?.activation_completed_at === null;
        } else {
          const initialPasswordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
          const createdUser = await client.query<{ id: string }>(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, 'qualified_architect')
             RETURNING id`,
            [input.name, input.email, initialPasswordHash],
          );
          userId = createdUser.rows[0].id;
          await client.query(
            `INSERT INTO qualified_architect_profiles
               (user_id, board_registration_number, qualification_date, activation_completed_at)
             VALUES ($1, $2, $3, NULL)`,
            [userId, input.registrationNumber, input.qualificationDate],
          );
          needsActivation = true;
          provisioned += 1;
        }

        if (needsActivation) {
          const token = createActivationToken();
          await client.query(
            `INSERT INTO qualified_architect_activation_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, now() + interval '48 hours')
             ON CONFLICT (user_id) DO UPDATE SET
               token_hash = EXCLUDED.token_hash,
               expires_at = EXCLUDED.expires_at,
               consumed_at = NULL,
               created_at = now()`,
            [userId, hashActivationToken(token)],
          );
          pendingActivations.push({ email: input.email, name: input.name, token });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch((rollbackError: unknown) => {
        console.error('Unable to roll back qualified architect roster import:', rollbackError);
      });
      if (isUniqueViolation(error)) {
        return NextResponse.json({ message: 'An email conflicts with an existing account. No changes were saved.' }, { status: 409 });
      }
      throw error;
    } finally {
      client.release();
    }

    const activationFailed: string[] = [];
    let appUrl = '';
    if (pendingActivations.length) {
      try {
        appUrl = getAppUrl();
      } catch (error) {
        console.error('Unable to create qualified architect activation links:', error);
        activationFailed.push(...pendingActivations.map((activation) => activation.email));
      }
    }
    for (const activation of pendingActivations) {
      if (!appUrl) continue;
      const activationUrl = `${appUrl}/qualified-architect/activate?token=${encodeURIComponent(activation.token)}`;
      try {
        await sendUniversityEmail(
          activation.email,
          'Activate your qualified architect account',
          `<p>Hello ${escapeEmailHtml(activation.name)},</p>
           <p>The Board of Architects has added you as a qualified architect in ArchPath.</p>
           <p><a href="${activationUrl}">Set your password and activate your account</a></p>
           <p>This private link expires in 48 hours and can be used once.</p>`,
        );
      } catch {
        activationFailed.push(activation.email);
      }
    }
    return NextResponse.json({
      imported: traineePromotion ? 1 : inputs.length,
      promoted,
      provisioned,
      ...(traineePromotion
        ? { previousEmail: traineePromotion.currentEmail, email: traineePromotion.newEmail }
        : {}),
      activationEmailsSent: pendingActivations.length - activationFailed.length,
      activationEmailsFailed: activationFailed,
    }, { status: 201 });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof RosterConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error('Unable to import qualified architect roster:', error);
    return NextResponse.json({ message: 'Unable to import the qualified architect roster.' }, { status: 503 });
  }
}
