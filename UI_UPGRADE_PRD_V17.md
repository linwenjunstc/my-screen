# PM Board V17 → V18 · UI 全面精致化升级 PRD

> **文档用途**：供 Claude Code 直接执行，无需二次解读  
> **目标版本**：V18  
> **工作目录**：项目根目录（含 `css/`、`js/`、`login.html`、`projectManage.html`）  
> **执行策略**：按优先级 P0 → P1 → P2 顺序执行，每个 Task 完成后用 `node --check` 检查 JS，用浏览器截图验证 CSS

---

## 全局约定

- 所有颜色修改只改 CSS 文件，不改 JS
- 不新增外部依赖，不引入新字体
- 暗色主题（`.dark` class）同步适配所有改动
- 代码注释格式：`/* UI-V18: [TASK-ID] */`
- **禁止** 用 `str_replace` 对超过 300 行的 CSS 文件做大段替换，改用精准的小块替换

---

## P0 · 立即可做 · 预计总耗时 ≤ 2h

### TASK-UI-01 · 顶部模块 Tab 胶囊化

**文件**：`css/pm.css`  
**目标**：将「项目管理 / 资金计划」两个 Tab 从当前的下划线样式改为胶囊容器样式

**找到现有样式**：
```css
/* 搜索关键词：top-tab-bar */
.top-tab-bar { ... }
.top-tab { ... }
.top-tab.active { ... }
```

**替换为以下样式**（完整替换上述三个规则）：
```css
/* UI-V18: TASK-UI-01 */
.top-tab-bar {
  height: var(--header-h);
  flex-shrink: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 8px;
  box-shadow: 0 1px 0 var(--border), 0 2px 10px rgba(0,0,0,.04);
}
.top-tab-group {
  background: var(--surface2);
  border-radius: 20px;
  padding: 3px;
  display: inline-flex;
  gap: 2px;
  border: 1px solid var(--border);
}
.top-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  cursor: pointer;
  border: none;
  background: transparent;
  font-family: var(--font);
  transition: background .15s, color .15s, box-shadow .15s;
  white-space: nowrap;
}
.top-tab:hover { background: var(--surface); color: var(--text); }
.top-tab.active {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: #fff;
  box-shadow: 0 1px 6px rgba(37,99,235,.35);
}
.top-tab.active svg { stroke: #fff; }
.top-tab-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}
```

**修改 `projectManage.html`**：在 `#top-tab-bar` 内部，用 `<div class="top-tab-group">` 将两个 `.top-tab` 按钮包裹起来：
```html
<!-- 找到 -->
<div class="top-tab-bar" id="top-tab-bar">
  <button class="top-tab active" id="top-tab-pm" ...>...</button>
  <button class="top-tab" id="top-tab-finance" ...>...</button>
  <div class="top-tab-right">

<!-- 改为 -->
<div class="top-tab-bar" id="top-tab-bar">
  <div class="top-tab-group">
    <button class="top-tab active" id="top-tab-pm" ...>...</button>
    <button class="top-tab" id="top-tab-finance" ...>...</button>
  </div>
  <div class="top-tab-right">
```

**验收**：两个 Tab 共享一个灰底胶囊容器，激活项为蓝紫渐变，右侧工具区有分隔线。

---

### TASK-UI-02 · Modal 遮罩毛玻璃效果

**文件**：`css/pm.css`  
**目标**：Modal 背景遮罩从纯黑改为毛玻璃效果

**找到现有样式**（搜索 `.modal-overlay` 或 `.modal-backdrop`）：
```css
.modal-overlay { background: rgba(0,0,0,.45); ... }
```

**替换 `background` 属性**，并新增 `backdrop-filter`：
```css
/* UI-V18: TASK-UI-02 */
.modal-overlay {
  /* 保留其他属性不变，只替换以下两行 */
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px) saturate(1.2);
  -webkit-backdrop-filter: blur(8px) saturate(1.2);
}
```

**暗色主题同步**：在 `.dark .modal-overlay` 中同样添加 `backdrop-filter`：
```css
/* UI-V18: TASK-UI-02 dark */
.dark .modal-overlay {
  background: rgba(2, 6, 23, 0.55);
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
}
```

