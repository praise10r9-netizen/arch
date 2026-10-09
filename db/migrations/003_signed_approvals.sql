CREATE TABLE IF NOT EXISTS approval_audit_events (
  id uuid PRIMARY KEY,
  entry_id uuid NOT NULL UNIQUE REFERENCES experience_entries(id) ON DELETE RESTRICT,
  trainee_id uuid NOT NULL REFERENCES trainee_profiles(user_id) ON DELETE RESTRICT,
  mentor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  algorithm varchar(16) NOT NULL CHECK (algorithm = 'Ed25519'),
  key_id varchar(120) NOT NULL,
  payload text NOT NULL,
  payload_sha256 char(64) NOT NULL
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature bytea NOT NULL CHECK (octet_length(signature) = 64),
  public_key_pem text NOT NULL,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_audit_trainee_time_idx
  ON approval_audit_events (trainee_id, approved_at DESC);
CREATE INDEX IF NOT EXISTS approval_audit_mentor_time_idx
  ON approval_audit_events (mentor_id, approved_at DESC);

CREATE OR REPLACE FUNCTION prevent_approval_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'approval audit events are immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS approval_audit_immutable_trigger ON approval_audit_events;
CREATE TRIGGER approval_audit_immutable_trigger
  BEFORE UPDATE OR DELETE
  ON approval_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approval_audit_mutation();

CREATE OR REPLACE FUNCTION prevent_approved_experience_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'approved experience entries are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approved_experience_immutable_trigger ON experience_entries;
CREATE TRIGGER approved_experience_immutable_trigger
  BEFORE UPDATE OR DELETE
  ON experience_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_approved_experience_mutation();
