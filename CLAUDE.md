# V16 项目管理系统 — AI 上手指南

## 项目概览

双模块 Web 应用（项目管理 PM + 资金计划 Finance），纯原生 HTML/CSS/JS，后端用 Supabase。

- **主入口**: `projectManage.html`（同时承载 PM 和 Finance）
- **独立入口**: `finance.html`（仅 Finance 模块）
- **Supabase**: `https://rfjrkcclhvuldenpdlye.supabase.co`
- **运行方式**: 所有页面通过本地文件直接打开（非构建工具），依赖 CDN 加载 lucide-icons 和 SheetJS

---

## 文件结构

```
V15/
├── login.html              # 登录页
├── projectManage.html      # ★ 主应用壳（PM + Finance 双模块，含通知铃铛 HTML、AI 面板 HTML）
├── finance.html            # Finance 独立页
├── css/
│   ├── app.css             # 登录页样式
│   ├── pm.css              # ★ 主样式（设计令牌、全局组件、Gantt、日志时间线、周视图、通知面板、暗色主题）
│   ├── ai-panel.css        # AI 助手面板样式（按钮脉冲光晕、消息气泡、欢迎卡片、确认组件）
│   ├── finance.css         # Finance 独立页样式
│   └── finance-extra.css   # Finance 覆盖样式（侧边栏、表格、进度条、快捷录入按钮）
└── js/
    ├── pm-core.js          # ★ PM 核心：state、loadState、render、CRUD、主题、键盘、实时同步、通知铃铛、MENU_DEFS、权限系统、数据权限过滤
    ├── pm-views.js         # ★ PM 视图：Today、任务列表、项目、甘特图（含拖拽+依赖线）、图表、图表点击弹窗、周视图
    ├── pm-tasks.js         # 任务 CRUD、子任务、前置条件、任务详情弹窗、时间线
    ├── pm-projects.js      # 项目 CRUD、成员管理、颜色选择
    ├── pm-members.js       # 成员管理、标签管理、角色管理、菜单权限配置（含 AI 助手分组）
    ├── pm-logs.js          # 操作日志弹窗（Tab 分类 + 时间线视图渲染 + 登录记录 super_admin TAB）
    ├── pm-auth.js          # 修改密码、快捷键注册
    ├── pm-ai.js            # ★ AI 任务助手（DeepSeek API、权限感知 Context、关键词拦截、写操作确认）
    ├── finance-core.js     # ★ Finance 核心：finState、loadAll、月选择器、Tab 路由（含 TAB_PERM_MAP 权限守卫）、数据权限过滤
    ├── finance-t1.js       # T1 月度资金计划（固定支出 + 资金筹措）
    ├── finance-t2.js       # T2 对上收款台账（含快捷录入实际收款）
    ├── finance-t3.js       # T3 对下付款计划（含快捷录入实际支付）
    ├── finance-t4.js       # T4 完成情况（计划 vs 实际对比）
    ├── finance-t5t6.js     # T5/T6 偏差分析
    ├── finance-base.js     # 资金看板（含图表点击弹窗）、合同库、客户库、供应商库、基础库配置、基础信息配置、Excel 导入导出
    └── finance-export.js   # Excel 导出、系统配置保存、finLogAction
```

### JS 加载顺序（projectManage.html）
`pm-core.js` → `pm-views.js` → `pm-tasks.js` → `pm-projects.js` → `pm-members.js` → `pm-auth.js` → `pm-logs.js` → `pm-ai.js` → `finance-core.js` → `finance-t1~t5t6.js` → `finance-base.js` → `finance-export.js`

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
| `basic_info` | 基础信息配置 | 公司名称、事业部名称 |
| `base_contracts` | 合同库 | 对上/对下合同管理 |
| `base_customers` | 客户库 | 客户信息管理 |
| `base_suppliers` | 供应商库 | 供应商信息管理 |

**权限逻辑**（`applyMenuPerms()`）：
- 菜单权限按 **分组** 归类：项目管理（pm）、资金计划（finance）、基础库配置（base）、AI 助手（ai）、系统管理（admin）
- 拥有 **任一** 基础库权限（base_contracts / base_customers / base_suppliers）→ 显示 Finance 侧边栏底部的「基础库配置」按钮
- AI 按钮现在有独立的 `data-menu-key="ai_assistant"`，和其他菜单一样走统一权限体系，不再隐式推导
- 五大分组均无权限时 → 对应顶部模块 TAB 自动隐藏，无法切换
- 没有任何必选项，所有菜单均可自由勾选/取消

**`openBaseLibModal()` 动态过滤**（finance-base.js）：
- 调用 `getEffectiveMenuPerms()` 获取当前用户的完整权限列表
- 仅展示用户有权限的库入口（如果只有一个库的权限，弹窗只显示那一个库的按钮）
- 无任何权限时 toast 提示并阻止弹窗