**验收**：打开任意弹窗，背景内容有模糊效果，不是纯黑遮盖。

---

### TASK-UI-03 · 主操作按钮渐变升级

**文件**：`css/pm.css`  
**目标**：所有 `.btn-primary`（或等效的保存/确认按钮）改为渐变 + hover 微抬起效果

**找到现有样式**（搜索 `btn-primary` 或 `background:var(--accent)` 的按钮规则）：

**在现有 `.btn-primary` 规则中替换/新增以下属性**：
```css
/* UI-V18: TASK-UI-03 */
.btn-primary {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  border: none;
  box-shadow: 0 1px 4px rgba(37,99,235,.25);
  transition: transform .15s, box-shadow .15s, filter .15s;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(37,99,235,.38);
  filter: brightness(1.06);
}
.btn-primary:active {
  transform: translateY(0) scale(.98);
  box-shadow: 0 1px 4px rgba(37,99,235,.2);
  filter: brightness(.98);
}
```

**同时检查 Finance 侧边栏的 `.sb-save-btn` 或类似保存按钮**，在 `css/finance-extra.css` 里做同样替换。

**验收**：点击「保存」「确认」等主操作按钮时有微抬起效果，hover 时有轻微光晕。

---

### TASK-UI-04 · 自定义滚动条

**文件**：`css/pm.css`（在文件末尾追加）

**追加以下代码**：
```css
/* UI-V18: TASK-UI-04 — 细滚动条 */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
  transition: background .2s;
}
*:hover::-webkit-scrollbar-thumb { background: var(--border2); }
::-webkit-scrollbar-thumb:hover { background: var(--text3) !important; }
/* Firefox */
* { scrollbar-width: thin; scrollbar-color: transparent transparent; }
*:hover { scrollbar-color: var(--border2) transparent; }
```

**验收**：侧边栏、内容区、表格等滚动时显示细滚动条，不滚动时隐藏。

---

### TASK-UI-05 · 关闭按钮统一升级

**文件**：`css/pm.css`  
**目标**：Modal 关闭按钮 hover 时变红色

**找到 `.modal-close` 相关规则**，追加以下 hover 效果：
```css
/* UI-V18: TASK-UI-05 */
.modal-close {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text3);
  transition: background .12s, color .12s, border-color .12s;
}
.modal-close:hover {
  background: var(--red-bg);
  color: var(--red);
  border-color: var(--red-border);
}
```

**验收**：Modal 关闭按钮 hover 时背景变淡红，图标变红。

---

## P1 · 半天内完成 · 视觉提升明显

### TASK-UI-06 · 侧边栏 Logo 升级为渐变方形图标

**文件**：`projectManage.html`（PM 侧边栏区域）  
**目标**：把 Logo 圆点改为渐变方形图标块

**找到现有 HTML**：
```html
<div class="sidebar-logo">
  <div class="sidebar-logo-row">
    <div class="logo-text">PM Board</div>
```

**将 `logo-text` 内部的圆点（CSS `::before` 实现）改为 HTML 结构**：
```html
<!-- 替换整个 sidebar-logo div 为 -->
<div class="sidebar-logo">
  <div class="sidebar-logo-row">
    <div class="logo-text">
      <div class="logo-icon">PM</div>
      PM Board
    </div>
    <button class="sidebar-collapse-btn" ...>...</button>
  </div>
  <div class="logo-sub" id="sidebar-date-label">加载中...</div>
</div>
```

**在 `css/pm.css` 中**，找到 `.logo-text::before` 规则，**删除**它，改为 `.logo-icon` 样式：
```css
/* UI-V18: TASK-UI-06 — 删除旧的 ::before 圆点规则 */
/* .logo-text::before { ... }  ← 删除这整段 */

/* 新增 logo-icon */
.logo-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -.3px;
  flex-shrink: 0;
}
```

**验收**：侧边栏顶部显示蓝紫渐变的 "PM" 方形图标，不再是发光圆点。

---

### TASK-UI-07 · 侧边栏激活项改为 Indigo 色系

**文件**：`css/pm.css`  
**目标**：激活导航项从蓝色改为蓝紫 indigo 色，视觉层次更分明

