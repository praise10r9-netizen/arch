ALTER TABLE trainee_attachments
  ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES experience_entries(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS trainee_one_evidence_image_idx;

CREATE UNIQUE INDEX IF NOT EXISTS trainee_one_evidence_image_per_entry_idx
  ON trainee_attachments (entry_id)
  WHERE kind = 'evidence' AND entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS trainee_attachments_entry_idx
  ON trainee_attachments (entry_id, created_at DESC)
  WHERE entry_id IS NOT NULL;
