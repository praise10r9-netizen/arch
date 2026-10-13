import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getDatabase } from '../../../../lib/database';
import { requireUniversityAdmin } from '../../../../lib/university-admin';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireUniversityAdmin(request);
    if (!admin) return NextResponse.json({ message: 'University administrator access required.' }, { status: 403 });

    const [applications, students, graduates] = await Promise.all([
      getDatabase().query(
        `SELECT id, full_name AS "fullName", registration_number AS "registrationNumber",
                school_email AS email, program_type AS "programType", status,
                created_at AS "createdAt"
         FROM university_applications
         WHERE status IN ('pending', 'approved')
         ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`,
      ),
      getDatabase().query(
        `SELECT u.id, u.name, u.email, p.registration_number AS "registrationNumber",
                p.program_type AS "programType", p.stage, u.created_at AS "registeredAt",
                count(a.id)::integer AS "attachmentCount"
         FROM users u
         JOIN trainee_profiles p ON p.user_id = u.id
         LEFT JOIN trainee_attachments a ON a.trainee_id = u.id
         WHERE p.program_type = 'student_attachment'
         GROUP BY u.id, p.registration_number, p.program_type, p.stage
         ORDER BY u.created_at DESC`,
      ),
      getDatabase().query(
        `SELECT u.id, u.name, u.email, p.registration_number AS "registrationNumber",
                p.program_type AS "programType", p.stage, u.created_at AS "registeredAt",
                count(e.id)::integer AS "entryCount"
         FROM users u
         JOIN trainee_profiles p ON p.user_id = u.id
         LEFT JOIN experience_entries e ON e.trainee_id = u.id
         WHERE p.program_type = 'graduate_training'
         GROUP BY u.id, p.registration_number, p.program_type, p.stage
         ORDER BY u.created_at DESC`,
      ),
    ]);

    return NextResponse.json(
      { applications: applications.rows, students: students.rows, graduates: graduates.rows },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error('Unable to load university dashboard:', error);
    return NextResponse.json({ message: 'Unable to load university records.' }, { status: 503 });
  }
}