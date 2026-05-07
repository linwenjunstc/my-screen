-- ═══════════════════════════════════════════════════════════════════════════
-- PM Board V18 — Supabase SQL 执行语句
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴 → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1：创建 notifications 通知表
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID        NOT NULL,
  type         TEXT        NOT NULL,   -- task_changed | task_done | task_assigned | perm_changed
  title        TEXT        NOT NULL DEFAULT '',
  body         TEXT        NOT NULL DEFAULT '',
  nav_type     TEXT        NOT NULL DEFAULT 'task',   -- task | member
  nav_id       TEXT        NOT NULL DEFAULT '',
  is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  notifications              IS 'PM Board 系统事件通知（V18）';
COMMENT ON COLUMN notifications.recipient_id IS '接收人，对应 members.id';
COMMENT ON COLUMN notifications.type         IS '通知类型：task_changed|task_done|task_assigned|perm_changed';
COMMENT ON COLUMN notifications.nav_type     IS '点击跳转类型：task|member';
COMMENT ON COLUMN notifications.nav_id       IS '点击跳转目标 ID';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2：创建查询索引（提升铃铛加载速度）
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread
  ON notifications (recipient_id, is_read, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3：RLS 行级安全策略
--
-- 说明：本系统使用自定义 members 表登录（非 Supabase Auth），
--       RLS 通过 set_config 传递当前用户 ID。
--
-- 如果你尚未配置 set_config RPC，可以先跳过 STEP 3，
-- 直接使用 STEP 3B（关闭 RLS，用 anon key 直接访问）。
-- ─────────────────────────────────────────────────────────────────────────────

-- 启用 RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 读取：只能读自己的通知
CREATE POLICY "notif_select_own"
  ON notifications FOR SELECT
  USING (
    recipient_id::text = current_setting('app.current_user_id', true)
  );

-- 更新（标记已读）：只能更新自己的通知
CREATE POLICY "notif_update_own"
  ON notifications FOR UPDATE
  USING (
    recipient_id::text = current_setting('app.current_user_id', true)
  );

-- 写入：任何人都可以写（推送通知用，前端用 anon key 写入）
CREATE POLICY "notif_insert_any"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- 删除：不允许前端删除（由定时任务清理）
-- （无需创建 DELETE policy）


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3B（可选）：如果暂不配置 set_config，先关闭 RLS 用于测试
--                 上线前建议恢复 STEP 3 的策略
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4（可选）：自动清理 60 天以上旧通知
--
-- 需要 Supabase pg_cron 扩展（Pro 套餐支持）
-- 如未开启 pg_cron，可忽略此步骤，手动定期执行 STEP 4B 清理
-- ─────────────────────────────────────────────────────────────────────────────

-- 启用 pg_cron（需要 Pro 套餐，否则跳过）
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 注册每日凌晨 3 点清理任务（需要 pg_cron）
-- SELECT cron.schedule(
--   'clean-old-notifications',
--   '0 3 * * *',
--   $$DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '60 days'$$
-- );


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4B（手动清理）：手动执行清理 60 天前的旧通知
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '60 days';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5：验证建表结果
-- ─────────────────────────────────────────────────────────────────────────────

-- 查看表结构
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6（可选）：插入测试通知，验证前端能否正常拉取
-- 将 'YOUR_MEMBER_UUID' 替换为你自己的 members.id
-- ─────────────────────────────────────────────────────────────────────────────

-- INSERT INTO notifications (recipient_id, type, title, body, nav_type, nav_id)
-- VALUES (
--   'YOUR_MEMBER_UUID',
--   'task_changed',
--   '「测试任务」状态已变更',
--   '张三 将状态从「待启动」改为「进行中」',
--   'task',
--   'test-task-id-001'
-- );

-- 查看刚插入的通知
-- SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7（可选）：清空所有测试数据
-- ─────────────────────────────────────────────────────────────────────────────
-- TRUNCATE TABLE notifications;


-- ═══════════════════════════════════════════════════════════════════════════
-- 完成！返回前端页面刷新后即可验证通知系统。
-- ═══════════════════════════════════════════════════════════════════════════
