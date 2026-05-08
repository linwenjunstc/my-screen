-- Migration: Add base_gross_margin to finance_config
-- PRD #7 Phase 3 · 反算合同额公式修复
-- Execute in Supabase SQL Editor

ALTER TABLE finance_config
  ADD COLUMN IF NOT EXISTS base_gross_margin NUMERIC(6,4) DEFAULT NULL;

COMMENT ON COLUMN finance_config.base_gross_margin IS '公司基准毛利率，用于反算合同额，如 0.25 表示 25%';
