import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getAuthenticatedUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/database';
import type { AttachmentKind, TraineeAttachment } from '../../../../lib/trainee-types';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function authenticatedRoleError() {
  return NextResponse.json(
    { message: 'Sign in with a trainee account to manage evidence.' },
    { status: 401 },
  );
}

function detectMediaType(kind: AttachmentKind, content: Buffer): string | null {
  if (
    content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) return 'image/png';
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) return 'image/jpeg';
  if (
    content.length >= 12 &&
    content.toString('ascii', 0, 4) === 'RIFF' &&
    content.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  if (kind === 'certificate' && content.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE + 64 * 1024) {
    return NextResponse.json({ message: 'Uploads must be no larger than 5 MB.' }, { status: 413 });
  }

  let user;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    console.error('Unable to authorize evidence upload:', error);
    return NextResponse.json({ message: 'Unable to verify your account.' }, { status: 503 });
  }
  if (!user) return authenticatedRoleError();
  if (user.role !== 'trainee') {
    return NextResponse.json({ message: 'Evidence is available to trainees only.' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error('Unable to read evidence upload:', error);
    return NextResponse.json({ message: 'Upload form could not be read.' }, { status: 400 });
  }
  const kind = formData.get('kind');
  const entryId = formData.get('entryId');
  const file = formData.get('file');
  if ((kind !== 'evidence' && kind !== 'certificate') || !(file instanceof File)) {
    return NextResponse.json({ message: 'Choose an evidence image or a certificate file.' }, { status: 400 });
  }
  if (
    (kind === 'evidence' && (typeof entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entryId))) ||
    (kind === 'certificate' && entryId !== null)
  ) {
    return NextResponse.json(
      { message: kind === 'evidence'
        ? 'Select the experience log this image supports.'
        : 'Certificates are attached to your trainee record, not an individual log.' },
      { status: 400 },
    );
  }
  if (file.size < 1 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ message: 'Files must be no larger than 5 MB.' }, { status: 400 });
  }
  const content = Buffer.from(await file.arrayBuffer());
  const mediaType = detectMediaType(kind, content);
  if (!mediaType || (kind === 'evidence' && !mediaType.startsWith('image/'))) {
    return NextResponse.json(
      { message: kind === 'evidence'
        ? 'Evidence must be a JPEG, PNG, or WebP image.'
        : 'Certificates must be a PDF, JPEG, PNG, or WebP file.' },
      { status: 400 },
    );
  }

  const client = await getDatabase().connect().catch((error: unknown) => {
    console.error('Unable to connect to PostgreSQL for evidence upload:', error);
    return null;
  });
  if (!client) {
    return NextResponse.json({ message: 'The evidence service is unavailable.' }, { status: 503 });
  }

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [kind === 'evidence' ? `${user.id}:${entryId}` : user.id],
    );
    if (kind === 'evidence') {
      const entryResult = await client.query(
        `SELECT 1
         FROM experience_entries
         WHERE id = $1 AND trainee_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [entryId, user.id],
      );
      if (entryResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { message: 'Evidence can only be attached to your own pending experience log.' },
          { status: 404 },
        );
      }
      const existingEvidence = await client.query(
        `SELECT 1
         FROM trainee_attachments
         WHERE entry_id = $1 AND kind = 'evidence'`,
        [entryId],
      );
      if (existingEvidence.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { message: 'This log already has an evidence image. Remove it before adding a replacement.' },
          { status: 409 },
        );
      }
    }
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM trainee_attachments
       WHERE trainee_id = $1 AND kind = 'certificate'`,
    );
    const count = Number(countResult.rows[0].count);
    if (kind === 'certificate' && count >= 2) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { message: 'You can store up to two certificates. Remove one before adding another.' },
        { status: 409 },
      );
    }

    const attachmentId = randomUUID();
    const filename = file.name.replace(/[\u0000-\u001f\u007f/\\"]/g, '_').slice(-180) || 'upload';
    const result = await client.query<{
      id: string;
      kind: AttachmentKind;
      filename: string;
      media_type: string;
      size_bytes: number;
      created_at: Date;
      entry_id: string | null;
    }>(
      `INSERT INTO trainee_attachments
         (id, trainee_id, entry_id, kind, filename, media_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, kind, entry_id, filename, media_type, size_bytes, created_at`,
      [attachmentId, user.id, kind === 'evidence' ? entryId : null, kind, filename, mediaType, content.length, content],
    );
    await client.query('COMMIT');
    const row = result.rows[0];
    const attachment: TraineeAttachment = {
      id: row.id,
      kind: row.kind,
      entryId: row.entry_id,
      filename: row.filename,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at.toISOString(),
    };
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: unknown) => {
      console.error('Unable to roll back failed evidence upload:', rollbackError);
    });
    console.error('Unable to store evidence:', error);
    return NextResponse.json({ message: 'Unable to store this file right now.' }, { status: 503 });
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to authorize evidence download:', error);
    return NextResponse.json({ message: 'Unable to verify your account.' }, { status: 503 });
  }
  if (!user) return authenticatedRoleError();

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'An attachment id is required.' }, { status: 400 });
  try {
    const result = await getDatabase().query<{
      filename: string;
      media_type: string;
      content: Buffer;
    }>(
      `SELECT attachment.filename, attachment.media_type, attachment.content
       FROM trainee_attachments attachment
       WHERE attachment.id = $1
         AND (
           ( $2 = 'trainee' AND attachment.trainee_id = $3 )
           OR
           ( $2 = 'mentor' AND EXISTS (
             SELECT 1
             FROM mentor_assignments assignment
             WHERE assignment.trainee_id = attachment.trainee_id
               AND assignment.mentor_id = $3
               AND assignment.ended_at IS NULL
           ) )
         )`,
      [id, user.role, user.id],
    );
    const file = result.rows[0];
    if (!file) return NextResponse.json({ message: 'Attachment not found.' }, { status: 404 });
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': file.media_type,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Content-Length': String(file.content.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Unable to retrieve evidence file:', error);
    return NextResponse.json({ message: 'Unable to retrieve this file.' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  let user;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    console.error('Unable to authorize evidence removal:', error);
    return NextResponse.json({ message: 'Unable to verify your account.' }, { status: 503 });
  }
  if (!user) return authenticatedRoleError();
  if (user.role !== 'trainee') {
    return NextResponse.json({ message: 'Evidence is available to trainees only.' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ message: 'An attachment id is required.' }, { status: 400 });
  try {
    const result = await getDatabase().query(
      `DELETE FROM trainee_attachments attachment
       WHERE attachment.id = $1 AND attachment.trainee_id = $2
         AND (
           attachment.entry_id IS NULL
           OR EXISTS (
             SELECT 1 FROM experience_entries entry
             WHERE entry.id = attachment.entry_id AND entry.status = 'pending'
           )
         )`,
      [id, user.id],
    );
    if (result.rowCount === 0) {
      const existing = await getDatabase().query(
        'SELECT 1 FROM trainee_attachments WHERE id = $1 AND trainee_id = $2',
        [id, user.id],
      );
      if (existing.rowCount) {
        return NextResponse.json(
          { message: 'Evidence attached to an approved log cannot be removed.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ message: 'Attachment not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unable to remove evidence file:', error);
    return NextResponse.json({ message: 'Unable to remove this file.' }, { status: 503 });
  }
}
