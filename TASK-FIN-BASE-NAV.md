# TASK-FIN-BASE-NAV · 基础库升为 Finance 侧边栏一级导航

> **优先级**：P1  
> **影响文件**：`projectManage.html`、`js/finance-core.js`、`js/finance-base.js`、`css/finance.css`（或 `finance-extra.css`）  
> **预计改动量**：中（约 80-120 行）  
> **不涉及**：数据库、Supabase 表结构、任何权限逻辑（权限判断代码原样保留）

---

## 背景与目标

现状：基础库（合同库、客户库、供应商库）的入口藏在侧边栏底部「基础库配置」按钮 → 弹出 Modal → 再点按钮进入。二级弹窗导航导致入口深、操作步骤多。

目标：将三个库直接作为 Finance 侧边栏的一级导航项，点击即切换视图，与 T1/T2 等报表 Tab 行为完全一致。移除原有的中间跳转 Modal。

---

## 改动后的侧边栏结构

```
PM Board
资金计划模块

月份 [下拉选择器]

── 计划报表 ──
  月度资金计划       (tab: t1)
  对上收款台账       (tab: receipt)
  对下付款计划       (tab: payment)
  完成情况           (tab: t4)
  实际收款明细       (tab: t5)
  实际支付明细       (tab: t6)
  资金看板           (tab: dashboard)

── 基础库 ──           ← 新增 section label
  合同库             (tab: base_contracts)   ← 新增
  客户库             (tab: base_customers)   ← 新增
  供应商库           (tab: base_suppliers)   ← 新增

── 底部 ──
  基础信息配置       (保留原有按钮，仅此一项)  ← 原「基础库配置」按钮改为「基础信息配置」
```

---

## 实现步骤

### Step 1 · 修改 `projectManage.html` — 侧边栏 HTML

**找到 Finance 侧边栏**（`id="sidebar-finance"`），定位到 `<nav class="sb-nav">` 内部。

**在「资金看板」`sb-item` 之后**，追加分组标签和三个新导航项：

```html
<!-- 在「资金看板」sb-item 后面追加 -->
<div class="sb-section">基础库</div>

<button class="sb-item" id="tab-base-contracts"
  data-menu-key="base_contracts"
  onclick="switchTab('base_contracts')">
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M3 2h10v12H3z"/><line x1="5" y1="5.5" x2="11" y2="5.5"/>
    <line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="10.5" x2="9" y2="10.5"/>
  </svg>
  合同库
</button>

<button class="sb-item" id="tab-base-customers"
  data-menu-key="base_customers"
  onclick="switchTab('base_customers')">
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="5" r="3"/>
    <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5"/>
  </svg>
  客户库
</button>

<button class="sb-item" id="tab-base-suppliers"
  data-menu-key="base_suppliers"
  onclick="switchTab('base_suppliers')">
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="1" y="6" width="14" height="8" rx="1"/>
    <path d="M4 6V4a4 4 0 0 1 8 0v2"/>
  </svg>
  供应商库
</button>
```

**同时修改底部区域**：将原「基础库配置」按钮的文案改为「基础信息配置」，`onclick` 改为直接调用 `openBasicInfoModal()`：

```html
<!-- 找到原来的 sb-util 按钮，改为 -->
<button class="sb-util" id="basic-info-btn"
  data-menu-key="basic_info"
  onclick="openBasicInfoModal()">
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" stroke-width="1.5">
    <circle cx="8" cy="8" r="6"/>
    <line x1="8" y1="5" x2="8" y2="8"/>
    <circle cx="8" cy="11" r=".5" fill="currentColor"/>
  </svg>
  基础信息配置
</button>
```

---

### Step 2 · 修改 `js/finance-core.js` — 注册新 Tab 路由

**找到 `TAB_PERM_MAP`** 对象（记录 tab key 到菜单权限 key 的映射），追加三条：

```javascript
// 在 TAB_PERM_MAP 中追加：
base_contracts: 'base_contracts',
base_customers: 'base_customers',
base_suppliers: 'base_suppliers',
```

**找到 `finRender()` 函数**（根据 `currentTab` 分发渲染），在 switch/if 分支中追加三个 case：

```javascript
// 在 finRender() 的分发逻辑中追加：
case 'base_contracts':
  renderBaseContracts();   // 调用已有函数，见 Step 3
  break;
case 'base_customers':
  renderBaseCustomers();
  break;
case 'base_suppliers':
  renderBaseSuppliers();
  break;
```

**找到 `switchTab()` 函数**，确认新的三个 tab key 能正常通过权限守卫（`TAB_PERM_MAP` 已注册后应自动生效，无需额外改动）。

---

### Step 3 · 修改 `js/finance-base.js` — 提取渲染函数

现有的合同库、客户库、供应商库渲染逻辑已经写在 `finance-base.js` 中，但目前是通过 `openBaseLibModal()` 弹窗触发的。

**目标**：将各库的渲染逻辑从弹窗调用改为直接渲染到 `#main-content`。

**操作步骤**：

1. 找到 `openBaseLibModal()` 函数，理解它内部如何调用各库的渲染逻辑

2. 新增（或重命名/封装）以下三个全局渲染函数，将渲染目标从 Modal 内容区改为 `#main-content`：

