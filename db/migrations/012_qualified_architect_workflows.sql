UPDATE users
SET role = 'qualified_architect'
WHERE role = 'mentor';

CREATE TABLE IF NOT EXISTS qualified_architect_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  board_registration_number varchar(80),
  qualification_date date,
  activation_completed_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO qualified_architect_profiles (user_id)
SELECT id FROM users WHERE role = 'qualified_architect'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS qualified_architect_activation_tokens (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qualified_architect_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  architect_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainee_email varchar(254) NOT NULL,
  organization_name varchar(160) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamptz NOT NULL,
  trainee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'accepted' AND trainee_id IS NOT NULL AND accepted_at IS NOT NULL)
    OR status <> 'accepted'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS qualified_architect_one_pending_invite_idx
  ON qualified_architect_invitations (architect_id, lower(trainee_email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS qualified_architect_invites_inbox_idx
  ON qualified_architect_invitations (trainee_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION enforce_mentor_assignment_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.mentor_id AND role = 'qualified_architect'
  ) THEN
    RAISE EXCEPTION 'mentor_id must reference a qualified architect account'
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
