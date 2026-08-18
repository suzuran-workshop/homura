-- Suzuran Cloud 数据库初始化脚本
-- PostgreSQL 15+

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 多租户核心表
-- ============================================

-- 组织表（租户，平级结构，无 parent_id）
CREATE TABLE orgs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    dingtalk_corp_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户表（全局）— 支持用户名/密码登录，WebAuthn/钉钉作为补充
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20),
    email VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(255),
    position VARCHAR(255),
    username VARCHAR(50),
    password_hash VARCHAR(255),
    dingtalk_userid VARCHAR(100) UNIQUE,
    dingtalk_unionid VARCHAR(100),
    dingtalk_openid VARCHAR(100),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_dingtalk_unionid ON users(dingtalk_unionid);
CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

-- WebAuthn 凭证表（Passkey 注册）
CREATE TABLE webauthn_credentials (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    attestation_type VARCHAR(100),
    aaguid VARCHAR(255),
    sign_count INT DEFAULT 0,
    transports JSONB,
    user_id_bytes BYTEA,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);
CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_credentials_user_id_bytes ON webauthn_credentials(user_id_bytes);

-- OAuth2 客户端表（应用作为 OAuth client）
CREATE TABLE oauth_clients (
    id VARCHAR(64) PRIMARY KEY,
    org_id INT REFERENCES orgs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    redirect_uris JSONB,
    scopes JSONB,
    confidential BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_oauth_clients_org_id ON oauth_clients(org_id);

-- OAuth2 token 表（access + refresh）
CREATE TABLE oauth_tokens (
    id VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id INT,
    client_id VARCHAR(64) NOT NULL,
    scope VARCHAR(255),
    refresh_token_hash VARCHAR(64),
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_client_id ON oauth_tokens(client_id);
CREATE INDEX idx_oauth_tokens_refresh_hash ON oauth_tokens(refresh_token_hash);

-- OAuth2 授权码会话表（authorization_code 流程）
CREATE TABLE oauth_sessions (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    code_challenge VARCHAR(128),
    code_challenge_method VARCHAR(10),
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id INT,
    client_id VARCHAR(64) NOT NULL,
    redirect_uri TEXT,
    scope VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_oauth_sessions_code ON oauth_sessions(code);
CREATE INDEX idx_oauth_sessions_client_id ON oauth_sessions(client_id);

-- 组织-用户关联表
CREATE TABLE org_user_bonds (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT,
    is_admin BOOLEAN DEFAULT FALSE,
    is_department_manager BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- 部门表（树形结构，同一 org 内多层级）
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id INT REFERENCES departments(id) ON DELETE SET NULL,
    level INT DEFAULT 1,
    manager_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    dingtalk_dept_id BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 审计与日志
-- ============================================

-- 审计日志
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    org_id INT REFERENCES orgs(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(100), -- read, create, update, delete
    resource_type VARCHAR(100),
    resource_id INT,
    request_data JSONB,
    response_status INT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 登录日志
CREATE TABLE login_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    org_id INT REFERENCES orgs(id),
    login_method VARCHAR(50), -- password, dingtalk, oauth
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT FALSE,
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 钉钉同步日志
CREATE TABLE dingtalk_sync_logs (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    sync_type VARCHAR(50), -- department, user, full
    status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    message TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- ============================================
-- 索引优化
-- ============================================

CREATE UNIQUE INDEX idx_orgs_name ON orgs(name);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_oauth_tokens_org_id ON oauth_tokens(org_id);
CREATE INDEX idx_oauth_sessions_user_id ON oauth_sessions(user_id);
CREATE INDEX idx_org_user_bonds_org_id ON org_user_bonds(org_id);
CREATE INDEX idx_org_user_bonds_user_id ON org_user_bonds(user_id);
CREATE INDEX idx_org_user_bonds_dept_id ON org_user_bonds(department_id);
CREATE INDEX idx_departments_org_id ON departments(org_id);
CREATE INDEX idx_departments_parent_id ON departments(parent_id);
CREATE UNIQUE INDEX idx_departments_dingtalk_dept_id
    ON departments(org_id, dingtalk_dept_id)
    WHERE dingtalk_dept_id IS NOT NULL;
CREATE INDEX idx_audit_logs_org_user ON audit_logs(org_id, user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_dingtalk_sync_logs_org ON dingtalk_sync_logs(org_id);

-- ============================================
-- 系统首次运行时无账户，由管理员通过 OOBE 模式初始化。
-- ============================================

-- ============================================
-- 应用运行时表（Spec 04）
-- ============================================

-- 应用表
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(64) PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    runtime VARCHAR(50),
    entrypoint VARCHAR(500),
    port INT,
    cpu_quota VARCHAR(20),
    memory_quota VARCHAR(20),
    db_conn_quota INT DEFAULT 10,
    mcp_scopes JSONB,
    routes JSONB,
    status VARCHAR(20) DEFAULT 'created',
    container_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_org_id ON applications(org_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- 应用部署历史表
CREATE TABLE IF NOT EXISTS application_deployments (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    version VARCHAR(50),
    image_tag VARCHAR(200),
    status VARCHAR(20) DEFAULT 'building',
    container_id VARCHAR(100),
    logs TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_deployments_app_id ON application_deployments(application_id);

-- ============================================
-- 应用分发 + 应用管理员（2026-08）
-- 一个应用可分发到多个组织；每个 (应用, 组织) 可有多个应用管理员。
-- 服务商（org 1 成员）天然是任何应用的管理员，无需记录。
-- ============================================

CREATE TABLE IF NOT EXISTS application_distributions (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(64) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_dist_app_org ON application_distributions(app_id, org_id);

CREATE TABLE IF NOT EXISTS application_admins (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(64) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_admins_app_org_user ON application_admins(app_id, org_id, user_id);

-- ============================================
-- 首次部署说明：
-- 系统首次运行时无任何账户，管理员需通过 OOBE 模式初始化系统。
-- ============================================

-- ============================================
-- 流程引擎表（Spec 06）
-- ============================================

-- 流程定义表
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_org_id ON workflow_definitions(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);

-- 流程实例表
CREATE TABLE IF NOT EXISTS workflow_instances (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    definition_id INT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    current_step VARCHAR(255),
    variables JSONB,
    created_by INT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_org_id ON workflow_instances(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_def_id ON workflow_instances(definition_id);

-- 流程任务表（审批待办）
CREATE TABLE IF NOT EXISTS workflow_tasks (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    instance_id INT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    step_name VARCHAR(255) NOT NULL,
    assignee_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    acted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_org_id ON workflow_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_instance_id ON workflow_tasks(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assignee_id ON workflow_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);

-- ============================================
-- 数据工具表（Spec 05）
-- ============================================

CREATE TABLE IF NOT EXISTS data_tables (
    id SERIAL PRIMARY KEY,
    app_id VARCHAR(64) NOT NULL,
    org_id INT NOT NULL,
    table_name VARCHAR(63) NOT NULL,
    columns JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(app_id, table_name, org_id)
);
CREATE INDEX IF NOT EXISTS idx_data_tables_app_id ON data_tables(app_id);
CREATE INDEX IF NOT EXISTS idx_data_tables_org_id ON data_tables(org_id);
