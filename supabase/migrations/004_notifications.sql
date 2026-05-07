-- notifications 表：云端事件通知系统
-- 前置依赖：FEAT-03 需先在 Supabase SQL Editor 执行此文件
-- 注意：本应用使用 anon key 直连 Supabase，认证在 JS 层处理，不依赖 JWT/RLS

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  recipient_id TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'info',
  title       TEXT        NOT NULL DEFAULT '',
  body        TEXT        NOT NULL DEFAULT '',
  nav_type    TEXT        NOT NULL DEFAULT 'task',
  nav_id      TEXT        NOT NULL DEFAULT '',
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread
  ON notifications(recipient_id, is_read, created_at DESC);

-- 启用实时同步（Supabase Realtime 需显式加入 publication）
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
