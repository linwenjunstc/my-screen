# V14 项目管理系统 — AI 上手指南

## 项目概览

双模块 Web 应用（项目管理 PM + 资金计划 Finance），纯原生 HTML/CSS/JS，后端用 Supabase。

- **主入口**: `projectManage.html`（同时承载 PM 和 Finance）
- **独立入口**: `finance.html`（仅 Finance 模块）
- **Supabase**: `https://rfjrkcclhvuldenpdlye.supabase.co`
- **运行方式**: 所有页面通过本地文件直接打开（非构建工具），依赖 CDN 加载 lucide-icons 和 SheetJS

---

## 文件结构

```
V14/
├── login.html              # 登录页
├── projectManage.html      # ★ 主应用壳（PM + Finance 双模块，含通知铃铛 HTML）
├── finance.html            # Finance 独立页
├── css/
│   ├── app.css             # 登录页样式
│   ├── pm.css              # ★ 主样式（设计令牌、全局组件、Gantt、日志时间线、周视图、通知面板、暗色主题）
│   ├── finance.css         # Finance 独立页样式
│   └── finance-extra.css   # Finance 覆盖样式（侧边栏、表格、进度条、快捷录入按钮）
└── js/
    ├── pm-core.js          # ★ PM 核心：state、loadState、render、CRUD、主题、键盘、实时同步、通知铃铛逻辑
    ├── pm-views.js         # ★ PM 视图：Today、任务列表、项目、甘特图（含拖拽+依赖线）、图表、图表点击弹窗、周视图
    ├── pm-tasks.js         # 任务 CRUD、子任务、前置条件、任务详情弹窗、时间线
    ├── pm-projects.js      # 项目 CRUD、成员管理、颜色选择
    ├── pm-members.js       # 成员管理、标签管理、角色管理、菜单权限配置（含基础库权限）
    ├── pm-logs.js          # 操作日志弹窗（Tab 分类 + 时间线视图渲染 + 登录记录 super_admin TAB）
    ├── pm-auth.js          # 修改密码、快捷键注册
    ├── finance-core.js     # ★ Finance 核心：finState、loadAll、月选择器、Tab 路由
    ├── finance-t1.js       # T1 月度资金计划（固定支出 + 资金筹措）
    ├── finance-t2.js       # T2 对上收款台账（含快捷录入实际收款）
    ├── finance-t3.js       # T3 对下付款计划（含快捷录入实际支付）
    ├── finance-t4.js       # T4 完成情况（计划 vs 实际对比）
    ├── finance-t5t6.js     # T5/T6 偏差分析
    ├── finance-base.js     # 资金看板（含图表点击弹窗）、合同库、客户库、供应商库、Excel 导入导出
    └── finance-export.js   # Excel 导出、系统配置保存、finLogAction
```

### JS 加载顺序（projectManage.html）
`pm-core.js` → `pm-views.js` → `pm-tasks.js` → `pm-projects.js` → `pm-members.js` → `pm-auth.js` → `pm-logs.js` → `finance-core.js` → `finance-t1~t5t6.js` → `finance-base.js` → `finance-export.js`

---

## V14 设计令牌（CSS 自定义属性）

```css
:root {
  --bg: #eef2f7;               /* 页面背景：冷灰蓝调 */
  --surface: #ffffff;
  --surface2: #f7f9fc;
  --surface3: #edf0f6;
  --text: #1a1d27;
  --text2: #596175;
  --text3: #8a94a8;
  --border: #e3e8f0;
  --accent: #2563eb;           /* 主色调：蓝色 #2563eb */
  --accent2: #1d4ed8;
  --sb-bg: #1a1d2e;           /* 侧边栏背景 */
  --sb-text: #c5c9d6;
  --sb-text2: #6f768b;
  --sb-active: rgba(37,99,235,.12);
  --sb-hover: rgba(255,255,255,.04);
  --sb-border: rgba(255,255,255,.06);
  --green: #10b981;  --green-bg: #ecfdf5;  --green-border: #a7f3d0;
  --red: #ef4444;    --red-bg: #fef2f2;    --red-border: #fecaca;
  --amber: #f59e0b;  --amber-bg: #fffbeb;  --amber-border: #fde68a;
  --blue: #3b82f6;   --blue-bg: #eff6ff;   --blue-border: #bfdbfe;
  --teal: #0ea5e9;   --teal-bg: #f0f9ff;   --teal-border: #bae6fd;
  --purple: #8b5cf6; --purple-bg: #faf5ff; --purple-border: #d8cbfe;
  --orange: #e67e22; --orange-bg: #fef3e2; --orange-border: #f5c98e;
}
```