**菜单权限配置**（pm-members.js）：
- 弹窗中按分组（项目管理 / 资金计划 / 基础库配置 / 系统管理）展示菜单项
- 管理员可单独勾选/取消所有菜单权限，包括基础库三个权限独立控制
- 「恢复默认」按角色恢复，「全部取消」允许清空所有权限

---

### 9. 登录记录（V14 迭代）

**登录日志写入**：`login.html` 的 `doLogin()` 在验证成功后，向 `logs` 表插入一条 `action: '用户登录'` 的记录（失败静默，不影响登录流程）。

**日志面板新增「🔑 登录」Tab**（pm-logs.js `openLogsModal()`）：
- **仅 `super_admin` 可见**，其他角色看不到此 Tab
- Tab 数据源：`LOG_CATS.login = ['用户登录']`
- 支持按成员筛选查看特定用户的登录历史
- 「全部」Tab 中也会包含登录记录（`all: null` 不过滤）

**权限守卫**：`refreshLogsList()` 中非 super_admin 无法访问「🔑 登录」Tab（自动跳回「全部」），且「全部」Tab 中自动过滤「用户登录」记录。管理员成员下拉和查询结果均排除 super_admin 成员。

---

### 10. 权限系统全面重构（V14 迭代）

**菜单分组**（`MENU_DEFS` 新增 `group` 字段）：

| group | 说明 | 包含菜单 |
|-------|------|----------|
| `pm` | 项目管理 | today, tasks, charts, gantt, projects, add_task, logs |
| `finance` | 资金计划 | fin_t1, fin_receipt, fin_payment, fin_t4, fin_t5, fin_t6, fin_dashboard |
| `base` | 基础库配置 | basic_info, base_contracts, base_customers, base_suppliers |
| `ai` | AI 助手 | ai_assistant |
| `admin` | 系统管理 | members, tags, roles, system_config（adminOnly） |

**`getDefaultMenuPerms(role)`**（pm-core.js:503-507）：
- **仅 `super_admin` 默认拥有全部权限**（返回 MENU_DEFS 所有 key）
- `admin` 和 `user` 均返回 `[]`，必须由管理员在「成员管理 → 菜单权限」中手动配置
- `null` ≠ `[]`：`null` 表示"从未配置"，走 `getDefaultMenuPerms()`；`[]` 表示"管理员显式清空"，尊重空数组

**模块 TAB 可见性**（`applyMenuPerms()` + `hasGroupPerm()`）：
- PM Tab：用户拥有 **任一** pm 分组菜单 → 显示
- Finance Tab：用户拥有 **任一** finance 或 base 分组菜单 → 显示
- 基础库按钮：用户拥有 **任一** base 分组菜单 → 显示
- 资金计划侧边栏各 Tab 均受对应 `fin_*` 菜单权限控制，`switchTab()` 内置权限守卫
- 当前模块被隐藏时自动切换到可用模块
- 旧版 `finance` 菜单 key 自动展开为全部资金子菜单（向后兼容）

**数据权限三级过滤**（`loadState()` / `refreshLogsList()` / `loadAll()`）：

| 角色 | 可见数据范围 |
|------|-------------|
| `super_admin` | 所有人的所有信息 |
| `admin` | 除 super_admin 外的所有人的所有信息（成员列表、任务、项目、日志、资金数据均排除 super_admin） |
| `user` | 仅自己的信息（自己负责的任务、参与的项目、自己的操作日志、自己创建的资金记录） |

**菜单配置弹窗改进**（`openMenuPermsModal()`）：
- 按五大分组展示（PM / 资金计划 / 基础库配置 / AI 助手 / 系统管理），每组有标题和说明
- GROUPS 数组在 pm-members.js:371-376，新增分组时需同步更新
- 移除所有「必选」标记，所有菜单可自由取消
- 「全部取消」按钮可清空所有权限

**日志面板权限控制**（`refreshLogsList()`）：
- 「🔑 登录」Tab 仅 `super_admin` 可见
- 「全部」Tab 对非 super_admin 过滤「用户登录」记录
- 管理员成员筛选下拉不显示 super_admin 成员
- 前端双重过滤：查询结果排除 super_admin 日志 + Tab 分类过滤

### 11. 基础信息配置（V14 迭代）

**位置**：`finance-base.js` — `openBasicInfoModal()` / `saveBasicInfo()`

**菜单 key**：`basic_info`（属于 `base` 分组）

**访问路径**：Finance 侧边栏 → 基础库配置 → 基础信息配置

**功能**：设置公司名称和事业部名称，保存到 `finance_config` 表。原「系统配置」弹窗中的公司/事业部字段已移到这里。

---

