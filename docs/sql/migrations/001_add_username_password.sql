-- Migration 001: Add username/password authentication support
-- Existing OAuth-only users keep NULL username/password_hash

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Partial unique index: allows multiple NULLs (OAuth-only users) while
-- enforcing global uniqueness on non-NULL usernames.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;
