-- ══════════════════════════════════════════════════════════════════════
-- PM Board V20 — 模块功能数据库迁移
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴 → Run
-- ══════════════════════════════════════════════════════════════════════

-- STEP 1：创建 modules 表
CREATE TABLE IF NOT EXISTS modules (
  id          TEXT        PRIMARY KEY,
  project_id  TEXT        NOT NULL,
  name        TEXT        NOT NULL DEFAULT '',
  description TEXT        NOT NULL DEFAULT '',
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  modules             IS 'PM Board 项目模块（V20）';
COMMENT ON COLUMN modules.project_id  IS '所属项目 ID';
COMMENT ON COLUMN modules.sort_order  IS '模块排列顺序，数值越小越靠前';

-- STEP 2：tasks 表新增 module_id 列
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS module_id TEXT;

COMMENT ON COLUMN tasks.module_id IS '所属模块 ID，NULL 表示未分类';

-- STEP 3：创建索引
CREATE INDEX IF NOT EXISTS idx_modules_project
  ON modules (project_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_tasks_module
  ON tasks (module_id);

-- STEP 4：验证建表结果
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'modules'
ORDER BY ordinal_position;

-- STEP 5：tasks 表新增 assignees 列（V20 多负责人）
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignees JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tasks.assignees IS '负责人 ID 数组，assignee 存主负责人保持向后兼容';

-- STEP 6：modules 表 RLS 策略
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modules_super_admin_all" ON modules;
CREATE POLICY "modules_super_admin_all" ON modules
  FOR ALL USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "modules_admin_all" ON modules;
CREATE POLICY "modules_admin_all" ON modules
  FOR ALL USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "modules_user_read" ON modules;
CREATE POLICY "modules_user_read" ON modules
  FOR SELECT
  USING (
    get_current_user_role() = 'user'
    AND project_id IN (
      SELECT id::text FROM projects WHERE members ? get_current_user_id()
    )
  );