**找到现有规则**：
```css
.nav-item.active {
  background: linear-gradient(90deg, var(--sb-active), rgba(37,99,235,.06));
  color: #f0ede6;
  font-weight: 500;
  border-left-color: var(--accent);
}
```

**替换为**：
```css
/* UI-V18: TASK-UI-07 */
.nav-item.active {
  background: linear-gradient(90deg, rgba(99,102,241,.22), rgba(99,102,241,.05));
  color: #c7d2fe;
  font-weight: 500;
  border-left-color: #818cf8;
}
.nav-item.active .nav-badge {
  background: rgba(129,140,248,.25);
  color: #c7d2fe;
}
```

**同步修改 Finance 侧边栏**（`css/finance-extra.css` 或 `css/finance.css`）：找到 `.sb-item.active` 规则，做相同的 indigo 色替换。

**验收**：激活的导航项呈蓝紫色（不是正蓝），与主内容区的蓝色主色形成层次对比。

---

### TASK-UI-08 · Stat Card 新增趋势角标和图标

**文件**：`css/pm.css` 和 `js/pm-views.js`

**步骤一：在 `css/pm.css` 末尾追加样式**：
```css
/* UI-V18: TASK-UI-08 — stat card 增强 */
.stat-card { position: relative; overflow: hidden; }

.stat-icon {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sc-red .stat-icon    { background: var(--red-bg);    color: var(--red);    }
.sc-amber .stat-icon  { background: var(--amber-bg);  color: var(--amber);  }
.sc-blue .stat-icon   { background: var(--blue-bg);   color: var(--blue);   }
.sc-green .stat-icon  { background: var(--green-bg);  color: var(--green);  }

.stat-trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 20px;
  margin-top: 6px;
}
.stat-trend.up   { background: var(--green-bg);  color: var(--green); }
.stat-trend.down { background: var(--red-bg);    color: var(--red);   }
.stat-trend.flat { background: var(--surface2);  color: var(--text3); }
```

**步骤二：修改 `js/pm-views.js` 中的 `renderToday()` 函数**  
找到生成 4 个 stat-card 的 HTML 模板（搜索 `stat-card sc-red` 或 `stat-card sc-amber`），  
在每个卡片的 HTML 中增加图标和趋势角标结构。

以「紧急任务」卡片为例，**在 `stat-val` 之后追加**：
```javascript
// 找到类似这样的模板片段：
`<div class="stat-card sc-red">
  <div class="stat-label">紧急任务</div>
  <div class="stat-val red">${urgentCount}</div>
</div>`

// 改为：
`<div class="stat-card sc-red">
  <div class="stat-icon">
    <i data-lucide="alert-circle" style="width:16px;height:16px"></i>
  </div>
  <div class="stat-label">紧急任务</div>
  <div class="stat-val red">${urgentCount}</div>
</div>`
```

对 4 个卡片分别使用以下图标（Lucide 图标名）：
- `sc-red` 紧急任务 → `alert-circle`  
- `sc-amber` 3天内到期 → `clock`  
- `sc-blue` 本周到期 → `calendar-check`  
- `sc-green` 今日已完成 → `check-circle-2`  

**注意**：每次 `renderToday()` 调用后，`lucide.createIcons()` 已有调用，图标会自动渲染。

**验收**：4 个统计卡片右上角显示对应语义图标，图标背景色与卡片主色一致。

---

### TASK-UI-09 · Finance 表格表头样式精化

**文件**：`css/finance-extra.css`（或 `css/finance.css`）  
**目标**：表头改为小写大字+字间距风格，金额列右对齐

**在 finance 相关 CSS 文件中，找到 `table thead th` 或 `.table-scroll th` 规则**，替换或追加：
```css
/* UI-V18: TASK-UI-09 */
#main-content .table-scroll table thead th {
  background: var(--surface2);
  color: var(--text3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  user-select: none;
}

/* 金额列右对齐 — 通过 class 控制 */
#main-content .table-scroll table td.num,
#main-content .table-scroll table th.num {
  text-align: right;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}

/* 正偏差绿色，负偏差红色 */
#main-content .table-scroll table td.positive { color: var(--green); font-weight: 500; }
#main-content .table-scroll table td.negative { color: var(--red);   font-weight: 500; }

/* 进度条美化 */
#main-content .fin-progress-bar {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), #818cf8);
  transition: width .4s ease;
}
#main-content .fin-progress-bar.high   { background: linear-gradient(90deg, #10b981, #34d399); }
#main-content .fin-progress-bar.medium { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
```

