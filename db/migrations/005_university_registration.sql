ALTER TABLE trainee_profiles
  ADD COLUMN IF NOT EXISTS registration_number varchar(80),
  ADD COLUMN IF NOT EXISTS program_type varchar(32) NOT NULL DEFAULT 'graduate_training';

DO $$ BEGIN
  ALTER TABLE trainee_profiles
    ADD CONSTRAINT trainee_profiles_program_type_check
    CHECK (program_type IN ('student_attachment', 'graduate_training'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS trainee_profiles_registration_number_idx
  ON trainee_profiles (lower(registration_number))
  WHERE registration_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS university_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(120) NOT NULL,
  registration_number varchar(80) NOT NULL,
  school_email varchar(254) NOT NULL,
  program_type varchar(32) NOT NULL
    CHECK (program_type IN ('student_attachment', 'graduate_training')),
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'activated')),
  reviewed_at timestamptz,
  reviewer_email varchar(254),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS university_applications_open_email_idx
  ON university_applications (lower(school_email))
  WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS university_applications_open_registration_idx
  ON university_applications (lower(registration_number))
  WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS university_applications_review_queue_idx
  ON university_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS university_activation_tokens (
  application_id uuid PRIMARY KEY
    REFERENCES university_applications(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);