| 函数 | 位置 | 说明 |
|------|------|------|
| `sb` | pm-core.js | Supabase 客户端（全局） |
| `currentUser` | pm-core.js | 当前用户（全局） |
| `uid()` | pm-core.js | 生成唯一 ID |
| `escHtml(s)` | pm-core.js | HTML 转义，防 XSS |
| `isAdmin()` | pm-core.js | 判断 admin/super_admin |
| `isSuperAdmin()` | pm-core.js | 判断仅 super_admin |
| `getRoleLevel(role)` | pm-core.js | 角色等级数值（3/2/1） |
| `canManageRole(op, target)` | pm-core.js | 判断操作者能否管理目标角色 |
| `getDefaultMenuPerms(role)` | pm-core.js | 按角色返回默认菜单权限（仅 super_admin 返回全 key，其余返回 []） |
| `getEffectiveMenuPerms()` | pm-core.js | 获取当前用户实际生效的菜单权限 |
| `hasGroupPerm(group)` | pm-core.js | 检查用户是否有某分组的任一菜单权限 |
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
| `hasGroupPerm(group)` | pm-core.js | 检查当前用户是否有某分组的菜单权限 |
| `getTlDotClass(action)` | pm-logs.js | 日志时间线节点颜色分类 |
| `openQuickReceiptEntry(id)` | finance-t2.js | 快捷录入实际收款弹窗 |
| `saveQuickReceiptEntry(id, btn)` | finance-t2.js | 保存快捷实际收款 |
| `openQuickPaymentEntry(id)` | finance-t3.js | 快捷录入实际支付弹窗 |
| `saveQuickPaymentEntry(id, btn)` | finance-t3.js | 保存快捷实际支付 |
| `openBasicInfoModal()` | finance-base.js | 基础信息配置弹窗 |
| `saveBasicInfo(btn)` | finance-base.js | 保存基础信息到 finance_config |
| `toggleAiPanel()` | pm-ai.js | 切换 AI 助手面板显隐 |
| `sendAiMsg()` | pm-ai.js | 发送 AI 对话消息（含权限拦截） |
| `aiConfirmWrite(id)` | pm-ai.js | 确认执行 AI 建议的写操作 |
| `aiCancelWrite(id)` | pm-ai.js | 取消 AI 写操作 |
| `askAiQuick(q)` | pm-ai.js | 快捷提问（填入输入框并发送） |
| `_aiHasPerm(menuKey)` | pm-ai.js | AI 精细权限检查（内部） |
| `_aiHasPmAny()` | pm-ai.js | 是否有任一 PM 菜单权限（内部） |
| `_aiHasFinanceAny()` | pm-ai.js | 是否有任一 Finance 菜单权限（内部） |
| `_aiHasBaseAny()` | pm-ai.js | 是否有任一 Base 菜单权限（内部） |
| `initAiBadge()` | pm-ai.js | 首次使用 AI 的引导徽章 |
| `_buildAuditContext()` | pm-ai.js | 构建系统审计上下文（成员权限+登录记录）（内部） |
| `_fetchTodayLogins()` | pm-ai.js | 从 Supabase 拉取今日登录记录（仅 super_admin） |

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

### 12. AI 任务助手 · 完整权限体系（V15）

**位置**：`pm-ai.js`（~930 行），使用 DeepSeek API（`deepseek-v4-pro`）

**架构**：Context Injection — 根据用户权限序列化数据，注入 System Prompt，发送给 DeepSeek

#### 菜单权限

**菜单 key**：`ai_assistant`（属于 `ai` 分组），在 MENU_DEFS 中独立存在。

**准入控制**（三层）：
| 层级 | 位置 | 机制 |
|------|------|------|
| 按钮可见 | `data-menu-key="ai_assistant"` + `applyMenuPerms()` | 统一菜单权限体系（和其他菜单完全一致） |
| 面板打开 | `_openAiPanel()` 第一行 | `_aiHasPerm('ai_assistant')` → 无权限 toast 拒绝 |
| 欢迎卡片 | `_renderWelcomeCard()` | 根据权限过滤可显示的 AI 能力列表 |

#### 数据权限（Context 构建）

AI 上下文的构建**完全基于用户菜单权限**，不发送用户无权访问的数据：

| Context | 触发条件 | 包含数据 |
|---------|---------|---------|
| PM Context | `_aiHasPmAny()` | 任务统计、任务列表（逾期/紧急/到期）、项目、成员负载 |
| Finance Context | `_aiHasFinanceAny()` | 按各 `fin_*` key 逐项过滤：收款计划、付款计划、完成情况等 |
| Base Context | `_aiHasBaseAny()` | 按 key 逐项过滤：合同库（base_contracts）、客户库（base_customers）、供应商库（base_suppliers） |
| Audit Context | `_aiHasPerm('members')` | 成员权限摘要（角色/菜单权限）、今日登录记录（仅 super_admin 拉取） |

