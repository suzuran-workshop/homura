-- Suzuran Cloud 数据工具迁移脚本
-- 为应用提供通用数据存储能力

-- 应用数据表元数据跟踪表
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