---

## 全局状态

### PM 模块（pm-core.js）
```js
let currentUser = null;       // 当前登录用户 { id, name, role, password, menuPerms, colorIdx }
let currentView = 'today';    // 当前视图: today|tasks|projects|charts|gantt|project-{id}
let currentModule = 'pm';     // 当前模块: pm|finance
const state = {
  tasks: [],      // 任务列表（含驼峰映射：projectId, createdAt, startDate, completedAt, completedBy）
  projects: [],   // 项目列表 { id, name, colorIdx, members[] }
  members: [],    // 成员列表 { id, name, colorIdx, role, password, menuPerms }
  globalTags: []  // 标签列表 { id, name, paletteIdx }
};
```

### Finance 模块（finance-core.js）
```js
let currentTab = 't1';        // Finance 当前 Tab
let currentMonth = '';        // 当前选中月份 YYYY-MM
const finState = {
  payments, receipts, extras, actualReceipts, actualPayments,
  summary, prevSummary, prevPayments, prevReceipts,
  prevActualReceipts, prevActualPayments,
  config: { company_name, dept_name },
  customers, suppliers, contractsUp, contractsDown,
  monthlyRevenues
};
```

### V14 新增全局变量
```js
window._todayViewMode = window._todayViewMode || 'today';  // pm-views.js 顶部：今日/本周视图切换
window._logTab = window._logTab || 'all';                   // pm-logs.js：日志 Tab 记忆
```

---

## V14 新增功能详解

### 1. 通知铃铛系统（TASK-BELL）

**位置**：顶部栏右上角，theme-toggle-btn 和 user-dropdown 之间

**HTML**：projectManage.html 中的 `<div class="notif-wrap" id="notif-wrap">`，内含 bell 按钮（自定义 SVG 铃铛图标）、红色未读角标 `.notif-badge`、下拉通知面板 `.notif-panel`

**localStorage key**：`pm_notif_read_v2`

**关键函数（全部在 pm-core.js 尾部）**：
| 函数 | 说明 |
|------|------|
| `buildNotifItems()` | 收集所有通知：PM 任务到期（today + 逾期） + Finance 收款/付款到期 |
| `refreshNotifs()` | 渲染未读角标、铃铛动画状态（`has-unread` class）、面板内容列表 |
| `notifNavigate(item)` | 点击通知项：标记已读 → 根据 type 导航到对应任务/收款/付款 |
| `toggleNotifPanel()` | 切换面板显隐（阻止冒泡） |
| `closeNotifPanel()` | 关闭面板（点击外部自动关闭） |
| `markAllNotifsRead()` | 一键全部已读 |
| `_getReadIds()` / `_saveReadIds()` | 读写 localStorage 中的已读 ID 数组 |

**通知卡片样式**：4 种颜色类型（overdue/red, urgent/orange, upcoming/blue, info/slate），每种有独立的左边框色和 icon 背景色

**CSS 动画**：`@keyframes bell-ring` — 铃铛有未读通知时，每 4s 播放一次摇摆动画（transform-origin: 50% 25%）

**数据来源**：
- PM 任务：`state.tasks` 中未完成的任务，按 due 日期分类为逾期（< 今天）、3天内到期、本周内到期
- Finance 收款：`finState.receipts` 中 `next_expected_date` 在 3 天内的记录
- Finance 付款：`finState.payments` 中按 `next_expected_date` 过滤

**导航行为**：点击通知 → 自动切换到对应模块（pm/finance）→ 定位到具体任务或 Finance Tab

---

### 2. T2/T3 快捷录入（TASK-01）