**在 `js/finance-t2.js`、`js/finance-t3.js` 里**，找到渲染金额列 `<td>` 的地方，给金额单元格加 `class="num"` 属性，给偏差列加 `class="num positive"` 或 `class="num negative"`（根据正负值判断）。

**验收**：Finance 表格表头显示全大写小字，金额列右对齐等宽字体。

---

### TASK-UI-10 · 用户头像组件（首字母 Avatar）

**文件**：`css/pm.css`（追加样式），`js/pm-core.js`（共享工具函数）

**步骤一：在 `css/pm.css` 末尾追加**：
```css
/* UI-V18: TASK-UI-10 — 用户 Avatar */
.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
  user-select: none;
}
.avatar-sm { width: 20px; height: 20px; font-size: 9px; }
.avatar-lg { width: 32px; height: 32px; font-size: 13px; }
```

**步骤二：在 `js/pm-core.js` 中新增全局工具函数**（在 `MEMBER_COLORS` 数组定义之后添加）：
```javascript
/* UI-V18: TASK-UI-10 */
window.renderAvatar = function(member, sizeClass = '') {
  if (!member) return '';
  const initial = (member.name || '?').charAt(0).toUpperCase();
  const colorIdx = member.colorIdx ?? 0;
  const bg = MEMBER_COLORS[colorIdx % MEMBER_COLORS.length];
  return `<span class="avatar ${sizeClass}" style="background:${bg}" title="${escHtml(member.name || '')}">${escHtml(initial)}</span>`;
};
```

**步骤三：在 `js/pm-views.js` 的任务卡片渲染处**（`renderTaskList()` 函数），  
找到显示负责人的地方（通常是 `assignee` 相关代码），  
将纯文字姓名替换为调用 `renderAvatar(member, 'avatar-sm')`。

**验收**：任务卡片右侧显示负责人彩色圆形 Avatar，与成员颜色对应。

---

## P2 · 需较多改动 · 建议集中一个时段完成

### TASK-UI-11 · 登录页品牌化升级

**文件**：`login.html`（仅修改此文件内的 CSS 和 HTML）

**目标**：左侧暗色区域展示品牌信息，右侧表单更精致

**步骤一：在 `login.html` 的 `<style>` 中追加以下样式**：
```css
/* UI-V18: TASK-UI-11 */
.brand-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px 36px;
}
.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
}
.brand-name {
  font-size: 18px;
  font-weight: 600;
  color: #f0ede6;
  margin-bottom: 6px;
  letter-spacing: -.3px;
}
.brand-desc {
  font-size: 12px;
  color: #475569;
  margin-bottom: 24px;
  line-height: 1.6;
}
.brand-features {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}
.brand-feature {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}
.brand-feature-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #2563eb;
  flex-shrink: 0;
}
.brand-version {
  font-size: 10px;
  color: #1e3a5f;
  font-family: var(--mono);
  letter-spacing: .06em;
}
.login-card-inner {
  background: var(--surface);
  border-radius: 14px;
  padding: 28px 28px 24px;
  box-shadow: 0 8px 32px rgba(0,0,0,.1), 0 2px 8px rgba(0,0,0,.06);
  width: 100%;
  max-width: 320px;
}
.login-card-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
  letter-spacing: -.2px;
}
.login-card-subtitle {
  font-size: 12px;
  color: var(--text3);
  margin-bottom: 20px;
}
```

