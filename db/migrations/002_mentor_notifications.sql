CREATE TABLE IF NOT EXISTS mentor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid NOT NULL REFERENCES trainee_profiles(user_id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assignment_source varchar(20) NOT NULL
    CHECK (assignment_source IN ('organization', 'mentor')),
  organization_name varchar(160),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (
    (assignment_source = 'organization' AND organization_name IS NOT NULL)
    OR
    (assignment_source = 'mentor' AND organization_name IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mentor_assignments_one_active_per_trainee_idx
  ON mentor_assignments (trainee_id)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS mentor_assignments_active_mentor_idx
  ON mentor_assignments (mentor_id, trainee_id)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_mentor_assignment_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.mentor_id AND role = 'mentor'
  ) THEN
    RAISE EXCEPTION 'mentor_id must reference a mentor account'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM trainee_profiles WHERE user_id = NEW.trainee_id
  ) THEN
    RAISE EXCEPTION 'trainee_id must reference a trainee profile'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mentor_assignments_roles_trigger ON mentor_assignments;
CREATE TRIGGER mentor_assignments_roles_trigger
  BEFORE INSERT OR UPDATE OF trainee_id, mentor_id
  ON mentor_assignments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_mentor_assignment_roles();

CREATE TABLE IF NOT EXISTS mentor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainee_id uuid NOT NULL REFERENCES trainee_profiles(user_id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES experience_entries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (mentor_id, entry_id)
);

CREATE INDEX IF NOT EXISTS mentor_notifications_unread_idx
  ON mentor_notifications (mentor_id, created_at DESC)
  WHERE read_at IS NULL;
