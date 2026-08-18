-- Migration 002: App distribution + app admins
-- An app can be distributed to multiple orgs; each (app, org) pair can have
-- multiple app admins with full read/write access to the app's data.

CREATE TABLE IF NOT EXISTS application_distributions (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(255) NOT NULL,
    org_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_dist_app_org ON application_distributions(app_id, org_id);

CREATE TABLE IF NOT EXISTS application_admins (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(255) NOT NULL,
    org_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_admins_app_org_user ON application_admins(app_id, org_id, user_id);
