# PMBoard V12 更新日志

**基于**：V11 代码库  
**日期**：2026-04-30  
**PRD**：PMBoard_PRD_v11.md

---

## 1. 甘特图时间条可拖拽调整截止日期

**文件**：`js/pm-views.js`、`css/pm.css`

- `renderGantt()`：时间条增加 `class="gantt-bar"`、`data-task-id`、`data-start-offset`、`data-dur-days` 属性；右侧附加 `.gantt-resize-handle` 拖拽句柄；单击改为双击打开编辑（`ondblclick`）
- 新增 `initGanttDrag()` 函数（约120行）：支持整条平移（move）和右边缘调整截止日期（resize）两种模式；松手后自动计算新日期并调用 `saveGanttAdjustment()` 保存到 Supabase
- 新增 `saveGanttAdjustment(taskId, newDue, newStart)`：更新 tasks 表的 due/start 字段
- CSS：`.gantt-resize-handle` 默认透明，hover 时显示；`.gantt-bar` cursor:grab

## 2. 今日看板"已完成"统计修正

**文件**：`js/pm-views.js`

- `renderToday()`：已完成筛选从 `t.done` 改为检查 `completedAt`（优先）或 `updated_at` 是否匹配当天日期
- 看板副标题改为"今天标记完成的任务"

## 3. 项目视图增加 Kanban 看板模式

**文件**：`js/pm-views.js`

- 新增全局变量 `projectViewMode`（localStorage 持久化）
- `renderProjectView(pid)` 完全重写：新增列表/看板切换按钮、进度条区域、4列看板（待启动/进行中/待反馈/已完成）
- 看板列头带颜色圆点 + 任务计数徽章
- 列表视图保留原有排序逻辑

## 4. 任务列表筛选条件持久化保存

**文件**：`js/pm-views.js`、`js/pm-core.js`

- `renderTaskList()`：开头保存筛选条件到 `localStorage`（key：`pm_task_filters`）；新增"清除所有筛选"按钮
- `switchView()`：切回 tasks 视图时从 localStorage 恢复筛选条件

## 5. 燃尽图数据引导与自动快照

**文件**：`js/pm-core.js`、`js/pm-views.js`

- `init()`：`loadState()` 后调用 `recordBurndownSnapshot()` 自动记录快照
- `buildBurndownSVG()`：数据点 < 2 时显示引导提示（📈 图标 + 说明文字）
- `renderCharts()`：燃尽图标题旁追加 `<span id="burndown-pts-hint">` 显示数据点计数
- `updateBurndownChart()`：末尾更新 `burndown-pts-hint` 文本内容

## 6. 资金看板增加近6月收付趋势图

**文件**：`js/finance-base.js`

- `renderDashboard()` 改为 `async`：计算近6月趋势月份，模板中追加 `<div id="trend-chart-placeholder">`，赋值后异步加载
- 新增 `buildTrendSVGData(months)`：从 Supabase 拉取 actual_receipts / actual_payments 按月份汇总
- 新增 `buildTrendSVGStatic(months, recByMonth, payByMonth)`：生成纯 SVG 折线图（560×160，两条 polylines + 圆点 + 网格 + 万元 Y 轴 + 月份 X 轴）
- 收款/付款进度行增加 `data-tip` 属性支持 tooltip

## 7. 合同维度回款进度视图

**文件**：`js/finance-base.js`

- `openRevenueModal(contractId)` 完全重写：新增双 tab 结构（回款进度 / 营收管理）
- 回款进度 tab：合同金额、累计已收（从 actual_receipts 按 upstream_contract_id 汇总）、未收余额、进度条、月度回款明细表
- 新增 `switchRevTab(tab)`：切换回款进度/营收管理 tab 显示
- 新增 `buildRevenueTabContent(r)`：提取原有营收管理 HTML（营收指标卡片 + 月度编辑表格 + 保存按钮）

## 8. T5/T6 总体偏差率醒目展示

**文件**：`js/finance-t5t6.js`

- `renderT5()`：在 toolbar 与 teal 提示之间插入 T5 summary banner（计划回款/实际回款/偏差金额/总偏差率）
- `renderT6()`：在 toolbar 与 teal 提示之间插入 T6 summary banner（计划小计/实际小计/偏差金额/总偏差率，支出负偏差为绿）
- 新增 `buildSummaryBanner({ label, items })`：生成横向汇总条，左侧标签 + 右侧指标卡片

## 9. 弹框键盘友好设计

**文件**：`js/pm-auth.js`、`js/pm-tasks.js`

- `pm-auth.js` 键盘事件监听器重写：Escape 关闭弹框；Cmd/Ctrl+K 新建任务；新增 Cmd/Ctrl+Enter 自动查找并点击弹框内的主保存按钮（`.modal-footer .btn-primary`）
- `openModal()`：`innerHTML` 赋值后通过 `requestAnimationFrame` 自动聚焦第一个可见输入框（排除 checkbox/hidden/display:none）

## 10. 操作反馈增强

**文件**：`js/pm-core.js`、`css/pm.css`

- Toast 位置：`bottom:24px` → `top:20px; right:20px`（右上角）
- Toast 动画：`translateY` → `translateX(120%)` 滑入 + `cubic-bezier(.34,1.56,.64,1)` 弹性曲线
- Toast 类型样式重写：`.toast-success`（绿色背景+边框）、`.toast-error`（红色背景+边框）、`.toast-warning`（琥珀色背景+边框）、`.toast-info`（surface2 背景）
- `toast()` 函数改为队列模式：`_toastQueue` 数组 + `_toastActive` 标志位 + `_processToastQueue()` 串行显示
- Toast 显示时长：2400ms → 3000ms
- 全局 toast 类型补全：所有 `✓` 开头 → `'success'`、`✗` 开头 → `'error'`、删除/保存成功 → `'success'`、失败/错误 → `'error'`、警告 → `'warning'`
- 涉及文件：`pm-core.js`、`pm-tasks.js`、`pm-members.js`、`pm-projects.js`、`pm-auth.js`、`finance-base.js`、`finance-t1.js`、`finance-t4.js`、`finance-t5t6.js`、`finance-export.js`

## 11. 侧边栏项目列表折叠

**文件**：`js/pm-core.js`

- `updateBadges()`：项目列表超过 5 个时，默认只显示前 5 个，底部显示"＋ 展开另外 N 个项目"按钮
- 点击展开后显示全部项目，按钮变为"↑ 收起"
- 展开/折叠状态持久化到 `localStorage`（key：`pm_sidebar_proj_expanded`）

---

## 未改动的文件

- `login.html`
- `css/finance.css`
- `js/pm-logs.js`
- `js/pm-code.js`（如存在）
