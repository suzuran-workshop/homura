-- 003: application code package storage
-- Adds the source key of the imported code zip (stored in MinIO)
-- so apps survive database resets and do not depend on host paths.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS source_key VARCHAR(500);
