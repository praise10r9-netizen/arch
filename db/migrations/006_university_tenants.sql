CREATE TABLE IF NOT EXISTS university_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  admin_email varchar(254) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS university_tenant_domains (
  domain varchar(253) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES university_tenants(id) ON DELETE CASCADE,
  verification_mode varchar(24) NOT NULL DEFAULT 'simulation'
    CHECK (verification_mode IN ('simulation')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS university_student_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES university_tenants(id) ON DELETE CASCADE,
  registration_number varchar(80) NOT NULL,
  full_name varchar(120) NOT NULL,
  school_email varchar(254) NOT NULL,
  program_type varchar(32) NOT NULL
    CHECK (program_type IN ('student_attachment', 'graduate_training')),
  cohort varchar(80),
  status varchar(16) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'invited', 'activated')),
  application_id uuid UNIQUE REFERENCES university_applications(id) ON DELETE SET NULL,
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS university_student_roster_registration_idx
  ON university_student_roster (tenant_id, lower(registration_number));
CREATE UNIQUE INDEX IF NOT EXISTS university_student_roster_email_idx
  ON university_student_roster (tenant_id, lower(school_email));
CREATE INDEX IF NOT EXISTS university_student_roster_status_idx
  ON university_student_roster (tenant_id, status, created_at DESC);

ALTER TABLE university_applications
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES university_tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS roster_id uuid REFERENCES university_student_roster(id) ON DELETE SET NULL;