```javascript
/* TASK-FIN-BASE-NAV */
window.renderBaseContracts = function() {
  // 将原来 openBaseLibModal 中渲染合同库的逻辑移植到这里
  // 渲染目标改为：document.getElementById('main-content')
  // 内容结构与原弹窗内相同，去掉 Modal 头部和关闭按钮即可
  const el = document.getElementById('main-content');
  if (!el) return;
  // ... 原有合同库渲染代码 ...
  lucide.createIcons();
};

window.renderBaseCustomers = function() {
  const el = document.getElementById('main-content');
  if (!el) return;
  // ... 原有客户库渲染代码 ...
  lucide.createIcons();
};

window.renderBaseSuppliers = function() {
  const el = document.getElementById('main-content');
  if (!el) return;
  // ... 原有供应商库渲染代码 ...
  lucide.createIcons();
};
```

3. **保留 `openBaseLibModal()` 函数体不删除**，但可以在函数顶部加注释标记为 deprecated，避免其他地方的调用报错：

```javascript
// TASK-FIN-BASE-NAV: deprecated — 库入口已移至侧边栏导航，此函数暂保留防止遗漏调用报错
window.openBaseLibModal = function() {
  console.warn('openBaseLibModal is deprecated, use switchTab instead');
};
```

---

### Step 4 · 修改 `js/finance-base.js` — 修复「基础库配置」按钮入口

原侧边栏底部按钮 `onclick="openBaseLibModal()"` 已在 Step 1 改为 `onclick="openBasicInfoModal()"`。

确认 `openBasicInfoModal()` 函数在 `finance-base.js` 中已存在且独立运作，无需修改。

---

### Step 5 · 更新侧边栏激活状态逻辑

**在 `js/finance-core.js` 的 `switchTab()` 函数中**，找到更新 `.sb-item.active` 的逻辑（通常是遍历所有 `sb-item` 移除 active，再给目标加 active）。

确认该逻辑使用的是 `id="tab-{tabKey}"` 的规则来匹配按钮：

```javascript
// 确认以下模式（或等效逻辑）能覆盖新增的三个 tab id：
document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('active'));
const activeBtn = document.getElementById(`tab-${currentTab}`);
if (activeBtn) activeBtn.classList.add('active');
```

新增的三个按钮 id 分别为 `tab-base-contracts`、`tab-base-customers`、`tab-base-suppliers`，与命名规则一致，**理论上无需额外改动**，执行后验证即可。

---

### Step 6 · 权限显示控制（已有机制，确认覆盖即可）

三个新 `sb-item` 已添加 `data-menu-key` 属性（`base_contracts` / `base_customers` / `base_suppliers`），与原有权限体系完全对齐。

`applyMenuPerms()` 函数会自动根据 `data-menu-key` 控制显示/隐藏，**无需修改权限相关代码**。

执行完 Step 1 后，验证权限控制是否正常：
- 有 `base_contracts` 权限 → 侧边栏显示「合同库」
- 无该权限 → 侧边栏不显示「合同库」
- 三个库均无权限 → 「基础库」section label 理想状态下也应隐藏

> **可选优化**：如果要让 section label 在三个子项都隐藏时也自动隐藏，可以在 `applyMenuPerms()` 执行后检查 `.sb-section` 后面是否有可见的 `sb-item`，若无则隐藏该 label。这属于锦上添花，不影响主流程。

---

## 验收标准

| 场景 | 预期行为 |
|------|---------|
| 有合同库权限时 | Finance 侧边栏「基础库」分组下显示「合同库」导航项 |
| 点击「合同库」 | 主内容区直接渲染合同库表格，无需经过任何 Modal |
| 激活状态 | 「合同库」`sb-item` 高亮，其他 Tab 取消高亮 |
| 切换到其他 Tab | 激活状态正确跟随，合同库内容被替换 |
| 无 `base_contracts` 权限 | 侧边栏不显示「合同库」导航项 |
| 底部按钮 | 原「基础库配置」入口改为「基础信息配置」，点击直接打开基础信息弹窗 |
| 月份切换 | 切换月份后，若当前在合同库/客户库/供应商库视图，内容正常刷新（或无需刷新，视原有逻辑而定）|
| 原 `openBaseLibModal` | 不报错（函数保留但 deprecated），不再有任何入口主动调用它 |

---

## 注意事项

1. **渲染目标从 Modal 改为 `#main-content`**：Step 3 的核心是把原来写入 Modal 内容区的 `innerHTML` 改写到 `document.getElementById('main-content')`，注意去掉原 Modal 的头部（标题栏、关闭按钮）和外层容器样式，保留表格内容本身。

2. **`lucide.createIcons()` 必须调用**：三个新渲染函数末尾都要调用 `lucide.createIcons()`，否则图标不显示。

3. **月份选择器与基础库的关系**：合同库、客户库、供应商库的数据通常不依赖月份筛选，切换到这些 Tab 时月份选择器可以保持显示（不影响功能），无需隐藏。

4. **`finLogAction` 日志**：基础库的增删改操作原本在弹窗里已有日志记录，迁移到新视图后确认 `finLogAction` 调用链路不受影响（渲染容器变了，但事件处理函数是 `window.xxx` 挂载的，不依赖 DOM 层级）。