**T2 对上收款台账**（finance-t2.js）：
- 表格新增「快捷录入」列，每行有 `+ 录入收款` 按钮
- `window.openQuickReceiptEntry(receiptRecordId)` — 打开预填弹窗（自动带入合同名称、客户、收款日期默认今天）
- `window.saveQuickReceiptEntry(receiptRecordId, btn)` — 写入 `actual_receipts` 表 → 写日志 → 跳转到 T5
- 表格 colspan：空状态 12，tfoot 末行 colspan 4

**T3 对下付款计划**（finance-t3.js）：
- 表格新增「快捷录入」列，每行有 `+ 录入支付` 按钮
- `window.openQuickPaymentEntry(paymentPlanId)` — 打开预填弹窗（付款方式 radio: 现金/供应链，日期默认今天）
- `window.saveQuickPaymentEntry(paymentPlanId, btn)` — 写入 `actual_payments` 表（remark 前缀标注 [现金] 或 [供应链]）→ 写日志 → 跳转到 T6
- 表格 colspan：空状态 14，tfoot 末行 colspan 3

**CSS**（finance-extra.css）：`.quick-entry-btn` — teal 浅底样式，hover 变为实心 teal 白字

---

### 3. 甘特图依赖线（TASK-02）

**位置**：pm-views.js — `renderGantt()` 末尾通过 `requestAnimationFrame(drawGanttDepLines)` 调用

**核心函数**：`window.drawGanttDepLines()`
- 在 `#gantt-right-col` 容器上叠加 SVG `<svg class="gantt-dep-overlay">`
- 通过 `barMap`（task ID → 甘特条位置）计算起止点坐标
- 绘制两种连线：
  - **L 形向前连线**：前置任务在依赖任务之前，画水平→垂直→水平的路径
  - **绕行向后连线**：前置任务在依赖任务之后，从左边绕一圈到右边
- 使用 `stroke-dasharray="5 3"` 的琥珀色（var(--amber)）虚线，箭头标记
- 被阻塞的任务添加 CSS class `.is-dep-blocked`（边框色变琥珀）

**依赖数据来源**：`task.dependencies` 数组（tasks 表 JSONB 字段）

---

### 4. 日志时间线视图（TASK-03）

**位置**：pm-logs.js — `refreshLogsList()` 函数的渲染部分完全重写

**新渲染结构**：
```
.log-timeline
  .log-tl-day          ← 日期分组标签（今天/昨天/YYYY-MM-DD）
  .log-tl-item         ← 每条日志
    .log-tl-dot        ← 带 emoji 图标的彩色圆点节点
    .log-tl-body       ← 内容区
      .log-tl-header   ← 用户名 + 彩色操作标签 + 时间
      .log-tl-detail   ← 详情文本（甘特图调整解析 JSON 显示格式化内容）
```

**节点颜色分类**（`getTlDotClass(action)`）：
| CSS class | 颜色 | 匹配操作 |
|-----------|------|----------|
| `dot-add` | 绿色 | 添加任务/子任务/项目/成员/标签、新增收款/付款/合同/客户/供应商 |
| `dot-done` | 蓝色 | 完成任务/子任务 |
| `dot-del` | 红色 | 所有删除操作 |
| `dot-edit` | 紫色 | 所有编辑/修改/更新操作 |
| `dot-gantt` | 橙色 | 甘特图调整 |
| `dot-fin` | teal | Finance 更新操作、导出报表 |
| `dot-sys` | 灰色 | 成员管理、角色修改、密码操作、登录 |

**CSS 竖线**：`.log-tl-item::before` 伪元素画垂直连接线，最后一项用 `.log-tl-last` 截断

**其他逻辑不变**：Tab 分类过滤、成员过滤、天数过滤、RLS 错误提示完全保留

---

### 5. 周视图（TASK-04）

**位置**：pm-views.js

**全局开关**：`window._todayViewMode` — 初始值 `'today'`，切换为 `'week'`

**触发**：Today 视图顶部新增 `.view-mode-tabs`，含「今日」和「本周」两个按钮（`.vmtab`），点击切换模式