#### 关键词拦截（发送前）

`sendAiMsg()` 在发送前检查用户输入是否触及其无权限的数据域：

| 关键词类 | 触发词 | 检查权限 | 拒绝时行为 |
|---------|--------|---------|-----------|
| 财务 | 收款/付款/资金/月度/回款/现金流… | `_aiHasFinanceAny()` | 提示联系管理员 |
| 合同 | 合同/结算/执行中合同… | `_aiHasPerm('base_contracts')` | 精确提示缺少合同库权限 |
| 客户 | 客户/甲方… | `_aiHasPerm('base_customers')` | 精确提示缺少客户库权限 |
| 供应商 | 供应商/乙方/分包… | `_aiHasPerm('base_suppliers')` | 精确提示缺少供应商库权限 |
| 登录记录 | 登录/谁登录过/登录历史… | `_aiHasPerm('logs')` + super_admin | 提示仅超级管理员可查 |
| 成员权限 | 权限/菜单权限/有哪些权限… | `_aiHasPerm('members')` | 提示缺少成员管理权限 |
| 成员列表 | 成员列表/有哪些用户/谁在系统… | `_aiHasPerm('members')` | 提示缺少成员管理权限 |
| 系统配置 | 系统配置/公司名称/事业部… | `_aiHasPerm('basic_info')` 或 `system_config` | 提示缺少系统配置权限 |
| 权限变更 | 开通/授权/撤销权限/移除权限… | `_aiCanManagePerms()` | 提示仅管理员可通过 AI 执行 |

#### 写操作（任务状态/优先级更新 + 成员权限变更）

- 触发：AI 回复中包含 `[ACTION:update_task]` 标记
- `_parseWriteAction()` 解析 → `_renderConfirmArea()` 渲染确认按钮
- 用户点击确认 → `aiConfirmWrite()` → 调用 `render()` 刷新视图
- 仅拥有 `tasks` 权限的用户可触发写操作（`perms.canWriteTask`）

#### 快捷提问芯片（Quick Chips）

`_renderQuickChips()` 从 11 个预定义芯片中按 `_aiHasPerm()` 过滤，仅展示用户有对应数据权限的芯片。

#### 权限标签

面板头部 `#ai-perm-badge` 显示当前用户可访问的数据域：`PM · 资金 · 基础库` 或部分组合。

#### 关键函数

| 函数 | 说明 |
|------|------|
| `_aiHasPerm(menuKey)` | 检查当前用户是否有指定菜单权限（super_admin 直接返回 true） |
| `_aiHasPmAny()` | 是否有任一 PM 菜单权限 |
| `_aiHasFinanceAny()` | 是否有任一 Finance 菜单权限 |
| `_aiHasBaseAny()` | 是否有任一 Base 菜单权限 |
| `_buildFullContext()` | 构建完整 AI 上下文（meta + pm + finance + base + perms） |
| `_buildSystemPrompt(ctx)` | 根据上下文构建 System Prompt（含报告模板） |
| `_renderWelcomeCard()` | 渲染欢迎卡片（含权限感知的能力列表） |
| `_renderQuickChips()` | 渲染快捷提问芯片（权限过滤） |
| `_renderPermBadge()` | 渲染权限标签 |
| `sendAiMsg()` | 发送消息主流程（含关键词拦截 → Context 构建 → API 调用） |
| `aiConfirmWrite(id)` | 确认执行 AI 建议的写操作（含成员权限变更） |
| `toggleAiPanel()` / `_openAiPanel()` / `_closeAiPanel()` | 面板开关 |
| `_aiCanManagePerms()` | 判断当前用户是否有资格通过 AI 执行权限变更（V16-PERM） |
| `_aiCanManageMember(target)` | 判断当前用户能否操作目标成员（角色层级限制）（V16-PERM） |
| `_aiCanGrantMenuKey(key)` | 判断某 menuKey 是否允许被当前用户授予（V16-PERM） |
| `_renderConfirmArea(action)` | 渲染确认框（权限操作用 amber 色系）（V16-PERM） |

---

### 14. AI 成员权限操作（V16-PERM）

**位置**：`pm-ai.js`（+~150 行），`css/ai-panel.css`（+~30 行）

**功能**：让 AI 代替管理员执行成员菜单权限变更（授予/撤销），整个流程经过用户二次确认，执行结果实时写入 Supabase。

#### 权限层级规则

| 操作者角色 | 能否通过 AI 修改权限 | 能修改谁 |
|-----------|---------------------|---------|
| `super_admin` | 可以 | 所有人（admin、user） |
| `admin` | 可以 | 仅 user 角色成员 |
| `user` | 不能 | 无 |

#### 安全校验链（5 层）

