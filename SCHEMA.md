# V14 数据库表结构 — Supabase SQL

所有表均在 `public` schema 下，Supabase 项目地址：`https://rfjrkcclhvuldenpdlye.supabase.co`

> **V14 变更**：无新增表。`actual_receipts` 和 `actual_payments` 表在 V14 中增加了 T2/T3 快捷录入入口，数据写入路径从仅 T5/T6 扩展到 T2→T5 和 T3→T6 双入口。

---

## 1. members — 用户/成员表

```sql
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  color_idx INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user',           -- 'user' | 'admin' | 'super_admin'
  menu_perms JSONB DEFAULT NULL       -- null 表示使用角色默认权限
);
```

---

## 2. tasks — 任务表

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project_id TEXT,                     -- 关联 projects.id
  assignee TEXT,                       -- 关联 members.id
  due TEXT,                            -- 截止日期 YYYY-MM-DD
  priority TEXT DEFAULT 'medium',     -- 'low' | 'medium' | 'high' | 'urgent'
  status TEXT DEFAULT 'todo',         -- 'todo' | 'in_progress' | 'done'
  done BOOLEAN DEFAULT FALSE,
  tags JSONB DEFAULT '[]',            -- 标签 ID 数组
  subtasks JSONB DEFAULT '[]',        -- 子任务数组 [{id, title, done}]
  dependencies JSONB DEFAULT '[]',    -- 前置条件任务 ID 数组
  logs JSONB DEFAULT '[]',            -- 时间线记录 [{time, content}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  start_date TEXT,                     -- 开始日期 YYYY-MM-DD
  completed_at TIMESTAMPTZ,
  completed_by TEXT,                   -- 完成人 members.id
  recurring TEXT,                      -- 重复规则
  milestone BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. projects — 项目表

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color_idx INTEGER DEFAULT 0,
  members JSONB DEFAULT '[]'          -- 项目成员 members.id 数组
);
```

---

## 4. tags — 标签表

```sql
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  palette_idx INTEGER DEFAULT 0
);
```

---

## 5. logs — 操作日志表

```sql
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,                -- 如 '添加任务' '完成任务' '甘特图调整' '删除项目' 等
  detail TEXT,                         -- JSON 字符串，甘特图调整时含 taskId/taskTitle/mode/oldDue/newDue
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. payment_plans — 对下付款计划（T3）

