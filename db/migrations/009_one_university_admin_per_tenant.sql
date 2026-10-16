CREATE UNIQUE INDEX IF NOT EXISTS users_one_university_admin_per_tenant_idx
  ON users (university_tenant_id)
  WHERE role = 'university_admin' AND university_tenant_id IS NOT NULL;