**步骤二：找到 `<div class="bg-left">` 对应的内容区块**，  
在其中（或紧邻的左半区布局容器）添加品牌面板内容：
```html
<!-- 在左侧暗色区域内追加 -->
<div class="brand-panel">
  <div class="brand-logo">PM</div>
  <div class="brand-name">PM Board</div>
  <div class="brand-desc">项目管理 · 资金计划<br>一站式业务协作平台</div>
  <div class="brand-features">
    <div class="brand-feature">
      <div class="brand-feature-dot"></div>
      实时任务协作与甘特图
    </div>
    <div class="brand-feature">
      <div class="brand-feature-dot"></div>
      资金台账与偏差分析
    </div>
    <div class="brand-feature">
      <div class="brand-feature-dot"></div>
      AI 智能助手（DeepSeek）
    </div>
  </div>
  <div class="brand-version">V17 · Powered by DeepSeek AI</div>
</div>
```

**步骤三：找到登录表单容器**，给最外层卡片加上 `login-card-inner` class，  
并将标题从原来的样式改用 `login-card-title` 和 `login-card-subtitle` class。

**验收**：登录页左侧显示品牌 Logo、产品名、3 条特性说明和版本号；右侧登录卡有明显投影悬浮感。

---

### TASK-UI-12 · Toast 通知样式精化

**文件**：`css/pm.css`

**目标**：Toast 出现时有弹入动画，加左侧语义色块

**找到现有 `.toast` 相关规则**，替换/升级为：
```css
/* UI-V18: TASK-UI-12 */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px 12px 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,.1), 0 1px 4px rgba(0,0,0,.06);
  font-size: 13px;
  color: var(--text);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 320px;
  animation: toastIn .22s cubic-bezier(.22,1,.36,1) forwards;
  border-left: 3px solid var(--border2);
}
.toast.success { border-left-color: var(--green); }
.toast.error   { border-left-color: var(--red);   }
.toast.warning { border-left-color: var(--amber);  }
.toast.info    { border-left-color: var(--blue);   }

/* Toast 图标圆点 */
.toast::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--border2);
}
.toast.success::before { background: var(--green); }
.toast.error::before   { background: var(--red);   }
.toast.warning::before { background: var(--amber);  }
.toast.info::before    { background: var(--blue);   }

@keyframes toastIn {
  from { opacity: 0; transform: translateY(12px) scale(.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.toast.hiding {
  animation: toastOut .18s ease forwards;
}
@keyframes toastOut {
  to { opacity: 0; transform: translateY(8px) scale(.96); }
}
```

**验收**：Toast 从右下角弹出有弹性动画，左侧有颜色标识线，不同类型颜色不同。

---

### TASK-UI-13 · 空状态组件 (Empty State)

**文件**：`css/pm.css`（追加样式），`js/pm-core.js`（追加工具函数）

**步骤一：在 `css/pm.css` 末尾追加**：
```css
/* UI-V18: TASK-UI-13 — Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  text-align: center;
  color: var(--text3);
}
.empty-state-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  color: var(--text3);
}
.empty-state-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text2);
  margin-bottom: 5px;
}
.empty-state-desc {
  font-size: 12.5px;
  color: var(--text3);
  line-height: 1.6;
  max-width: 260px;
  margin-bottom: 16px;
}
```

