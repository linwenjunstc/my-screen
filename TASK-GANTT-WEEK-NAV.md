# TASK-GANTT-WEEK-NAV · 甘特图周导航快捷跳转

> **优先级**：P1  
> **影响文件**：`js/pm-views.js`、`css/pm.css`  
> **预计改动量**：小（< 60 行）  
> **不涉及**：数据库、Supabase、任何 JS 状态变量

---

## 背景与目标

甘特图目前只有「今天」定位按钮，用户想查看本周或下周的任务排期时，需要手动横向滚动寻找，体验不流畅。

本次新增「本周」「下周」两个快捷跳转按钮，与现有「今天」按钮并排，点击后平滑滚动甘特图到对应周的周一位置。

---

## 功能描述

### 新增 UI 元素

在甘特图工具栏现有「今天」按钮的**左侧**，插入一个 Segmented Control 分组按钮：

```
[本周]  [下周]    …（原有工具栏内容）…    [今天]
```

- **「本周」**：点击后甘特图横向滚动，使当前自然周的**周一**出现在可视区域左侧（留 16px 边距）
- **「下周」**：点击后甘特图横向滚动，使下一个自然周的**周一**出现在可视区域左侧（留 16px 边距）
- **「今天」**：保留原有行为，不做任何修改
- 滚动方式：`scrollTo({ behavior: 'smooth' })`，有平滑动画

---

## 实现步骤

### Step 1 · 找到工具栏 HTML 插入位置

在 `js/pm-views.js` 中搜索 `今天` 或 `gantt-toolbar`，找到渲染甘特图工具栏的 HTML 模板字符串。

找到「今天」按钮对应的 HTML（形如）：
```html
<button class="..." onclick="ganttScrollToToday()">今天</button>
```

在该按钮**前面**（同一个工具栏容器内）插入以下 HTML：
```html
<div class="gantt-week-group">
  <button class="gantt-week-btn" onclick="ganttJumpToWeek(0)">本周</button>
  <button class="gantt-week-btn" onclick="ganttJumpToWeek(1)">下周</button>
</div>
```

---

### Step 2 · 新增跳转函数

在 `js/pm-views.js` 文件底部（所有其他函数之后）追加以下函数：

```javascript
/* TASK-GANTT-WEEK-NAV */
window.ganttJumpToWeek = function(offsetWeeks) {
  const minDate = window._ganttMinDate;
  if (!minDate) return;

  // 计算目标周的周一（本地时间，避免 UTC 偏移）
  const today = new Date();
  const dayOfWeek = today.getDay() || 7; // 将周日的 0 转为 7，使周一=1
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1 + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);

  // 计算距甘特图起始日的天数偏移
  const minDateNorm = new Date(minDate);
  minDateNorm.setHours(0, 0, 0, 0);
  const diffDays = Math.round((monday - minDateNorm) / 86400000);

  // 计算滚动位置（ganttDayW 为每天像素宽度，全局变量）
  const scrollLeft = diffDays * ganttDayW - 16;

  // 找到甘特图横向滚动容器并滚动
  const rightCol = document.querySelector('#gantt-right-col');
  if (rightCol) {
    rightCol.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
  }
};
```

**依赖的全局变量**（已存在，无需新增）：
- `window._ganttMinDate`：甘特图最小日期，在 `renderGantt()` 中设置
- `ganttDayW`：每天像素宽度，全局变量

**滚动容器 ID 确认**：函数中使用 `#gantt-right-col`，执行前请在 `pm-views.js` 中搜索确认甘特图横向滚动容器的实际 ID，如果不是 `gantt-right-col` 则替换为正确的 ID。

---

### Step 3 · 新增 CSS 样式

在 `css/pm.css` 中，找到甘特图相关样式区域（搜索 `gantt`），在该区域末尾追加：

```css
/* TASK-GANTT-WEEK-NAV */
.gantt-week-group {
  display: inline-flex;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}
.gantt-week-btn {
  padding: 4px 12px;
  border-radius: 4px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
  cursor: pointer;
  font-family: var(--font);
  transition: background .12s, color .12s;
  white-space: nowrap;
}
.gantt-week-btn:hover {
  background: var(--surface);
  color: var(--text);
}
.gantt-week-btn:active {
  transform: scale(.96);
}
```

---

## 验收标准

| 场景 | 预期行为 |
|------|---------|
| 点击「本周」 | 甘特图平滑滚动，当前周周一出现在可视区域左侧 |
| 点击「下周」 | 甘特图平滑滚动，下周周一出现在可视区域左侧 |
| 本周周一已在视口左边界时点击「本周」 | 无明显变化（滚动位置已正确）|
| 甘特图最小日期晚于本周 | 「本周」点击后滚动到 position 0（`Math.max(0, scrollLeft)` 保护） |
| 「今天」按钮 | 行为与改动前完全一致，不受影响 |
| 暗色主题 | 按钮样式使用 CSS 变量，自动适配，无需额外处理 |

---

## 注意事项

1. **不修改 `ganttScrollToToday()` 函数**：「今天」按钮的逻辑完全保留，本次只是新增两个按钮。
2. **`_ganttMinDate` 可能为 `undefined`**：函数首行已做 `if (!minDate) return` 保护，甘特图未渲染时点击按钮不会报错。
3. **周起始日为周一**：使用 `getDay() || 7` 将周日的 `0` 转为 `7`，确保周一为每周第一天，与甘特图现有渲染逻辑一致。
4. **不使用 `toISOString()`**：日期计算全程使用本地时间方法，避免中国时区 UTC+8 导致的日期偏移（与项目已有约定一致）。
