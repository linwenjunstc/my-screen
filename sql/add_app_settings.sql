-- V16: 应用配置表（存储加密后的 API Key 等）
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- 本应用使用 anon key，RLS 无法按用户过滤
-- 安全由应用层保证：仅 super_admin 可见设置 UI，Key 加密存储
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON app_settings FOR ALL USING (true);
