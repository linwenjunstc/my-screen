# TASK-LOGIN-ANIM · 登录页动态视觉升级

> **优先级**：P1  
> **影响文件**：`login.html`（仅此一个文件，所有改动内联）  
> **预计改动量**：中（约 120 行 CSS + JS）  
> **不涉及**：任何业务逻辑、Supabase、登录验证流程

---

## 背景与目标

登录页左侧暗色区域目前只有静态径向渐变装饰，整体偏静态。  
本次新增三层动态视觉元素，在不干扰登录操作的前提下，提升页面的精致感和活跃度。

---

## 三层动态元素设计

| 层级 | 名称 | 实现方式 | 位置 | 性能 |
|------|------|---------|------|------|
| Layer 1 | 浮动光晕球 | 纯 CSS `@keyframes` | 左侧暗色区域 | 极低，无 JS |
| Layer 2 | 粒子连线网络 | Canvas + requestAnimationFrame | 左侧暗色区域叠加 | 低，约 20 粒子 |
| Layer 3 | 登录卡视差跟随 | mousemove 事件 + CSS transform | 右侧登录卡 | 极低，节流处理 |

---

## 实现步骤

### Step 1 · Layer 1：浮动光晕球（CSS）

**在 `login.html` 的 `<style>` 块末尾追加：**

```css
/* TASK-LOGIN-ANIM: Layer 1 — 浮动光晕球 */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  animation: orbFloat linear infinite;
}
.orb-1 {
  width: 280px; height: 280px;
  background: radial-gradient(circle, rgba(37,99,235,.55) 0%, transparent 70%);
  top: 5%; left: -8%;
  animation-duration: 18s;
  animation-delay: 0s;
  opacity: .45;
}
.orb-2 {
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(79,70,229,.5) 0%, transparent 70%);
  top: 45%; left: 15%;
  animation-duration: 24s;
  animation-delay: -8s;
  opacity: .35;
}
.orb-3 {
  width: 160px; height: 160px;
  background: radial-gradient(circle, rgba(14,165,233,.45) 0%, transparent 70%);
  top: 72%; left: -5%;
  animation-duration: 20s;
  animation-delay: -14s;
  opacity: .3;
}

@keyframes orbFloat {
  0%   { transform: translate(0, 0)        scale(1);    }
  25%  { transform: translate(18px, -24px) scale(1.06); }
  50%  { transform: translate(30px,  10px) scale(.96);  }
  75%  { transform: translate(8px,   32px) scale(1.04); }
  100% { transform: translate(0, 0)        scale(1);    }
}

@media (prefers-reduced-motion: reduce) {
  .orb { animation: none; }
}
```

**在 `login.html` 的 `.bg-left` div 内部，`brand-panel` 之前追加三个光晕球 DOM：**

```html
<!-- TASK-LOGIN-ANIM: 光晕球 -->
<div class="orb orb-1"></div>
<div class="orb orb-2"></div>
<div class="orb orb-3"></div>
```

同时确认 `.bg-left` 有以下两个属性（没有则补上）：

```css
.bg-left {
  position: fixed;   /* 或 relative/absolute，原有值保留 */
  overflow: hidden;  /* 必须加，防止光晕溢出容器 */
}
```

---

### Step 2 · Layer 2：粒子连线网络（Canvas）

**在 `.bg-left` 内部，光晕球之后追加 canvas 元素：**

```html
<!-- TASK-LOGIN-ANIM: 粒子 canvas -->
<canvas id="particle-canvas" style="
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  opacity: .7;
"></canvas>
```

**在 `login.html` 的 `</body>` 前追加粒子脚本（放在所有其他 script 之后）：**