| 校验点 | 位置 | 说明 |
|--------|------|------|
| 调用方角色 | `_aiCanManagePerms()` | user 直接拒绝 |
| 目标成员层级 | `_aiCanManageMember()` | admin 不能改 admin/super_admin |
| 关键词前置拦截 | `sendAiMsg()` | 无权限直接拒绝，不调 API |
| 高危 key 过滤 | `aiConfirmWrite()` | 非 super_admin 无法授予 members/roles/system_config/basic_info |
| 执行时二次校验 | `aiConfirmWrite()` | 防止前端绕过直接调用 |
| 操作日志 | `logAction()` | 写入 `logs` 表（action: AI修改成员权限） |

#### AI 不能执行的操作（永久禁止）

- 修改成员的 `role`（角色提升/降级）
- 修改 `super_admin` 的任何属性
- 将 `members` 等高危权限授予非 admin/super_admin
- 创建或删除成员账号

#### 新增快捷芯片

- 「权限总览」、「开通 AI 助手」、「撤销权限」— 仅 admin+ 可见

#### 确认框样式

权限操作确认框使用 amber 色系（黄/橙色），与任务操作的蓝色区分，提示敏感操作。

---

### 13. 权限系统 V15 最终版

#### `getDefaultMenuPerms` —— 仅 super_admin 拥有默认全权限

```js
function getDefaultMenuPerms(role) {
  if (role === 'super_admin') return MENU_DEFS.map(m => m.key);
  return [];  // admin 和 user 均需手动配置
}
```

`getEffectiveMenuPerms()` 中 `super_admin` 仍有独立硬编码绕过（line 520），确保超级管理员不受任何权限限制。

#### `switchTab()` 权限守卫修复

```js
// 修复前：allowed.length 为 0 时短路，空权限用户可绕过守卫
if (permKey && allowed.length && !allowed.includes(permKey))

// 修复后：空权限也能正确拦截
if (permKey && !allowed.includes(permKey))
```

无权限用户调用 `switchTab()` 时，若找不到任何可用 Tab（`found === false`），直接 `return` 不切换。

#### `silentRoleSync()` —— 后台静默同步

`init()` 完成后异步从 DB 拉取最新 `role`/`menu_perms`/`color_idx`/`password`，更新 `currentUser` 并重新调用 `applyMenuPerms()`。失败静默，不影响页面使用。

---

## 认证流程

1. `login.html` — 用户输入 name + password → 前端 `md5(pass)` 哈希 → 与 DB 中的哈希值比对
2. **兼容迁移**：若 DB 中密码仍为明文（旧数据），比对明文通过后自动升级为 MD5 哈希存储
3. 成功后存储 `localStorage.pm_session = { id, name, role, password: md5Hash, ..., loginAt }`（密码字段存哈希值）
4. 跳转到 `projectManage.html`
5. `init()` 读取 session → 校验 8 小时有效期 → `silentRoleSync()` → `loadState()` → `initRealtime()`
6. 角色：`super_admin`(3) > `admin`(2) > `user`(1)
7. `menu_perms` JSON 字段控制菜单可见性（`applyMenuPerms()`），支持按五大分组（项目管理/资金计划/基础库配置/AI 助手/系统管理）精细控制，无必选项
8. 顶部模块 TAB 根据分组权限自动显示/隐藏，无权限时不允许切换
9. **密码使用 MD5 哈希存储**（V16 变更）：DB 存储 `md5(password)`，Session 中也是哈希值，不再传输明文
10. **仅 `super_admin` 默认拥有全部菜单权限**，`admin` 和 `user` 需手动配置（V15 变更）

### 记住密码（V16 新增）

- 登录页新增「记住密码」复选框，勾选后 5 天内再次打开页面可免输入密码
- 实现方式：`localStorage.pm_remember = { expires: timestamp }`，过期时间 = 登录时间 + 5 天
- `login.html` 页面加载时检查 `pm_remember`，有效则直接跳转主页面
- `pm-core.js init()` 中 Session 过期时也会检查 `pm_remember`：若 Remember Me 有效则刷新 `loginAt` 延长会话，避免 8 小时自动退出
- 退出登录时清除 `pm_session`，但保留 `pm_remember`（设置 `loggedOut: true`），下次打开登录页自动预填账号密码

### 密码存储与验证（V16 变更）

