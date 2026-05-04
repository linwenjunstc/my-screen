-- SEC-03: 密码哈希迁移
-- 在 Supabase Dashboard → SQL Editor 中执行此文件
-- 执行前请确保已备份 members 表

-- Step 1: 启用 pgcrypto 扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: 为 members 表添加哈希密码列
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Step 3: 将现有明文密码批量哈希（一次性迁移）
-- work factor 10 = bcrypt，内部工具足够
UPDATE members
SET password_hash = crypt(password, gen_salt('bf', 10))
WHERE password IS NOT NULL AND password_hash IS NULL;

-- Step 4: 验证迁移结果（应为 0 行）
SELECT COUNT(*) AS unmigrated_count FROM members WHERE password_hash IS NULL AND password IS NOT NULL;

-- Step 5: 密码验证函数（供 Edge Function 调用）
CREATE OR REPLACE FUNCTION verify_password(plain TEXT, hashed TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT hashed = crypt(plain, hashed);
$$;

-- Step 6: 密码哈希函数（供懒迁移和修改密码使用）
CREATE OR REPLACE FUNCTION hash_password(plain TEXT)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT crypt(plain, gen_salt('bf', 10));
$$;