**核心函数**：`window.renderWeekGrid()`
- 计算当前周：周一至周日（`getMonday()` 辅助函数）
- 7 列 CSS Grid 布局（`.week-grid`，`grid-template-columns: repeat(7,1fr)`）
- 每列结构：
  - `.week-day-head` — 日期头（星期名 + 日期号），今天高亮 `.is-today`（蓝色边框+蓝色文字）
  - `.week-day-col` — 当日任务列表（最多显示 6 个，超出显示 `+N 更多`）
- 任务条目 `.week-task-item` — 含状态标签、优先级圆点、任务标题、项目名、负责人头像+姓名
- 底部汇总栏 `.week-summary-bar` — 卡片样式显示全周任务统计（到期/已完成/待处理）

**交互**：点击任务条目 → 打开任务详情弹窗

**CSS**（pm.css）：`.view-mode-tabs`、`.vmtab`、`.week-grid`、`.week-day-col`、`.week-day-head`、`.week-day-name`、`.week-day-num`、`.week-task-item`、`.week-more-label`、`.week-empty-label`、`.week-summary-bar`、响应式折叠

---

### 6. UI 全面重构（TASK-05）

**设计令牌变更**：
- 背景色：`#f5f7fb` → `#eef2f7`（更冷灰蓝）
- 主色调：teal `#0ea57c` → 蓝色 `#2563eb`
- 所有强调色从 teal 系列改为 blue 系列

**Logo 圆点**：`background: var(--accent)` + `box-shadow: 0 0 8px var(--accent)`（蓝色发光）

**侧边栏**：`.nav-item.active` 左边框色改为 `var(--accent)`，finance 侧边栏同步

**顶栏 Tab**：`.top-tab.active` 文字色 + 下划线色均为 `var(--accent)`

**卡片阴影**：`.task-card`、`.project-card` 阴影从 `shadow-xs` 升级为 `shadow`，hover 效果更明显

**统计卡片**：新增 4 个语义颜色 class
| Class | 用途 | 左边框/after/数值色 |
|-------|------|---------------------|
| `sc-red` | 紧急/逾期任务 | 红色 |
| `sc-amber` | 3 天内到期 | 琥珀色 |
| `sc-blue` | 本周内到期 | 蓝色 |
| `sc-green` | 今日已完成 | 绿色 |

应用位置：`renderToday()` 中的 4 个 stat-card 分别添加对应 class

**Finance 表格交替行背景**（finance-extra.css）：
```css
#main-content .table-scroll table tbody tr:nth-child(odd)  td { background: var(--surface); }
#main-content .table-scroll table tbody tr:nth-child(even) td { background: var(--surface2); }
#main-content .table-scroll table tbody tr:hover td           { background: var(--blue-bg); }
```

---

### 7. 周视图增强（V14 迭代）

**周视图任务卡片**现在显示更丰富的信息：
- **状态标签**（`.wti-status`）：左上角彩色状态 pill（待启动/进行中/待反馈/已完成）
- **优先级圆点**（`.wti-pri`）：右上角颜色圆点（红=紧急/琥珀=重要/灰=普通）
- **任务标题**（`.wti-title`）：加粗显示，全文 tooltip
- **底部元信息**（`.wti-meta`）：
  - 所属项目名（蓝色 pill，`.wti-proj`）
  - 负责人头像 + 姓名（小圆形头像 `.wti-avatar` + 姓名 `.wti-member`）

**汇总栏**升级为卡片样式（白底圆角边框阴影），数值使用等宽字体加粗。

**CSS 新增**（pm.css）：`.wti-top`、`.wti-status`（5 色）、`.wti-pri`、`.wti-title`、`.wti-meta`、`.wti-proj`、`.wti-member`、`.wti-avatar`

---

### 8. 基础库菜单权限（V14 迭代）

**新增菜单权限项**（MENU_DEFS）：
| key | label | 说明 |
|-----|-------|------|
| `base_contracts` | 合同库 | 对上/对下合同管理 |
| `base_customers` | 客户库 | 客户信息管理 |
| `base_suppliers` | 供应商库 | 供应商信息管理 |

**权限逻辑**（`applyMenuPerms()`）：
- 拥有 **任一** 基础库权限（base_contracts / base_customers / base_suppliers）→ 显示 Finance 侧边栏底部的「基础库配置」按钮（`#base-lib-btn`）
- 三个权限均无 → 按钮隐藏（`.menu-hidden`）

