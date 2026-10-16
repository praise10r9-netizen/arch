ALTER TABLE qualified_architect_invitations
  ADD COLUMN IF NOT EXISTS enrollment_status varchar(16) NOT NULL DEFAULT 'graduated';

DO $$ BEGIN
  ALTER TABLE qualified_architect_invitations
    ADD CONSTRAINT qualified_architect_invitations_enrollment_status_check
    CHECK (enrollment_status IN ('ongoing', 'graduated'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE trainee_profiles
SET enrollment_status = 'graduated'
WHERE program_type = 'graduate_training'
  AND enrollment_status = 'ongoing';

UPDATE university_applications
SET enrollment_status = 'graduated'
WHERE program_type = 'graduate_training'
  AND enrollment_status = 'ongoing';

UPDATE university_student_roster
SET enrollment_status = 'graduated'
WHERE program_type = 'graduate_training'
  AND enrollment_status = 'ongoing';

ALTER TABLE experience_entries
  ADD COLUMN IF NOT EXISTS review_instructions varchar(1000),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
