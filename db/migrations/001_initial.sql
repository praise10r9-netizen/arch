DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('trainee', 'mentor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE experience_status AS ENUM ('pending', 'approved', 'changes-requested');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attachment_kind AS ENUM ('evidence', 'certificate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'trainee',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS trainee_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stage varchar(120) NOT NULL DEFAULT 'Graduate Training',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experience_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid NOT NULL REFERENCES trainee_profiles(user_id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  category varchar(80) NOT NULL,
  activity varchar(500) NOT NULL CHECK (char_length(activity) BETWEEN 10 AND 500),
  hours numeric(5, 2) NOT NULL
    CHECK (hours > 0 AND hours <= 24 AND hours * 4 = trunc(hours * 4)),
  status experience_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_entries_trainee_date_idx
  ON experience_entries (trainee_id, occurred_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS trainee_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid NOT NULL REFERENCES trainee_profiles(user_id) ON DELETE CASCADE,
  kind attachment_kind NOT NULL,
  filename varchar(180) NOT NULL,
  media_type varchar(80) NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'evidence' AND media_type IN ('image/jpeg', 'image/png', 'image/webp'))
    OR
    (kind = 'certificate' AND media_type IN
      ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS trainee_one_evidence_image_idx
  ON trainee_attachments (trainee_id) WHERE kind = 'evidence';
CREATE INDEX IF NOT EXISTS trainee_certificates_idx
  ON trainee_attachments (trainee_id, created_at DESC) WHERE kind = 'certificate';