**`openBaseLibModal()` 动态过滤**（finance-base.js）：
- 调用 `getEffectiveMenuPerms()` 获取当前用户的完整权限列表
- 仅展示用户有权限的库入口（如果只有一个库的权限，弹窗只显示那一个库的按钮）
- 无任何权限时 toast 提示并阻止弹窗

**菜单权限配置**（pm-members.js）：管理员在「配置菜单权限」弹窗中可单独勾选/取消三个基础库权限，三个库独立控制。

---

### 9. 登录记录（V14 迭代）

**登录日志写入**：`login.html` 的 `doLogin()` 在验证成功后，向 `logs` 表插入一条 `action: '用户登录'` 的记录（失败静默，不影响登录流程）。

**日志面板新增「🔑 登录」Tab**（pm-logs.js `openLogsModal()`）：
- **仅 `super_admin` 可见**，其他角色看不到此 Tab
- Tab 数据源：`LOG_CATS.login = ['用户登录']`
- 支持按成员筛选查看特定用户的登录历史
- 「全部」Tab 中也会包含登录记录（`all: null` 不过滤）

**数据保护**：登录日志写入使用独立的 Supabase insert，不依赖 `currentUser` 变量（此时尚未加载 PM 模块），确保登录记录可靠写入。

---

## 关键共享函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `sb` | pm-core.js | Supabase 客户端（全局） |
| `currentUser` | pm-core.js | 当前用户（全局） |
| `uid()` | pm-core.js | 生成唯一 ID |
| `escHtml(s)` | pm-core.js | HTML 转义，防 XSS |
| `isAdmin()` | pm-core.js | 判断 admin/super_admin |
| `toast(msg, type)` | pm-core.js | Toast 通知（success/error/warning/info） |
| `openModal(html)` / `closeModal()` | pm-tasks.js | 弹窗管理 |
| `modalHeader(title)` | pm-tasks.js | 标准弹窗头部 HTML |
| `showConfirm(title, msg, cb)` | pm-core.js | 确认对话框 |
| `MEMBER_COLORS` | pm-core.js | 成员头像颜色数组 |
| `PROJ_COLORS` | pm-core.js | 项目颜色数组 |
| `render()` | pm-core.js | PM 视图路由（根据 currentView 分发） |
| `loadState()` | pm-core.js | 从 Supabase 拉取全部 PM 数据 |
| `initRealtime()` | pm-core.js | 实时订阅 public schema 变更 → loadState |
| `loadAll()` | finance-core.js | 从 Supabase 拉取全部 Finance 数据 |
| `finRender()` | finance-core.js | Finance 视图路由（根据 currentTab 分发） |
| `logAction(action, detail)` | pm-logs.js | 写入操作日志到 logs 表 |
| `finLogAction(action, detail)` | finance-export.js | Finance 操作日志写入（内部调用 logAction，自动读取 currentUser） |
| `fmt(n)` | finance-core.js | 数字千分位格式化 |
| `q(id)` | pm-tasks.js | `document.getElementById(id).value` 快捷获取 |
| `setLoading(btn, state)` | pm-core.js | 按钮 loading 状态切换 |
| `ratioCell(actual, plan)` | finance-base.js | 生成比率单元格 HTML（含进度条和颜色） |
| `getLinkedPrevReceived(pay)` | finance-t3.js | 取对下付款关联的对上合同累计已收款 |

### V14 新增共享函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `refreshNotifs()` | pm-core.js | 刷新通知铃铛（每次 render 后自动调用） |
| `buildNotifItems()` | pm-core.js | 收集所有通知项 |
| `notifNavigate(item)` | pm-core.js | 通知点击导航 |
| `toggleNotifPanel()` | pm-core.js | 切换通知面板显隐 |
| `drawGanttDepLines()` | pm-views.js | 绘制甘特图依赖箭头线 |
| `renderWeekGrid()` | pm-views.js | 渲染本周 7 列任务视图 |
| `getTlDotClass(action)` | pm-logs.js | 日志时间线节点颜色分类 |
| `openQuickReceiptEntry(id)` | finance-t2.js | 快捷录入实际收款弹窗 |
| `saveQuickReceiptEntry(id, btn)` | finance-t2.js | 保存快捷实际收款 |
| `openQuickPaymentEntry(id)` | finance-t3.js | 快捷录入实际支付弹窗 |
| `saveQuickPaymentEntry(id, btn)` | finance-t3.js | 保存快捷实际支付 |