| 操作 | 旧（V15） | 新（V16） |
|------|----------|----------|
| 登录验证 | `.eq('password', plaintext)` | 按 name 查用户 → 前端 `md5(input)` vs DB hash，兼容明文自动升级 |
| Session 存储 | `password: plaintext` | `password: md5Hash` |
| 修改密码 | 明文对比 + 明文写入 DB | `md5(oldPwd)` 对比 + `md5(newPwd)` 写入 DB |
| 创建成员 | 明文写入 DB | `md5(password)` 写入 DB |
| 重置密码 | 明文写入 DB | `md5(DEFAULT_PWD)` 写入 DB |
| MD5 函数位置 | 无 | `pm-core.js` 顶部（全局 `md5(str)`）和 `login.html` 内联 |

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
4. **密码 MD5 哈希（V16）**：`members.password` 存的是 `md5(password)`，前端所有密码操作（登录/修改/创建/重置）均使用哈希值。旧明文密码首次登录时自动升级。`md5()` 函数定义在 `pm-core.js` 顶部和 `login.html` 中。
5. **记住密码（V16）**：`localStorage.pm_remember` 存储 5 天有效期，登录页和 pm-core.js init() 均检查。退出登录时清除。
6. **Finance 有独立的 `finance.html`**：但同样依赖 localStorage 中 PM 的 session
7. **lucide-icons** 在每次 `finRender()` 后需调用 `lucide.createIcons()` 刷新图标
7. **通知铃铛**：数据来自 PM tasks（内存 `state.tasks`）和 Finance（内存 `finState`），不额外查库；已读状态仅存 localStorage，不跨设备同步
8. **甘特图依赖线**：依赖 `barMap` 在 `renderGantt()` 中构建，必须在 `renderGantt()` 尾部调用 `drawGanttDepLines()`
9. **周视图**：仅按当前周（周一～周日）显示，不支持翻周；通过 `window._todayViewMode` 切换，不走 `currentView` 路由
10. **快捷录入**：写入 `actual_receipts`/`actual_payments` 后自动跳转到 T5/T6 偏差分析 Tab
11. **filter 变量必须用 `var`**：`filterProject`、`filterStatus`、`filterAssignee` 使用 `var` 声明（非 `let`），因为 inline onclick 需通过 `window` 访问这些变量。若用 `let` 会导致 onclick 设置的值与 `renderTaskList()` 读取的值不同步。
12. **`staggerEntrance()` 必须通过 `render()` 调用**：直接调用 `renderTaskList()` 等视图函数不会触发入场动画，任务卡片虽然生成但 CSS `visibility: hidden` 导致不可见。需在 onclick 中调用 `render()` 而非 `renderTaskList()`。
13. **权限系统（V15 最终版）**：所有 `data-menu-key` 元素由 `applyMenuPerms()` 统一控制显隐。PM/Finance TAB 无 `data-menu-key` 属性，由 `hasGroupPerm()` 单独控制。新增菜单 key 时需同步更新 `MENU_DEFS`、`LOG_CATS`、菜单配置弹窗的 `GROUPS` 数组。**仅 `super_admin` 默认全权限，`admin`/`user` 默认 `[]`。**
14. **AI 按钮权限（V15 新增）**：AI 按钮有 `data-menu-key="ai_assistant"`，属于 `ai` 分组，和普通菜单走统一权限体系。不再根据 PM/Finance/Base 权限隐式推导。
15. **`switchTab()` 权限守卫（V15 修复）**：不再依赖 `allowed.length` 判断（空数组 `0` 为 falsy 会短路），直接检查 `!allowed.includes(permKey)`。
16. **AI 面板准入（V15 新增）**：`_openAiPanel()` 首行检查 `_aiHasPerm('ai_assistant')`，无权限 toast 拒绝。
17. **AI 关键词拦截（V15 新增）**：合同/客户/供应商关键词各自精确检查对应菜单 key，不再用聚合函数绕过。
18. **`render()` 含 `activeModule` 守卫**：Finance 模式下不会渲染 PM 视图，防止 `loadState()` 的实时同步回调在 Finance 页面错误渲染 PM 内容。
19. **Finance Tab 权限映射**：`TAB_PERM_MAP` 在 finance-core.js 中定义 finance/base Tab 到菜单 key 的映射，`switchTab()` 无权限时自动跳转到第一个可用 Tab。
20. **旧版 `finance` key 兼容**：`getEffectiveMenuPerms()` 会自动将旧版单一 `'finance'` key 展开为全部 `fin_*` 子菜单，无需手动迁移数据库。
21. **AI 系统审计（V15 新增）**：AI 可回答成员权限查询（需 `members` 权限）、今日登录记录（仅 super_admin + `logs` 权限）。登录数据通过 `_fetchTodayLogins()` 异步拉取，缓存在 `_aiLoginCache`。
22. **菜单权限弹窗按钮（V15 修复）**：已移除「恢复默认」按钮。「全部勾选」「全部取消」修复了重新打开弹窗时读取 DB 原始值而非编辑状态的 bug，`openMenuPermsModal()` 现在优先读取 `window._editingPerms`。

---

## V16-SEC 安全加固（2026-05-04）

### SEC-01：密码从前端 Session 清除（已完成）

