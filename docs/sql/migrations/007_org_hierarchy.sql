-- Migration 007: Organization hierarchy.
-- Organizations can have parent-child relationships.
-- Child orgs can access resources shared by their parent.

ALTER TABLE orgs ADD COLUMN parent_id INT REFERENCES orgs(id) ON DELETE SET NULL;
CREATE INDEX idx_orgs_parent_id ON orgs(parent_id);