---

### 图表点击弹窗函数

所有图表元素（柱状图行、饼图扇区、SVG 数据点、进度条等）点击后会弹出数据明细弹窗。

**PM 数据统计（pm-views.js）**

| 函数 | 触发位置 | 弹窗内容 |
|------|----------|----------|
| `showStatusTaskList(status)` | 环形图扇区/图例 | 该状态下的任务列表 |
| `showPriorityTaskList(priority)` | 优先级柱状图行 | 该优先级的待办任务列表 |
| `showProjectTaskList(projectId)` | 项目进度条/今日看板进度 | 该项目的全部任务列表 |
| `showMemberTaskList(memberId)` | 成员负载柱状图行 | 该成员的全部任务列表 |
| `showDayTaskList(date, type)` | 月度趋势图数据点 | 当天新建/完成的任务列表 |
| `showBurndownDayTasks(projId, date)` | 燃尽图数据点 | 当天剩余待办任务列表 |

**Finance 资金看板（finance-base.js）**

| 函数 | 触发位置 | 弹窗内容 |
|------|----------|----------|
| `showFinSummaryModal()` | 资金溢缺卡片 | T1 资金计划明细（计划 vs 实际） |
| `showPlanIncomeModal()` | 计划收入卡片 | 对上收款计划明细表 |
| `showPlanExpenseModal()` | 计划支出卡片 | 对下付款计划明细表 |
| `showCashFlowModal()` | 实时现金流卡片 | 现金流计算明细 |
| `showFlowRatioModal()` | 收付比例卡片 | 实际收付款记录明细 |
| `showMoMComparisonModal()` | 月度环比卡片 | 当月 vs 上月环比对比 |
| `showCompletionRateModal()` | 收款完成率卡片 | 收付款完成率明细 |
| `showReceiptDetailModal(recordId)` | 收款进度行 | 合同收款详情 + 实际收款记录 |
| `showPaymentDetailModal(planId)` | 付款进度行 | 合同付款详情 + 实际支付记录 |
| `showTrendDayDetail(clickType)` | 近6月趋势图数据点 | 月度收付汇总数据 |

所有弹窗统一通过 `openModal(modalHeader(title) + ...)` 构建，包含数据表格（最大高度 60-65vh 可滚动）和关闭按钮。

---

## 认证流程

1. `login.html` — 用户输入 name + password，查询 `members` 表验证（明文对比）
2. 成功后存储 `localStorage.pm_session = { id, name, role, password, ..., loginAt }`
3. 跳转到 `projectManage.html`
4. `init()` 读取 session → 校验 8 小时有效期 → `silentRoleSync()` → `loadState()` → `initRealtime()`
5. 角色：`super_admin`(3) > `admin`(2) > `user`(1)
6. `menu_perms` JSON 字段控制菜单可见性（`applyMenuPerms()`），支持精细控制基础库（合同库/客户库/供应商库）访问权限
7. **注意：密码是明文存储的，无哈希**

---

## 甘特图拖拽机制（重要）

甘特图支持两种拖拽调整：
- **拖拽右边缘（resize）**：调整截止日期，startDate 不变
- **拖拽整个条（move）**：平移起止日期，startDate 和 due 同时变化

**核心变量**：
- `ganttDayW`：每天像素宽度（默认 42，可通过缩放按钮调整）
- `window._ganttMinDate`：甘特图最小日期（渲染时设置，拖拽时读取）
- `data-start-offset` / `data-dur-days`：bar 元素的起止偏移属性