- `login.html`：`doLogin()` 使用解构 `const { password: _pw, ...safeData } = data` 排除密码字段
- `pm-core.js`：`silentRoleSync()` 查询移除 `password` 列；`init()` 添加遗留密码清除逻辑
- `pm-auth.js`：修改密码时从 DB 查询验证旧密码，不再依赖内存中的 `currentUser.password`
- `pm-members.js`：重置密码时只更新内存 `currentUser.password`，不再写入 localStorage

### SEC-02：登录频率限制（已完成）

- `login.html`：前端 localStorage 计数器，5 次失败 → 15 分钟锁定
- 辅助函数：`getRateState()`, `isRateLimited()`, `recordFailedAttempt()`, `clearRateLimit()`, `getRemainingLockSeconds()`
- 分层警告：剩余 3-4 次 → 普通提示；剩余 1-2 次 → 临近锁定警告；0 次 → 锁定提示
- 登录成功清除计数；页面加载时检查锁定状态（防止刷新绕过）

### SEC-03：密码哈希迁移（需 Supabase 部署）

- **SQL 迁移文件**：`supabase/migrations/001_hash_passwords.sql`
  - 启用 pgcrypto 扩展，添加 `password_hash` 列
  - 批量迁移现有密码：`crypt(password, gen_salt('bf', 10))`
  - 创建 `verify_password(plain, hashed)` 和 `hash_password(plain)` RPC 函数
- **Edge Function**：`supabase/functions/auth-login/index.ts`
  - 服务端验证登录（bcrypt + MD5 兜底），懒迁移明文密码
  - 返回不含密码字段的安全用户对象
- 部署命令：`cd supabase && supabase functions deploy auth-login`

### SEC-04：Supabase RLS 策略（需 Supabase 部署）

- **SQL 迁移文件**：`supabase/migrations/002_rls_policies.sql`
  - 辅助函数：`get_current_user_id()`, `get_current_user_role()`, `is_admin_or_above()`
  - 任务/项目/成员/日志/标签表的完整 RLS 策略（FOR ALL / SELECT / INSERT / UPDATE / DELETE）
  - 三级角色权限：super_admin 全量、admin 排除 super_admin、user 只看自己的
- **注意**：需要在登录时颁发 JWT Token 并注入 Supabase 客户端（参见 PRD SEC-04 Step 3）
- **注意**：Finance 表的 RLS 策略需要根据实际表名调整后启用

### SEC-05：日志写入防篡改（已完成）

- `pm-logs.js`：`logAction()` 开头添加 `if (!currentUser || !currentUser.id) return;`
- 强制使用 Session 中的 `currentUser.id`，不接受外部传入的 user ID

### SEC-06：XSS 防护加固（已完成）

- 所有 JS 文件中用户输入数据在 `innerHTML` 渲染前均通过 `escHtml()` 转义
- 修复范围：`pm-views.js`, `pm-tasks.js`, `pm-core.js`, `pm-projects.js`, `pm-members.js`, `pm-logs.js`, `finance-base.js`, `finance-t1.js`, `finance-t2.js`, `finance-t3.js`
- 转义字段：`t.title`, `p.name`, `m.name`, `tg.name`, `t.priority`, `r.name`, `c.name`, `customer_name`, `supplier_name`, `short_name`, `contact`, `phone`, `remark`, `company_name`, `dept_name`, `r.operator`, `linked.name`
- `escHtml(s)` 定义在 `pm-core.js`：转义 `& < > "` 四个字符

### SEC-07：Session 服务端吊销（需 Supabase 部署）

- **SQL 迁移文件**：`supabase/migrations/003_sessions.sql` — 创建 `sessions` 表
- **Edge Function**：`supabase/functions/revoke-session/index.ts` — 吊销指定 session
- 部署命令：`cd supabase && supabase functions deploy revoke-session`

### Supabase 部署清单

用户需在 Supabase Dashboard 执行以下操作：

1. **SQL Editor**：依次执行 `supabase/migrations/` 下的 3 个 SQL 文件
2. **Edge Functions**：部署 `auth-login` 和 `revoke-session` 两个函数
3. **Edge Function 环境变量**：确认 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 已配置
4. **RLS 上线策略**：先对 `global_tags` 表 ENABLE RLS 验证流程正常，再逐步对核心表启用

---

## V16 迭代更新（2026-05-04）

### 1. `loadState(force)` 强制刷新参数

**位置**：`pm-core.js`

```js
async function loadState(force) {
  if (!force && Date.now() - _lastLoadTime < 800) return;
  // ...
}
```

- AI 写操作完成后调用 `loadState(true)` 绕过 800ms 防抖，确保 UI 立即更新
- 所有普通调用点（init、realtime 回调）不加参数，正常走防抖逻辑

### 2. AI 对话历史持久化

**位置**：`pm-ai.js`

