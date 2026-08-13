-- Migration 006: Multi-department membership.
-- A user can belong to multiple departments within an org.

CREATE TABLE IF NOT EXISTS user_departments (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, user_id, department_id)
);
CREATE INDEX IF NOT EXISTS idx_user_departments_org_id ON user_departments(org_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept_id ON user_departments(department_id);
