-- SEC-04: Supabase Row Level Security (RLS)
-- ⚠ 分步执行！每执行一段后验证功能正常再继续
-- ⚠ 执行前先确认 Supabase anon key 已配置 JWT secret

-- ══════════════════════════════════════
-- 辅助函数
-- ══════════════════════════════════════

-- 获取当前请求的用户 ID（从 JWT claim 中读取）
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '');
$$;

-- 获取当前用户角色
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT role FROM members WHERE id::text = get_current_user_id();
$$;

-- 判断当前用户是否是 admin 或 super_admin
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(get_current_user_role() IN ('admin', 'super_admin'), FALSE);
$$;

-- ══════════════════════════════════════
-- tasks 表
-- ══════════════════════════════════════
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_super_admin_all" ON tasks;
CREATE POLICY "tasks_super_admin_all" ON tasks
  FOR ALL
  USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "tasks_admin_read" ON tasks;
CREATE POLICY "tasks_admin_read" ON tasks
  FOR SELECT
  USING (
    get_current_user_role() = 'admin'
    AND assignee NOT IN (
      SELECT id::text FROM members WHERE role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "tasks_admin_write" ON tasks;
CREATE POLICY "tasks_admin_write" ON tasks
  FOR INSERT
  WITH CHECK (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "tasks_admin_update" ON tasks;
CREATE POLICY "tasks_admin_update" ON tasks
  FOR UPDATE
  USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "tasks_admin_delete" ON tasks;
CREATE POLICY "tasks_admin_delete" ON tasks
  FOR DELETE
  USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "tasks_user_read" ON tasks;
CREATE POLICY "tasks_user_read" ON tasks
  FOR SELECT
  USING (
    get_current_user_role() = 'user'
    AND (
      assignee = get_current_user_id()
      OR project_id IN (
        SELECT id::text FROM projects
        WHERE members ? get_current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS "tasks_user_write_own" ON tasks;
CREATE POLICY "tasks_user_write_own" ON tasks
  FOR UPDATE
  USING (
    get_current_user_role() = 'user'
    AND assignee = get_current_user_id()
  );

-- ══════════════════════════════════════
-- projects 表
-- ══════════════════════════════════════
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_super_admin_all" ON projects;
CREATE POLICY "projects_super_admin_all" ON projects
  FOR ALL USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "projects_admin_all" ON projects;
CREATE POLICY "projects_admin_all" ON projects
  FOR ALL USING (get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "projects_user_read" ON projects;
CREATE POLICY "projects_user_read" ON projects
  FOR SELECT
  USING (
    get_current_user_role() = 'user'
    AND members ? get_current_user_id()
  );

-- ══════════════════════════════════════
-- members 表（最敏感）
-- ══════════════════════════════════════
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_super_admin_all" ON members;
CREATE POLICY "members_super_admin_all" ON members
  FOR ALL USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "members_admin_read" ON members;
CREATE POLICY "members_admin_read" ON members
  FOR SELECT
  USING (
    get_current_user_role() = 'admin'
    AND role != 'super_admin'
  );

DROP POLICY IF EXISTS "members_admin_write" ON members;
CREATE POLICY "members_admin_write" ON members
  FOR UPDATE
  USING (
    get_current_user_role() = 'admin'
    AND role = 'user'
  );

DROP POLICY IF EXISTS "members_user_read_self" ON members;
CREATE POLICY "members_user_read_self" ON members
  FOR SELECT
  USING (
    get_current_user_role() = 'user'
    AND id::text = get_current_user_id()
  );

DROP POLICY IF EXISTS "members_user_update_own_password" ON members;
CREATE POLICY "members_user_update_own_password" ON members
  FOR UPDATE
  USING (
    get_current_user_role() = 'user'
    AND id::text = get_current_user_id()
  )
  WITH CHECK (
    id::text = get_current_user_id()
    AND role = (SELECT role FROM members WHERE id::text = get_current_user_id())
  );

-- ══════════════════════════════════════
-- logs 表
-- ══════════════════════════════════════
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_super_admin_all" ON logs;
CREATE POLICY "logs_super_admin_all" ON logs
  FOR ALL USING (get_current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "logs_admin_read" ON logs;
CREATE POLICY "logs_admin_read" ON logs
  FOR SELECT
  USING (
    get_current_user_role() = 'admin'
    AND user_id NOT IN (SELECT id::text FROM members WHERE role = 'super_admin')
  );

DROP POLICY IF EXISTS "logs_insert_own" ON logs;
CREATE POLICY "logs_insert_own" ON logs
  FOR INSERT
  WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS "logs_user_read_own" ON logs;
CREATE POLICY "logs_user_read_own" ON logs
  FOR SELECT
  USING (
    get_current_user_role() = 'user'
    AND user_id = get_current_user_id()
  );

-- ══════════════════════════════════════
-- global_tags 表（较宽松）
-- ══════════════════════════════════════
ALTER TABLE global_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_read_all" ON global_tags;
CREATE POLICY "tags_read_all" ON global_tags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "tags_write_admin" ON global_tags;
CREATE POLICY "tags_write_admin" ON global_tags
  FOR ALL USING (is_admin_or_above());