- **localStorage key**：`pm_ai_history_v1`，最多保留 `AI_HISTORY_MAX = 20` 条
- **写入时机**：每次用户发送消息和 AI 回复完成后调用 `_saveAiHistory()`
- **恢复时机**：打开 AI 面板时，若 DOM 尚未渲染且 localStorage 有历史记录，调用 `_restoreHistoryToDOM()` 逐条重建消息气泡
- **历史恢复提示条**：面板底部显示「上次对话（N 条）」提示条 + 「清除历史」按钮
- **CSS**：`ai-panel.css` 新增 `.ai-history-tip`、`.ai-history-icon`、`.ai-history-clear` 样式

### 3. 记住密码增强 —— 退出登录后保留凭据

**位置**：`login.html`、`pm-core.js`

- **退出登录**（`handleLogout()`）：不再删除 `pm_remember`，改为设置 `loggedOut: true`
- **登录页加载**：检测到 `loggedOut === true` 时预填账号密码并勾选复选框，删除 `loggedOut` 标记
- **行为变化**：退出后回到登录页 → 表单已填好 → 直接点登录即可；未设置 `loggedOut` 的 Remember Me 仍然自动跳转主页面

### 4. AI `task_create` 字段扩展

**位置**：`pm-ai.js` — `_parseWriteAction()` 中的 `newTask` 构建

`[WRITE_ACTION]` 现在支持创建任务时传入更多字段：

| 字段 | DB 列 | 说明 |
|------|-------|------|
| `startDate` | `start_date` | 任务开始日期 |
| `status` | `status` | 初始状态（默认「待启动」） |
| `tags` | `tags` | 标签数组（JSONB） |

- `_buildPmContext()` 任务映射中新增 `startDate` 字段
- `_buildSystemPrompt()` 的 task_create 格式示例中增加了这几个字段的说明
- `fieldMap` 新增 `startDate: 'start_date'` 映射

### 5. AI 写操作确认改进

**位置**：`pm-ai.js` — `aiConfirmWrite()`

- **正则改为贪婪**：`\[WRITE_ACTION\]\s*(\{[\s\S]*\})` — 防止嵌套 JSON 被截断
- **fieldMap 扩展**：新增 `status`, `priority`, `assigneeId`, `startDate`, `due` 等字段映射
- **刷新策略**：所有 `render()` 调用改为 `loadState(true)` — 先重新拉取 DB 数据再渲染，确保 UI 与数据库一致

### 6. AI 权限管理限制为仅 super_admin

**位置**：`pm-ai.js` — `_aiCanManagePerms()`

```js
function _aiCanManagePerms() {
  if (!currentUser) return false;
  if (!_aiHasPerm('members')) return false;
  return currentUser.role === 'super_admin';  // 移除了 admin
}
```

- **变更前**：admin 和 super_admin 均可通过 AI 分配/撤销成员权限
- **变更后**：仅 super_admin 可通过 AI 操作成员权限
- **级联影响**：发送消息关键词拦截、写操作确认、`_aiCanGrantMenuKey()` 高危 key 过滤均受此限制

### 7. AI 助手菜单权限组仅 super_admin 可见

**位置**：`pm-members.js` — `openMenuPermsModal()`

- 非 super_admin 打开菜单权限配置弹窗时，`ai` 分组从 `GROUPS` 数组中过滤掉
- `selectAllMenuPerms` 同步过滤：`if (md.group === 'ai' && currentUser && currentUser.role !== 'super_admin') return false;`
- **效果**：admin 和 user 在角色权限管理界面完全看不到「AI 助手」菜单项

### 8. SEC-06 XSS 防护全面完成

**覆盖文件**（~50 处修复，`escHtml()` 包裹所有用户数据再 innerHTML）：

| 文件 | 修复数 | 涉及字段 |
|------|--------|---------|
| `pm-views.js` | ~15 | `p.name`, `m.name`, `t.title`, `t.priority`, `g.proj.name` |
| `pm-tasks.js` | ~10 | `p.name`, `m.name`, `tg.name`, `x.title`, `r.operator`, `t.title`, `t.priority` |
| `pm-core.js` | 1 | `p.name`（侧边栏项目导航） |
| `pm-projects.js` | ~5 | `m.name`（成员列表和选项） |
| `pm-members.js` | ~10 | `m.name`（成员列表/权限弹窗）, `tg.name`（标签列表） |
| `finance-base.js` | ~12 | `r.name`, `c.name`, `linked.name`, `customer_name`, `supplier_name`, `short_name`, `contact`, `phone`, `remark` |
| `finance-t1.js` | 2 | `company_name`, `dept_name` |
| `finance-t2.js` | 2 | `c.name`, `customer_name` |
| `finance-t3.js` | 2 | `s.name`, `supplier_name` |
