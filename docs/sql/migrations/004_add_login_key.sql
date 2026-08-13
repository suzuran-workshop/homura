-- Migration 004: Add globally unique, immutable login_key to users table.
-- The login_key is the user's canonical login identifier.
-- Username-based users use their username; OAuth users get "<platform>-<openid>"; fallback is UUID.

-- Add login_key column (initially nullable for data migration)
ALTER TABLE users ADD COLUMN login_key VARCHAR(100);

-- Backfill: username-based users get their username as login_key
UPDATE users SET login_key = username WHERE login_key IS NULL AND username IS NOT NULL;

-- Backfill: DingTalk OAuth users get dingtalk-<openid>
UPDATE users SET login_key = 'dingtalk-' || dingtalk_openid
WHERE login_key IS NULL AND dingtalk_openid IS NOT NULL;

-- Backfill: remaining users (WebAuthn-only, etc.) get a UUID
UPDATE users SET login_key = gen_random_uuid()::text WHERE login_key IS NULL;

-- Make login_key NOT NULL and add unique index
ALTER TABLE users ALTER COLUMN login_key SET NOT NULL;
CREATE UNIQUE INDEX idx_users_login_key ON users(login_key);
