-- Migration 005: Add organization-scoped role system.
-- Roles are "flowing positions" within an org — separate from the
-- system-level provider/tenant distinction.

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_name ON roles(org_id, name);
CREATE INDEX IF NOT EXISTS idx_roles_org_id ON roles(org_id);

CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id ON user_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