**拖拽流程**：
1. `initGanttDrag()` 在每次 `renderGantt()` 后调用，绑定 document 级别事件
2. mousedown → 检测点击 bar 或 resize-handle → 设置 `_ganttDragging` 状态 → 显示 tooltip
3. mousemove → 计算 days delta → 更新 bar 位置 → 更新 tooltip（显示目标日期）
4. mouseup → 计算新日期 → 更新内存中的 task.due/startDate → 设置 `window._ganttSaving = true`
5. `saveGanttAdjustment()` → 更新 tasks 表 + 写入 logs 表
6. `.then()` → `renderGantt()` 显式刷新（唯一一次渲染）
7. 1.5s 后 `_ganttSaving = false` → 恢复实时同步

**防重复渲染**：`window._ganttSaving` 标志在保存期间阻止 `loadState()` 调用 `render()`，避免 Supabase 实时事件触发多余渲染。`loadState()` 中有 `_loadingState` 并发守卫 + `_lastLoadTime` 800ms 冷却。

**权限检查**：`canAdjustGantt(task)` — admin、项目成员、任务负责人可拖拽。

**V14 新增依赖线**：甘特图渲染后通过 `drawGanttDepLines()` 在 SVG 叠加层上绘制琥珀色虚线箭头，展示任务间的 `dependencies` 关系。

---

## 常用编码模式

### 日期处理
- 数据库存储 `YYYY-MM-DD` 字符串（date 类型）
- JS 中用 `new Date(str + 'T00:00:00')` 避免 UTC 解析偏移
- 渲染前始终调 `setHours(0,0,0,0)` 归一化到本地零点
- **禁止在 China 时区使用 `toISOString().slice(0,10)`** 格式化日期——会因 UTC 转换少一天
- 正确做法：`d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')`

### 数据库字段映射
Supabase 使用 snake_case，JS 中 tasks 表有驼峰映射（pm-core.js 的 `loadState()` 中）：
- `project_id` → `projectId`
- `created_at` → `createdAt`
- `start_date` → `startDate`
- `completed_at` → `completedAt`
- `completed_by` → `completedBy`
- `color_idx` → `colorIdx`
- `menu_perms` → `menuPerms`

### 弹窗模式
```js
openModal(modalHeader('标题') + `<div class="modal-body">...</div>` + `<div class="modal-footer">...</div>`);
// 关闭：closeModal()
// 可选尺寸：在调用时传第二个参数如 'modal-lg'（max-width: 700px）或 'modal-xl'（max-width: 860px）
```

### Supabase 查询模式
```js
const { data, error } = await sb.from('table').select('*').eq('field', value).order('created_at');
```

### 全局函数暴露模式
需从 HTML onclick 调用的函数必须挂在 `window` 上：
```js
window.myFunction = function(arg) { ... };
```

### DOM 稳定后执行
甘特图依赖线等需要在渲染完成后操作 DOM 的场景，使用双重 rAF：
```js
requestAnimationFrame(function() { requestAnimationFrame(drawGanttDepLines); });
```

---

## SQL 表结构

详见同目录下的 `SCHEMA.md`。

---

## 已知注意事项

1. **Edit 工具对中文文件不兼容**：修改含中文的 JS 文件时，优先用 PowerShell 做替换
2. **Finance 模块依赖 PM 模块**：`sb`、`currentUser`、`uid()`、`isAdmin()`、`toast()` 等都来自 pm-core.js
3. **实时同步是全局的**：`initRealtime()` 监听整个 public schema，任何表变更都会触发 `loadState()`
4. **密码明文**：`members.password` 存的是明文，修改密码流程也是明文对比
5. **Finance 有独立的 `finance.html`**：但同样依赖 localStorage 中 PM 的 session
6. **lucide-icons** 在每次 `finRender()` 后需调用 `lucide.createIcons()` 刷新图标
7. **通知铃铛**：数据来自 PM tasks（内存 `state.tasks`）和 Finance（内存 `finState`），不额外查库；已读状态仅存 localStorage，不跨设备同步
8. **甘特图依赖线**：依赖 `barMap` 在 `renderGantt()` 中构建，必须在 `renderGantt()` 尾部调用 `drawGanttDepLines()`
9. **周视图**：仅按当前周（周一～周日）显示，不支持翻周；通过 `window._todayViewMode` 切换，不走 `currentView` 路由
10. **快捷录入**：写入 `actual_receipts`/`actual_payments` 后自动跳转到 T5/T6 偏差分析 Tab
