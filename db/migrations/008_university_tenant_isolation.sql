ALTER TABLE users
  ADD COLUMN IF NOT EXISTS university_tenant_id uuid
    REFERENCES university_tenants(id) ON DELETE SET NULL;

ALTER TABLE trainee_profiles
  ADD COLUMN IF NOT EXISTS university_tenant_id uuid
    REFERENCES university_tenants(id) ON DELETE SET NULL;

UPDATE university_applications a
SET tenant_id = d.tenant_id
FROM university_tenant_domains d
WHERE a.tenant_id IS NULL
  AND lower(split_part(a.school_email, '@', 2)) = d.domain;

UPDATE trainee_profiles p
SET university_tenant_id = d.tenant_id
FROM users u
JOIN university_tenant_domains d
  ON lower(split_part(u.email, '@', 2)) = d.domain
WHERE p.user_id = u.id
  AND p.university_tenant_id IS NULL;

DROP INDEX IF EXISTS trainee_profiles_registration_number_idx;
CREATE UNIQUE INDEX trainee_profiles_tenant_registration_idx
  ON trainee_profiles (university_tenant_id, lower(registration_number))
  WHERE university_tenant_id IS NOT NULL AND registration_number IS NOT NULL;
CREATE UNIQUE INDEX trainee_profiles_unassigned_registration_idx
  ON trainee_profiles (lower(registration_number))
  WHERE university_tenant_id IS NULL AND registration_number IS NOT NULL;

DROP INDEX IF EXISTS university_applications_open_registration_idx;
CREATE UNIQUE INDEX university_applications_tenant_registration_idx
  ON university_applications (tenant_id, lower(registration_number))
  WHERE tenant_id IS NOT NULL AND status IN ('pending', 'approved');
CREATE UNIQUE INDEX university_applications_unassigned_registration_idx
  ON university_applications (lower(registration_number))
  WHERE tenant_id IS NULL AND status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS users_university_tenant_idx
  ON users (university_tenant_id)
  WHERE university_tenant_id IS NOT NULL;
