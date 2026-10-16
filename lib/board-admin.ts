import 'server-only';
import { getDatabase } from './database';

export interface BoardDashboard {
  metrics: {
    qualifiedArchitects: number;
    universityAdmins: number;
    universities: number;
    attachmentStudents: number;
    graduateTrainees: number;
    pendingEntries: number;
    verifiedEntries: number;
  };
  architects: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    boardRegistrationNumber: string | null;
    qualificationDate: string | null;
    activeTrainees: number;
    verifiedEntries: number;
    lastVerificationAt: string | null;
  }[];
  universities: {
    adminId: string;
    adminName: string;
    adminEmail: string;
    universityName: string | null;
    domain: string | null;
    createdAt: string;
    traineeCount: number;
    rosterCount: number;
  }[];
  trainees: {
    id: string;
    name: string;
    email: string;
    programType: 'student_attachment' | 'graduate_training' | null;
    registrationNumber: string | null;
    stage: string | null;
    universityName: string | null;
    mentorName: string | null;
    mentorEmail: string | null;
    createdAt: string;
    totalEntries: number;
    pendingEntries: number;
    verifiedEntries: number;
  }[];
  recentEntries: {
    id: string;
    traineeName: string;
    traineeEmail: string;
    programType: 'student_attachment' | 'graduate_training' | null;
    universityName: string | null;
    mentorName: string | null;
    mentorEmail: string | null;
    date: string;
    category: string;
    activity: string;
    hours: number;
    status: 'pending' | 'approved' | 'changes-requested';
    verifiedAt: string | null;
    auditDigest: string | null;
  }[];
}