```html
<script>
/* TASK-LOGIN-ANIM: Layer 2 — 粒子连线网络 */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const COUNT    = 22;
  const MAX_DIST = 110;
  const SPEED    = 0.28;
  const R        = 1.5;

  let W, H, pts = [];

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = canvas.width  = rect.width;
    H = canvas.height = rect.height;
  }

  function mkPt() {
    return {
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - .5) * SPEED * 2,
      vy: (Math.random() - .5) * SPEED * 2,
    };
  }

  function init() { resize(); pts = Array.from({ length: COUNT }, mkPt); }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }

    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(148,163,184,${((1 - d / MAX_DIST) * .22).toFixed(3)})`;
          ctx.lineWidth = .6;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }

    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(148,163,184,.42)';
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(resize, 150); });

  init();
  draw();
})();
</script>
```

---

### Step 3 · Layer 3：登录卡视差跟随（mousemove）

**紧接上一个 `<script>` 之后追加（或合并进同一 script 块）：**

```html
<script>
/* TASK-LOGIN-ANIM: Layer 3 — 登录卡视差跟随 */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // 选择器优先用 TASK-UI-11 新增的 .login-card-inner
  // 若不存在则回退到登录表单的外层容器，根据实际 DOM 调整
  const card = document.querySelector('.login-card-inner')
             || document.querySelector('.login-box')
             || document.querySelector('form');
  if (!card) return;

  const MAX_TILT  = 3;    // 最大倾斜角度（度）
  const MAX_SHIFT = 5;    // 最大位移（px）
  const EASE      = 0.08; // 缓动系数，越小跟随越滞后

  let tRx = 0, tRy = 0, tTx = 0, tTy = 0;
  let cRx = 0, cRy = 0, cTx = 0, cTy = 0;

  card.style.willChange = 'transform';

  function onMove(e) {
    const nx = (e.clientX / window.innerWidth)  * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    tRx = -ny * MAX_TILT;
    tRy =  nx * MAX_TILT;
    tTx =  nx * MAX_SHIFT;
    tTy =  ny * MAX_SHIFT;
  }

  function onLeave() { tRx = tRy = tTx = tTy = 0; }

  function tick() {
    cRx += (tRx - cRx) * EASE;
    cRy += (tRy - cRy) * EASE;
    cTx += (tTx - cTx) * EASE;
    cTy += (tTy - cTy) * EASE;
    card.style.transform =
      `perspective(900px) rotateX(${cRx.toFixed(3)}deg) rotateY(${cRy.toFixed(3)}deg) translate(${cTx.toFixed(2)}px,${cTy.toFixed(2)}px)`;
    requestAnimationFrame(tick);
  }

  // 节流：≈60fps
  let last = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (now - last < 16) return;
    last = now;
    onMove(e);
  });
  document.addEventListener('mouseleave', onLeave);

  tick();
})();
</script>
```

---

### Step 4 · 确保层叠顺序正确

`.bg-left` 内部 z-index 从下到上：

```
.bg-left  （position: fixed; overflow: hidden）
  ├── .orb-1 / .orb-2 / .orb-3    默认层（z-index 不设）
  ├── #particle-canvas             z-index: 1
  └── .brand-panel                 z-index: 2  ← 确保品牌文字在粒子之上
```

**在 `<style>` 中确认 `.brand-panel` 的定位和层级：**

```css
/* TASK-LOGIN-ANIM: 品牌面板层叠在粒子之上 */
.brand-panel {
  position: relative;
  z-index: 2;
}
```

---

## 验收标准

| 场景 | 预期行为 |
|------|---------|
| 页面加载 | 左侧出现 3 个模糊光晕球缓慢漂浮，动画流畅无卡顿 |
| 粒子网络 | 背景有约 20 个淡色小点缓慢移动，靠近时连细线，颜色极淡不抢眼 |
| 品牌文字 | 光晕和粒子不遮挡 logo、特性说明等文字，层叠顺序正确 |
| 鼠标移动 | 右侧登录卡轻微 3D 倾斜跟随，最大 3°，平滑无抖动 |
| 鼠标离开窗口 | 登录卡缓慢回正，不突变 |
| 输入/点击登录 | 动画不干扰任何表单交互 |
| `prefers-reduced-motion` | 所有动画停止，页面静态展示 |
| 窗口 resize | 粒子 canvas 重适应尺寸，无变形 |

---

## 注意事项

1. **`.bg-left` 必须 `overflow: hidden`**：光晕球用了负数 `left` 值（如 `left: -8%`），不加 `overflow: hidden` 会溢出导致页面出现横向滚动条。

2. **Canvas 尺寸要用 attribute 设置**：`canvas.width = rect.width` 设置的是内部分辨率，CSS 的 `width: 100%` 只控制显示尺寸，两者必须都设置，否则粒子会模糊或偏移。

3. **视差选择器根据实际 DOM 调整**：Step 3 的 `card` 选择器按优先级依次回退，执行时先确认 `.login-card-inner` 是否存在（TASK-UI-11 已新增）。

4. **三层动画互相独立**：每层用 IIFE 包裹，变量不污染全局，与 `doLogin()`、`isRateLimited()` 等验证函数完全隔离，任一层出错不影响其他层和登录功能。

5. **移动端自然降级**：视差跟随依赖 `mousemove`，移动端无鼠标自然不触发。光晕和粒子在移动端正常显示，无需额外处理。
