ALTER TABLE users
  ADD COLUMN IF NOT EXISTS alternative_email varchar(254);

ALTER TABLE trainee_profiles
  ADD COLUMN IF NOT EXISTS enrollment_status varchar(16) NOT NULL DEFAULT 'ongoing';

ALTER TABLE university_applications
  ADD COLUMN IF NOT EXISTS enrollment_status varchar(16) NOT NULL DEFAULT 'ongoing';

ALTER TABLE university_student_roster
  ADD COLUMN IF NOT EXISTS enrollment_status varchar(16) NOT NULL DEFAULT 'ongoing';

DO $$ BEGIN
  ALTER TABLE trainee_profiles
    ADD CONSTRAINT trainee_profiles_enrollment_status_check
    CHECK (enrollment_status IN ('ongoing', 'graduated'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE university_applications
    ADD CONSTRAINT university_applications_enrollment_status_check
    CHECK (enrollment_status IN ('ongoing', 'graduated'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE university_student_roster
    ADD CONSTRAINT university_student_roster_enrollment_status_check
    CHECK (enrollment_status IN ('ongoing', 'graduated'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_alternative_email_differs_check
    CHECK (alternative_email IS NULL OR lower(email) <> lower(alternative_email));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION enforce_unique_account_emails()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate_email text;
  normalized_emails text[];
BEGIN
  NEW.email := lower(btrim(NEW.email));
  IF NEW.alternative_email IS NOT NULL THEN
    NEW.alternative_email := lower(btrim(NEW.alternative_email));
  END IF;

  IF NEW.alternative_email IS NOT NULL AND NEW.alternative_email = NEW.email THEN
    RAISE EXCEPTION 'primary and alternative email addresses must differ'
      USING ERRCODE = '23505';
  END IF;

  normalized_emails := array_remove(ARRAY[NEW.email, NEW.alternative_email], NULL);
  FOR candidate_email IN
    SELECT DISTINCT email_value
    FROM unnest(normalized_emails) AS candidates(email_value)
    ORDER BY email_value
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(candidate_email, 0));
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM users account
    WHERE account.id IS DISTINCT FROM NEW.id
      AND (
        lower(account.email) = ANY(normalized_emails)
        OR lower(account.alternative_email) = ANY(normalized_emails)
      )
  ) THEN
    RAISE EXCEPTION 'email address is already assigned to another account'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_unique_account_emails ON users;
CREATE TRIGGER users_unique_account_emails
  BEFORE INSERT OR UPDATE OF email, alternative_email ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_unique_account_emails();

CREATE UNIQUE INDEX IF NOT EXISTS users_lower_email_unique_idx
  ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_alternative_email_unique_idx
  ON users (lower(alternative_email))
  WHERE alternative_email IS NOT NULL;

DROP INDEX IF EXISTS trainee_profiles_tenant_registration_idx;
DROP INDEX IF EXISTS trainee_profiles_unassigned_registration_idx;
DROP INDEX IF EXISTS trainee_profiles_registration_number_idx;
CREATE UNIQUE INDEX trainee_profiles_registration_number_unique_idx
  ON trainee_profiles (lower(registration_number))
  WHERE registration_number IS NOT NULL;

DROP INDEX IF EXISTS university_student_roster_registration_idx;
DROP INDEX IF EXISTS university_student_roster_email_idx;
CREATE UNIQUE INDEX university_student_roster_registration_unique_idx
  ON university_student_roster (lower(registration_number));
CREATE UNIQUE INDEX university_student_roster_email_unique_idx
  ON university_student_roster (lower(school_email));

DROP INDEX IF EXISTS university_applications_open_email_idx;
DROP INDEX IF EXISTS university_applications_open_registration_idx;
DROP INDEX IF EXISTS university_applications_tenant_registration_idx;
DROP INDEX IF EXISTS university_applications_unassigned_registration_idx;
CREATE UNIQUE INDEX university_applications_open_email_unique_idx
  ON university_applications (lower(school_email))
  WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX university_applications_open_registration_unique_idx
  ON university_applications (lower(registration_number))
  WHERE status IN ('pending', 'approved');