**步骤二：在 `js/pm-core.js` 追加全局工具函数**：
```javascript
/* UI-V18: TASK-UI-13 */
window.renderEmptyState = function({ icon = 'inbox', title = '暂无数据', desc = '', action = '' } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        <i data-lucide="${escHtml(icon)}" style="width:22px;height:22px"></i>
      </div>
      <div class="empty-state-title">${escHtml(title)}</div>
      ${desc ? `<div class="empty-state-desc">${escHtml(desc)}</div>` : ''}
      ${action}
    </div>`;
};
```

**步骤三：在 `js/pm-views.js` 和 `js/finance-base.js` 中**，  
找到现有的空状态文字（如 `暂无任务`、`暂无数据` 等纯文字提示），  
替换为调用 `renderEmptyState({...})` 函数。  

参考替换方案（各视图的图标和文案自行对应）：
- 今日看板无任务：`icon:'sun', title:'今日没有待办任务', desc:'点击「快速添加任务」开始安排今天的工作'`
- 全部任务空：`icon:'list-checks', title:'还没有任务', desc:'创建第一个任务来开始项目管理'`
- Finance 表格空：`icon:'file-text', title:'本月暂无数据', desc:'请先在合同库添加相关合同信息'`

**验收**：空状态显示图标 + 标题 + 描述，不是纯文字，视觉更友好。

---

### TASK-UI-14 · 数据加载骨架屏

**文件**：`css/pm.css`（追加样式），`js/pm-core.js`（在 `loadState` 前后调用）

**步骤一：在 `css/pm.css` 末尾追加**：
```css
/* UI-V18: TASK-UI-14 — Skeleton */
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
.skeleton-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 13px 16px;
  margin-bottom: 6px;
}
.skeleton-line { height: 12px; margin-bottom: 8px; }
.skeleton-line.short { width: 40%; }
.skeleton-line.medium { width: 65%; }
.skeleton-line.full { width: 100%; }
.skeleton-line.thin { height: 9px; }
```

**步骤二：在 `js/pm-core.js` 的 `loadState()` 函数开始处**，在加载数据前渲染骨架屏：
```javascript
/* UI-V18: TASK-UI-14 — 在 loadState 最开始加 */
function renderSkeleton() {
  const skeletonCard = () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-line medium"></div>
      <div class="skeleton skeleton-line short thin"></div>
    </div>`;
  // 仅在内容区为空时显示，避免刷新闪烁
  const content = document.getElementById('main-content');
  if (content && !content.children.length) {
    content.innerHTML = skeletonCard().repeat(5);
  }
}
```

在 `loadState()` 开头调用 `renderSkeleton()`，数据渲染完成后自然被替换。

**注意**：仅在内容区完全空白时调用（首次加载），避免已有数据时闪烁。

**验收**：首次打开页面（内容区空）时短暂显示灰色 shimmer 骨架条，数据加载后自动替换。

---

## 最终验收清单

所有 Task 完成后，逐项检查以下内容：

| 检查项 | 预期表现 |
|--------|---------|
| 顶部 Tab | 胶囊容器，激活项蓝紫渐变，右侧工具区有分隔线 |
| Modal 遮罩 | 打开弹窗时背景有模糊效果（毛玻璃） |
| 主按钮 | hover 时微抬起 1px，有蓝色光晕 |
| 滚动条 | 细 4px，不用时隐藏，滚动时出现 |
| Modal 关闭 | hover 时红色背景 |
| 侧边栏 Logo | 蓝紫渐变方形图标块 |
| 激活导航项 | Indigo 色（偏紫蓝），不是纯蓝 |
| Stat Card | 右上角有语义图标 |
| Finance 表头 | 全大写小字+字间距 |
| 负责人 | 任务卡片右侧彩色 Avatar |
| 登录页左侧 | 显示品牌 Logo、特性说明、版本号 |
| Toast | 弹入动画，左侧色条标识 |
| 空状态 | 图标 + 标题 + 描述 |
| 首次加载 | 短暂骨架屏 |
| 暗色主题 | 以上改动在 `.dark` 模式下无白色硬编码颜色 |

---

## 注意事项 & 风险提示

1. **`finance-extra.css` 覆盖优先级**：部分 finance 样式写在 `finance-extra.css`，其优先级可能覆盖 `pm.css` 中的同名规则。如遇样式不生效，检查是否需要在 `finance-extra.css` 中补充同步修改。

2. **`backdrop-filter` 兼容性**：TASK-UI-02 的毛玻璃效果在部分旧版 Chrome 需要 `-webkit-` 前缀，代码中已包含，无需额外处理。但如果目标运行环境在局域网内网（如 IE/Edge 旧版），可以跳过此 Task 或加 `@supports` 降级处理。

3. **Lucide 图标刷新**：TASK-UI-08 和 TASK-UI-13 中新增了 `data-lucide` 属性的图标，必须在对应的渲染函数末尾确认有 `lucide.createIcons()` 调用，否则图标不会显示。

4. **`str_replace` 大文件风险**：`pm.css` 超过 1000 行，`pm-views.js` 超过 1000 行，对这两个文件操作时，每次 `str_replace` 只替换一个精准的小块，完成后用 `grep -n "TASK-UI-XX"` 确认注释已写入正确位置。

5. **每个 Task 完成后立即测试**：不要批量完成再统一测试，单个 CSS 语法错误会导致整个文件失效。