```sql
CREATE TABLE IF NOT EXISTS payment_plans (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,            -- 'YYYY-MM'
  contract_name TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  downstream_contract_id TEXT,         -- 关联 contracts_downstream.id
  contract_amount NUMERIC DEFAULT 0,
  plan_cash NUMERIC DEFAULT 0,         -- 计划现金付款
  plan_supply_chain NUMERIC DEFAULT 0, -- 计划供应链付款
  cumulative_paid NUMERIC DEFAULT 0,   -- 累计已付
  remark TEXT,
  creator_id TEXT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. receipt_records — 对上收款台账（T2）

```sql
CREATE TABLE IF NOT EXISTS receipt_records (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  contract_name TEXT,
  customer_id TEXT,
  customer_name TEXT,
  upstream_contract_id TEXT,           -- 关联 contracts_upstream.id
  contract_amount NUMERIC DEFAULT 0,
  confirmed_output NUMERIC DEFAULT 0,  -- 确认产值
  prev_received NUMERIC DEFAULT 0,     -- 截至上期累计已收款
  plan_amount NUMERIC DEFAULT 0,       -- 本期计划收款
  cumulative_received NUMERIC DEFAULT 0,
  next_expected_date TEXT,
  remark TEXT,
  creator_id TEXT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. extra_expenses — 额外支出

```sql
CREATE TABLE IF NOT EXISTS extra_expenses (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  expense_date TEXT,
  amount NUMERIC DEFAULT 0,
  remark TEXT
);
```

---

## 9. actual_receipts — 实际收款明细（T5 偏差分析 + T2 快捷录入）

```sql
CREATE TABLE IF NOT EXISTS actual_receipts (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  receipt_date TEXT,
  contract_name TEXT,
  customer_name TEXT,
  upstream_contract_id TEXT,
  amount NUMERIC DEFAULT 0,
  remark TEXT
);
```

---

## 10. actual_payments — 实际支付明细（T6 偏差分析 + T3 快捷录入）

```sql
CREATE TABLE IF NOT EXISTS actual_payments (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  payment_date TEXT,
  contract_name TEXT,
  supplier_name TEXT,
  downstream_contract_id TEXT,
  amount NUMERIC DEFAULT 0,
  remark TEXT
);
```

---

## 11. finance_summary — 月度资金汇总（T1/T4）

```sql
CREATE TABLE IF NOT EXISTS finance_summary (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  -- 计划数（T1 编辑）
  labor_cost NUMERIC DEFAULT 0,           -- 人工费
  dept_cost NUMERIC DEFAULT 0,            -- 部门费用
  amortization NUMERIC DEFAULT 0,         -- 摊销
  company_lock NUMERIC DEFAULT 0,         -- 公司锁定
  debt_service NUMERIC DEFAULT 0,         -- 还本付息
  shareholder_injection NUMERIC DEFAULT 0, -- 股东注资
  shareholder_loan NUMERIC DEFAULT 0,      -- 股东借款
  working_capital_loan NUMERIC DEFAULT 0,  -- 流动资金贷款
  supply_chain_finance NUMERIC DEFAULT 0,  -- 供应链金融
  -- 实际数（T4 编辑）
  actual_labor NUMERIC DEFAULT 0,
  actual_dept NUMERIC DEFAULT 0,
  actual_amortization NUMERIC DEFAULT 0,
  actual_company_lock NUMERIC DEFAULT 0,
  actual_debt_service NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 12. finance_config — 系统配置

```sql
CREATE TABLE IF NOT EXISTS finance_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  company_name TEXT DEFAULT '',
  dept_name TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 13. customers — 客户库

```sql
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  contact TEXT,
  phone TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 14. suppliers — 供应商库

```sql
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  contact TEXT,
  phone TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 15. contracts_upstream — 对上合同

```sql
CREATE TABLE IF NOT EXISTS contracts_upstream (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  main_contract_no TEXT,
  customer_id TEXT,
  customer_name TEXT,
  sign_date TEXT,
  amount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  target_profit_rate NUMERIC DEFAULT 0,
  measured_revenue NUMERIC DEFAULT 0,
  assessment_year TEXT,
  revenue_assessment_year TEXT,
  status TEXT DEFAULT 'active',       -- 'active' | 'settled'
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 16. contracts_downstream — 对下合同

```sql
CREATE TABLE IF NOT EXISTS contracts_downstream (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name TEXT,
  amount NUMERIC DEFAULT 0,
  upstream_contract_id TEXT,           -- 关联对上合同
  status TEXT DEFAULT 'active',       -- 'active' | 'settled'
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 17. contract_monthly_revenue — 合同月度营收

```sql
CREATE TABLE IF NOT EXISTS contract_monthly_revenue (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,           -- 关联 contracts_upstream.id
  year_month TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  count INTEGER DEFAULT 0,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 18. receipt_variance — 收款偏差分析（T5 上月）

```sql
CREATE TABLE IF NOT EXISTS receipt_variance (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  receipt_record_id TEXT,
  contract_name TEXT,
  customer_name TEXT,
  contract_amount NUMERIC DEFAULT 0,
  plan_amount NUMERIC DEFAULT 0,
  actual_amount NUMERIC DEFAULT 0,
  difference_reason TEXT,
  creator_id TEXT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 19. payment_variance — 支付偏差分析（T6 上月）

```sql
CREATE TABLE IF NOT EXISTS payment_variance (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  payment_plan_id TEXT,
  contract_name TEXT,
  supplier_name TEXT,
  contract_amount NUMERIC DEFAULT 0,
  purpose TEXT,
  plan_cash NUMERIC DEFAULT 0,
  plan_supply_chain NUMERIC DEFAULT 0,
  actual_cash NUMERIC DEFAULT 0,
  actual_supply_chain NUMERIC DEFAULT 0,
  difference_reason TEXT,
  creator_id TEXT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 日志操作类型（action 字段参考值）

### PM 任务
`添加任务` `编辑任务` `完成任务` `删除任务` `添加子任务` `完成子任务` `删除子任务` `设置前置条件` `移除前置条件`

### PM 项目
`添加项目` `编辑项目` `删除项目` `添加标签` `编辑标签` `删除标签`

### PM 甘特图
`甘特图调整` `gantt_adjust`

### PM 成员
`添加成员` `删除成员` `修改角色` `重置密码` `修改密码` `用户登录` `配置菜单权限`

### Finance
`新增收款记录` `更新收款记录` `删除收款记录`
`新增付款明细` `更新付款明细` `删除付款明细`
`新增实际收款` `更新实际收款` `删除实际收款`
`新增实际支付` `更新实际支付` `删除实际支付`
`新增对上合同` `更新对上合同` `删除对上合同`
`新增对下合同` `更新对下合同` `删除对下合同`
`新增客户` `更新客户` `删除客户`
`新增供应商` `更新供应商` `删除供应商`
`导出资金报表` `编辑月度计划` `编辑完成情况`

---

## 初始化必建表

最少需要 `members`、`tasks`、`projects` 三张表即可启动 PM 模块。
Finance 模块需要额外的 11 张 finance_* 表。
`logs` 表用于操作日志（可选，写入失败不影响主功能）。