export async function getBoardDashboard(boardAdminId: string): Promise<BoardDashboard> {
  const database = getDatabase();
  const [metrics, architects, universities, trainees, verifiedEntries] = await Promise.all([
    database.query<{
      qualifiedArchitects: number;
      universityAdmins: number;
      universities: number;
      attachmentStudents: number;
      graduateTrainees: number;
      pendingEntries: number;
      verifiedEntries: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM users WHERE role = 'qualified_architect' AND id <> $1) AS "qualifiedArchitects",
         (SELECT count(*)::integer FROM users WHERE role = 'university_admin' AND id <> $1) AS "universityAdmins",
         (SELECT count(*)::integer FROM university_tenants) AS universities,
         (SELECT count(*)::integer FROM trainee_profiles p
          JOIN users u ON u.id = p.user_id
          WHERE u.id <> $1 AND p.program_type = 'student_attachment') AS "attachmentStudents",
         (SELECT count(*)::integer FROM trainee_profiles p
          JOIN users u ON u.id = p.user_id
          WHERE u.id <> $1 AND p.program_type = 'graduate_training') AS "graduateTrainees",
         (SELECT count(*)::integer FROM experience_entries WHERE status = 'pending') AS "pendingEntries",
         (SELECT count(*)::integer FROM approval_audit_events) AS "verifiedEntries"`,
      [boardAdminId],
    ),
    database.query<{
      id: string;
      name: string;
      email: string;
      boardRegistrationNumber: string | null;
      qualificationDate: string | null;
      createdAt: Date;
      activeTrainees: number;
      verifiedEntries: number;
      lastVerificationAt: Date | null;
    }>(
      `SELECT u.id, u.name, u.email,
              profile.board_registration_number AS "boardRegistrationNumber",
              profile.qualification_date::text AS "qualificationDate",
              u.created_at AS "createdAt",
              (SELECT count(*)::integer FROM mentor_assignments assignment
               WHERE assignment.mentor_id = u.id AND assignment.ended_at IS NULL) AS "activeTrainees",
              (SELECT count(*)::integer FROM approval_audit_events audit
               WHERE audit.mentor_id = u.id) AS "verifiedEntries",
              (SELECT max(audit.approved_at) FROM approval_audit_events audit
               WHERE audit.mentor_id = u.id) AS "lastVerificationAt"
       FROM users u
       LEFT JOIN qualified_architect_profiles profile ON profile.user_id = u.id
       WHERE u.role = 'qualified_architect' AND u.id <> $1
       ORDER BY u.name, u.email`,
      [boardAdminId],
    ),
    database.query<{
      adminId: string;
      adminName: string;
      adminEmail: string;
      universityName: string | null;
      domain: string | null;
      createdAt: Date;
      traineeCount: number;
      rosterCount: number;
    }>(
      `SELECT u.id AS "adminId", u.name AS "adminName", u.email AS "adminEmail",
              t.name AS "universityName", d.domain,
              u.created_at AS "createdAt",
              (SELECT count(*)::integer FROM trainee_profiles p
               WHERE p.university_tenant_id = t.id) AS "traineeCount",
              (SELECT count(*)::integer FROM university_student_roster roster
               WHERE roster.tenant_id = t.id) AS "rosterCount"
       FROM users u
       LEFT JOIN university_tenants t ON t.id = u.university_tenant_id
       LEFT JOIN LATERAL (
         SELECT string_agg(domain, ', ' ORDER BY domain) AS domain
         FROM university_tenant_domains
         WHERE tenant_id = t.id
       ) d ON true
       WHERE u.role = 'university_admin' AND u.id <> $1
       ORDER BY t.name NULLS LAST, u.name, u.email`,
      [boardAdminId],
    ),
    database.query<{
      id: string;
      name: string;
      email: string;
      programType: 'student_attachment' | 'graduate_training' | null;
      registrationNumber: string | null;
      stage: string | null;
      universityName: string | null;
      mentorName: string | null;
      mentorEmail: string | null;
      createdAt: Date;
      totalEntries: number;
      pendingEntries: number;
      verifiedEntries: number;
    }>(
      `SELECT u.id, u.name, u.email, p.program_type AS "programType",
              p.registration_number AS "registrationNumber", p.stage,
              t.name AS "universityName", mentor.name AS "mentorName",
              mentor.email AS "mentorEmail", u.created_at AS "createdAt",
              (SELECT count(*)::integer FROM experience_entries entry
               WHERE entry.trainee_id = u.id) AS "totalEntries",
              (SELECT count(*)::integer FROM experience_entries entry
               WHERE entry.trainee_id = u.id AND entry.status = 'pending') AS "pendingEntries",
              (SELECT count(*)::integer FROM approval_audit_events audit
               WHERE audit.trainee_id = u.id) AS "verifiedEntries"
       FROM users u
       LEFT JOIN trainee_profiles p ON p.user_id = u.id
       LEFT JOIN university_tenants t ON t.id = p.university_tenant_id
       LEFT JOIN mentor_assignments assignment
         ON assignment.trainee_id = u.id AND assignment.ended_at IS NULL
       LEFT JOIN users mentor ON mentor.id = assignment.mentor_id
       WHERE u.role = 'trainee' AND u.id <> $1
       ORDER BY u.name, u.email`,
      [boardAdminId],
    ),
    database.query<{
      id: string;
      traineeName: string;
      traineeEmail: string;
      programType: 'student_attachment' | 'graduate_training' | null;
      universityName: string | null;
      mentorName: string | null;
      mentorEmail: string | null;
      date: string;
      category: string;
      activity: string;
      hours: string;
      status: 'pending' | 'approved' | 'changes-requested';
      verifiedAt: Date | null;
      auditDigest: string | null;
    }>(
      `SELECT entry.id, trainee.name AS "traineeName", trainee.email AS "traineeEmail",
              profile.program_type AS "programType", tenant.name AS "universityName",
              COALESCE(verifier.name, assigned_mentor.name) AS "mentorName",
              COALESCE(verifier.email, assigned_mentor.email) AS "mentorEmail",
              entry.occurred_on::text AS date, entry.category, entry.activity, entry.hours,
              entry.status, audit.approved_at AS "verifiedAt",
              audit.payload_sha256 AS "auditDigest"
       FROM experience_entries entry
       JOIN users trainee ON trainee.id = entry.trainee_id
       LEFT JOIN trainee_profiles profile ON profile.user_id = trainee.id
       LEFT JOIN university_tenants tenant ON tenant.id = profile.university_tenant_id
       LEFT JOIN mentor_assignments assignment
         ON assignment.trainee_id = trainee.id AND assignment.ended_at IS NULL
       LEFT JOIN users assigned_mentor ON assigned_mentor.id = assignment.mentor_id
       LEFT JOIN approval_audit_events audit ON audit.entry_id = entry.id
       LEFT JOIN users verifier ON verifier.id = audit.mentor_id
       WHERE trainee.id <> $1
       ORDER BY entry.created_at DESC
       LIMIT 100`,
      [boardAdminId],
    ),
  ]);

  return {
    metrics: metrics.rows[0],
    architects: architects.rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastVerificationAt: row.lastVerificationAt?.toISOString() ?? null,
    })),
    universities: universities.rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    trainees: trainees.rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    recentEntries: verifiedEntries.rows.map((row) => ({
      ...row,
      hours: Number(row.hours),
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
    })),
  };
}
