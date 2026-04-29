/* ════════════════════════════════════════════════
 * pm-views.js  —  今日看板 / 任务列表 / 项目视图 / 图表 / 甘特图
 * ════════════════════════════════════════════════ */

function renderToday() {
  document.getElementById('header-title').textContent = '今日看板';
  const now = new Date();
  document.getElementById('header-sub').textContent = now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});

  const active = state.tasks.filter(t=>!t.done);
  const done = state.tasks.filter(t=>t.done);
  const g0 = active.filter(t=>urgencyOf(t)===0).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));
  const g1 = active.filter(t=>urgencyOf(t)===1).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));
  const g2 = active.filter(t=>urgencyOf(t)===2).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));
  const g3 = active.filter(t=>urgencyOf(t)===3).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));

  let html = `<div class="view-pane">
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">紧急 / 逾期</div><div class="stat-val${g0.length?' red':''}">${g0.length}</div></div>
      <div class="stat-card"><div class="stat-label">3 天内到期</div><div class="stat-val${g1.length?' amber':''}">${g1.length}</div></div>
      <div class="stat-card"><div class="stat-label">本周内</div><div class="stat-val">${g2.length}</div></div>
      <div class="stat-card"><div class="stat-label">今日已完成</div><div class="stat-val${done.length?' green':''}">${done.length}</div></div>
    </div>`;

  // Project progress mini chart
  if (state.projects.length) {
    html += `<div class="today-proj-section">
      <div class="today-proj-title">项目完成进度</div>
      <div class="proj-progress-list">`;
    state.projects.forEach(p => {
      const tasks = state.tasks.filter(t=>t.projectId===p.id);
      const doneCnt = tasks.filter(t=>t.done).length;
      const pct = tasks.length ? Math.round(doneCnt/tasks.length*100) : 0;
      const color = PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length];
      html += `<div class="proj-progress-row">
        <div class="proj-progress-label">
          <span class="proj-progress-name" style="cursor:pointer" onclick="switchView('project-${p.id}')">${p.name}</span>
          <span class="proj-progress-pct">${doneCnt}/${tasks.length} · ${pct}%</span>
        </div>
        <div class="proj-progress-track">
          <div class="proj-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
    });
    html += '</div></div>';
  }

  // ── Assignee section ──────────────────────────────────────────────────
  if (state.members.length) {
    html += `<div class="today-proj-section" style="margin-bottom:24px">
      <div class="today-proj-title">负责人任务概览</div>
      <div style="display:flex;flex-direction:column;gap:14px">`;
    state.members.forEach(m => {
      const myTasks = active.filter(t=>t.assignee===m.id);
      if (!myTasks.length) return;
      const urgentCnt = myTasks.filter(t=>urgencyOf(t)<=1).length;
      const color = memberColor(m.id);
      html += `<div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div class="member-avatar" style="background:${color};width:24px;height:24px;font-size:11px">${memberInitial(m.id)}</div>
          <span style="font-size:13px;font-weight:600;color:var(--text)">${m.name}</span>
          <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${myTasks.length} 个任务${urgentCnt?` · <span style="color:var(--red)">${urgentCnt} 紧急</span>`:''}   </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${myTasks.slice(0,4).map(t=>{
            const di=dueInfo(t), si=statusInfo(t.status);
            const priCls=t.priority==='紧急'?'pill-red':t.priority==='重要'?'pill-amber':'pill-gray';
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:background .12s" onclick="openEditTask('${t.id}')" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='var(--surface)'">
              <div style="flex:1;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title}</div>
              <span class="pill ${di.cls}" style="font-size:10px">${di.text}</span>
              <span class="pill ${priCls}" style="font-size:10px">${t.priority}</span>
              <span class="pill ${si.cls}" style="font-size:10px">${si.lbl}</span>
            </div>`;
          }).join('')}
          ${myTasks.length>4?`<div style="font-size:12px;color:var(--text3);padding:4px 12px">还有 ${myTasks.length-4} 个任务...</div>`:''}
        </div>
      </div>`;
    });
    html += '</div></div>';
  }

  const groups = [
    {tasks:g0,dot:'#d94f3d',label:'紧急 / 逾期'},
    {tasks:g1,dot:'#b87333',label:'3 天内'},
    {tasks:g2,dot:'#2e7d52',label:'本周内'},
    {tasks:g3,dot:'#a09e98',label:'较远'},
    {tasks:done,dot:'#c0c0b8',label:'已完成'},
  ];
  let anyTask = false;
  groups.forEach(g => {
    if (!g.tasks.length) return; anyTask = true;
    html += `<div class="task-group"><div class="group-header"><div class="group-dot" style="background:${g.dot}"></div><span class="group-title">${g.label}</span><span class="group-count">${g.tasks.length}</span></div>${g.tasks.map(t=>taskCardHTML(t)).join('')}</div>`;
  });
  if (!anyTask) html += `<div class="empty-state"><div class="empty-icon">✓</div>今天没有待推进的任务<div class="empty-hint">点击左下角快速添加</div></div>`;
  html += '</div>';
  document.getElementById('main-content').innerHTML = html;
}

// ─── Task List ────────────────────────────────────────────────────────────────
function renderTaskList() {
  document.getElementById('header-title').textContent = '全部任务';
  document.getElementById('header-sub').textContent = `共 ${state.tasks.length} 个任务`;

  let tasks = state.tasks.filter(t => {
    if (filterProject!=='all' && t.projectId!==filterProject) return false;
    if (filterStatus!=='all' && t.status!==filterStatus) return false;
    if (filterAssignee!=='all' && t.assignee!==filterAssignee) return false;
    if (searchQuery && !t.title.includes(searchQuery)) return false;
    return true;
  }).sort((a,b) => urgencyOf(a)-urgencyOf(b) || priorityOrder(a.priority)-priorityOrder(b.priority));

  const projChips = state.projects.map(p=>
    `<span class="filter-chip${filterProject===p.id?' on':''}" onclick="filterProject='${p.id}';filterStatus='all';renderTaskList()">${p.name}</span>`
  ).join('');
  const statusChips = [['all','全部'],['todo','待启动'],['doing','进行中'],['waiting','待反馈'],['done','已完成']].map(([v,l])=>
    `<span class="filter-chip${filterStatus===v?' on':''}" onclick="filterStatus='${v}';renderTaskList()">${l}</span>`
  ).join('');
  const assigneeChips = state.members.map(m=>`<span class="filter-chip${filterAssignee===m.id?' on':''}" onclick="filterAssignee='${m.id}';renderTaskList()" style="${filterAssignee===m.id?'':''}">
    <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:50%;background:${memberColor(m.id)};display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:#fff;flex-shrink:0">${memberInitial(m.id)}</span>${m.name}</span>
  </span>`).join('');

  let html = `<div class="view-pane">
    <div class="filter-bar"><span class="filter-chip${filterProject==='all'?' on':''}" onclick="filterProject='all';renderTaskList()">全部项目</span>${projChips}</div>
    <div class="filter-bar" style="margin-top:-12px">${statusChips}</div>
    <div class="filter-bar" style="margin-top:-12px"><span class="filter-chip${filterAssignee==='all'?' on':''}" onclick="filterAssignee='all';renderTaskList()">全部成员</span>${assigneeChips}</div>
    ${tasks.length ? tasks.map(t=>taskCardHTML(t)).join('') : '<div class="empty-state"><div class="empty-icon">○</div>没有匹配的任务</div>'}
  </div>`;
  document.getElementById('main-content').innerHTML = html;
}

// ─── Projects ────────────────────────────────────────────────────────────────
function renderProjects() {
  document.getElementById('header-title').textContent = '项目';
  document.getElementById('header-sub').textContent = `${state.projects.length} 个项目`;
  let html = '<div class="view-pane"><div class="projects-grid">';
  state.projects.forEach(p => {
    const tasks=state.tasks.filter(t=>t.projectId===p.id);
    const doneCnt=tasks.filter(t=>t.done).length;
    const pct=tasks.length?Math.round(doneCnt/tasks.length*100):0;
    const sc={todo:0,doing:0,waiting:0,done:0};
    tasks.forEach(t=>sc[t.status]=(sc[t.status]||0)+1);
    const color = PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length];
    const memberAvatars = (p.members||[]).slice(0,4).map(mid=>`<div class="member-avatar" style="background:${memberColor(mid)}" title="${memberName(mid)}">${memberInitial(mid)}</div>`).join('');
    html += `<div class="project-card" onclick="switchView('project-${p.id}')">
      <div class="proj-header">
        <div><div class="proj-name" style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;background:${color};border-radius:50%;display:inline-block;flex-shrink:0"></span>${p.name}</div></div>
        <div class="proj-actions" onclick="event.stopPropagation()">
          <button class="icon-btn" onclick="openEditProject('${p.id}')" title="编辑">✎</button>
          <button class="icon-btn" onclick="confirmDeleteProject('${p.id}')" title="删除">✕</button>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="proj-stats">
        <div class="proj-stat"><strong>${tasks.length}</strong> 任务</div>
        <div class="proj-stat"><strong>${doneCnt}</strong> 完成</div>
        <div class="proj-stat"><strong>${pct}%</strong></div>
      </div>
      <div class="proj-badges">
        ${sc.doing?`<span class="pill pill-blue">${sc.doing} 进行中</span>`:''}
        ${sc.waiting?`<span class="pill pill-amber">${sc.waiting} 待反馈</span>`:''}
        ${sc.todo?`<span class="pill pill-gray">${sc.todo} 待启动</span>`:''}
      </div>
      ${memberAvatars?`<div style="display:flex;gap:4px;margin-top:12px">${memberAvatars}</div>`:''}
    </div>`;
  });
  if (!state.projects.length) html += '<div class="empty-state"><div class="empty-icon">◻</div>还没有项目</div>';
  html += '</div></div>';
  document.getElementById('main-content').innerHTML = html;
}

// ─── Single Project ───────────────────────────────────────────────────────────
function renderProjectView(pid) {
  const proj = state.projects.find(p=>p.id===pid);
  if (!proj) { switchView('today'); return; }
  document.getElementById('header-title').textContent = proj.name;
  const tasks = state.tasks.filter(t=>t.projectId===pid);
  const done = tasks.filter(t=>t.done).length;
  const pct = tasks.length?Math.round(done/tasks.length*100):0;
  document.getElementById('header-sub').textContent = `${tasks.length} 个任务 · 完成 ${pct}%`;
  document.getElementById('header-add-btn').style.display = 'block';

  const color = PROJ_COLORS[(proj.colorIdx||0)%PROJ_COLORS.length];
  const memberAvatars = (proj.members||[]).map(mid=>`<div class="member-avatar" style="background:${memberColor(mid)}" title="${memberName(mid)}">${memberInitial(mid)}</div>`).join('');

  let html = `<div class="view-pane">
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 22px;margin-bottom:22px;box-shadow:var(--shadow)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:13px;color:var(--text2)">完成进度 · ${done} / ${tasks.length}</div>
          ${memberAvatars?`<div style="display:flex;gap:4px;margin-left:8px">${memberAvatars}</div>`:''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openEditProject('${pid}')">✎ 编辑项目</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteProject('${pid}')">✕ 删除</button>
        </div>
      </div>
      <div class="progress-track" style="height:7px"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;

  const active = tasks.filter(t=>!t.done).sort((a,b)=>urgencyOf(a)-urgencyOf(b)||priorityOrder(a.priority)-priorityOrder(b.priority));
  const doneT = tasks.filter(t=>t.done);
  if (active.length) html += active.map(t=>taskCardHTML(t)).join('');
  if (doneT.length) html += `<div class="task-group" style="margin-top:20px"><div class="group-header"><div class="group-dot" style="background:#c0c0b8"></div><span class="group-title">已完成</span><span class="group-count">${doneT.length}</span></div>${doneT.map(t=>taskCardHTML(t)).join('')}</div>`;
  if (!tasks.length) html += '<div class="empty-state"><div class="empty-icon">○</div>这个项目还没有任务<div class="empty-hint">点击右上角新建任务</div></div>';
  html += '</div>';
  document.getElementById('main-content').innerHTML = html;
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts() {
  document.getElementById('header-title').textContent = '图表分析';
  document.getElementById('header-sub').textContent = '任务状态分布 · 项目进度 · 燃尽图';

  const total = state.tasks.length;
  const statusCount = {todo:0,doing:0,waiting:0,done:0};
  state.tasks.forEach(t => statusCount[t.status]=(statusCount[t.status]||0)+1);

  const donutData = [
    {label:'待启动',count:statusCount.todo,color:'#d0cfc8'},
    {label:'进行中',count:statusCount.doing,color:'#2563a8'},
    {label:'待反馈',count:statusCount.waiting,color:'#b87333'},
    {label:'已完成',count:statusCount.done,color:'#2e7d52'},
  ];

  const donutSVG = buildDonutSVG(donutData, total);

  // Project completion bars
  let projBarsHTML = '<div class="proj-progress-list">';
  if (!state.projects.length) {
    projBarsHTML += '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">暂无项目</div>';
  } else {
    state.projects.forEach(p => {
      const tasks = state.tasks.filter(t=>t.projectId===p.id);
      const doneCnt = tasks.filter(t=>t.done).length;
      const pct = tasks.length?Math.round(doneCnt/tasks.length*100):0;
      const color = PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length];
      projBarsHTML += `<div class="proj-progress-row">
        <div class="proj-progress-label">
          <span class="proj-progress-name">${p.name}</span>
          <span class="proj-progress-pct">${doneCnt}/${tasks.length} · ${pct}%</span>
        </div>
        <div class="proj-progress-track" style="height:10px">
          <div class="proj-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
    });
  }
  projBarsHTML += '</div>';

  // Burndown selector
  const burndownOpts = `<option value="all">全部项目</option>` +
    state.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');

  let html = `<div class="view-pane">
    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-title">任务状态分布
          <span style="font-size:11px;font-weight:400;color:var(--text3)">共 ${total} 个</span>
        </div>
        <div style="display:flex;align-items:center;gap:24px">
          <div style="flex-shrink:0">${donutSVG}</div>
          <div class="chart-legend" style="flex-direction:column;gap:8px">
            ${donutData.map(d=>`<div class="legend-item"><div class="legend-dot" style="background:${d.color}"></div><span style="font-size:13px">${d.label}</span><span style="font-family:var(--mono);font-size:13px;color:var(--text);font-weight:600;margin-left:auto">${d.count}</span></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">项目完成进度</div>
        ${projBarsHTML}
      </div>

      <div class="chart-card full">
        <div class="chart-title">
          项目燃尽图
          <select class="burndown-select" id="burndown-proj-select" onchange="updateBurndownChart(this.value)">${burndownOpts}</select>
        </div>
        <div id="burndown-chart-area">${buildBurndownSVG('all')}</div>
      </div>
    </div>
  </div>`;
  document.getElementById('main-content').innerHTML = html;
}

function updateBurndownChart(projId) {
  document.getElementById('burndown-chart-area').innerHTML = buildBurndownSVG(projId);
}

function buildDonutSVG(data, total) {
  const cx=90,cy=90,r=72,ir=46;
  let svg = `<svg width="180" height="180" viewBox="0 0 180 180">`;
  if (total===0) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f0efe9"/><circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#a09e98" font-size="13">暂无数据</text>`;
  } else {
    let sa = -Math.PI/2;
    data.forEach(d => {
      if (!d.count) return;
      const angle=(d.count/total)*2*Math.PI, ea=sa+angle;
      const x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa);
      const x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);
      const xi1=cx+ir*Math.cos(ea),yi1=cy+ir*Math.sin(ea);
      const xi2=cx+ir*Math.cos(sa),yi2=cy+ir*Math.sin(sa);
      const large=angle>Math.PI?1:0;
      svg += `<path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi1},${yi1} A${ir},${ir} 0 ${large},0 ${xi2},${yi2} Z" fill="${d.color}"/>`;
      sa=ea;
    });
    const activeCnt = total - (data.find(d=>d.label==='已完成')||{count:0}).count;
    svg += `<text x="${cx}" y="${cy-9}" text-anchor="middle" fill="#1a1916" font-size="22" font-weight="600" font-family="DM Mono, monospace">${activeCnt}</text>
            <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="#a09e98" font-size="11">进行中</text>`;
  }
  return svg+'</svg>';
}

function buildBurndownSVG(projId) {
  const log = state.burndownLog[projId] || [];
  const W=680, H=200, padL=44, padR=20, padT=16, padB=36;
  const chartW=W-padL-padR, chartH=H-padT-padB;

  if (log.length < 2) {
    // Not enough data - show placeholder
    let totalTasks = projId==='all' ? state.tasks.filter(t=>!t.done).length : state.tasks.filter(t=>t.projectId===projId&&!t.done).length;
    return `<div style="display:flex;align-items:center;justify-content:center;height:120px;color:var(--text3);font-size:13px;flex-direction:column;gap:6px">
      <div>当前剩余任务：<strong style="color:var(--text);font-family:var(--mono)">${totalTasks}</strong> 个</div>
      <div style="font-size:11px">数据将在多日使用后逐渐积累并展示趋势图</div>
    </div>`;
  }

  const maxVal = Math.max(...log.map(l=>l.remaining), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const toX = (i) => padL + (i/(log.length-1))*chartW;
  const toY = (v) => padT + (1 - (v-minVal)/range)*chartH;

  let pointsStr = log.map((l,i) => `${toX(i)},${toY(l.remaining)}`).join(' ');
  // Fill area
  const areaPath = `M${toX(0)},${toY(log[0].remaining)} ` +
    log.map((l,i)=>`L${toX(i)},${toY(l.remaining)}`).join(' ') +
    ` L${toX(log.length-1)},${padT+chartH} L${toX(0)},${padT+chartH} Z`;

  // Y grid lines
  const yTicks = 4;
  let gridLines = '', yLabels = '';
  for (let i=0; i<=yTicks; i++) {
    const v = Math.round(minVal + (range*i/yTicks));
    const y = toY(v);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#e2e0d8" stroke-width="1"/>`;
    yLabels += `<text x="${padL-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#a09e98" font-size="11">${v}</text>`;
  }

  // X date labels (show first, middle, last)
  let xLabels = '';
  const xLabelIdxs = [0, Math.floor((log.length-1)/2), log.length-1];
  xLabelIdxs.forEach(i => {
    if (i < log.length) xLabels += `<text x="${toX(i)}" y="${padT+chartH+18}" text-anchor="middle" fill="#a09e98" font-size="11">${log[i].date.slice(5)}</text>`;
  });

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">
    ${gridLines}
    <path d="${areaPath}" fill="#2563a8" opacity="0.08"/>
    <polyline points="${pointsStr}" fill="none" stroke="#2563a8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${log.map((l,i)=>`<circle cx="${toX(i)}" cy="${toY(l.remaining)}" r="3.5" fill="#2563a8"/>`).join('')}
    ${yLabels}${xLabels}
    <text x="${padL}" y="${padT-4}" fill="#a09e98" font-size="10">剩余任务数</text>
  </svg>`;
}

// ─── Gantt ────────────────────────────────────────────────────────────────────
let ganttDayW = 30;

function renderGantt() {
  document.getElementById('header-title').textContent = '甘特图';
  document.getElementById('header-sub').textContent = '任务时间线视图';

  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().slice(0,10);

  // Compute date range: from earliest task start (or -14 days) to latest due (+14 days)
  let minDate = new Date(today); minDate.setDate(minDate.getDate()-14);
  let maxDate = new Date(today); maxDate.setDate(maxDate.getDate()+30);
  state.tasks.forEach(t => {
    if (t.due) { const d=new Date(t.due); if(d>maxDate) maxDate=new Date(d); }
    if (t.createdAt) { const d=new Date(t.createdAt); if(d<minDate) minDate=new Date(d); }
  });
  maxDate.setDate(maxDate.getDate()+7);
  minDate.setDate(minDate.getDate()-3);

  const totalDays = Math.round((maxDate-minDate)/86400000)+1;
  const chartWidth = totalDays * ganttDayW;
  const todayOffset = Math.round((today-minDate)/86400000);

  // Build date header
  let dateHeaderHTML = '';
  // Month markers
  let prev = '';
  for (let i=0; i<totalDays; i++) {
    const d = new Date(minDate); d.setDate(d.getDate()+i);
    const m = d.toLocaleDateString('zh-CN',{month:'short'});
    if (m !== prev) {
      dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW}px;top:0;bottom:0;display:flex;align-items:center;padding-left:6px;font-size:10px;color:var(--text3);font-weight:600;white-space:nowrap;pointer-events:none">${m}</div>`;
      prev=m;
    }
    // Day number every 7 days
    if (i%7===0) {
      dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW+2}px;top:20px;font-size:9px;color:var(--text3);white-space:nowrap">${d.getDate()}</div>`;
    }
  }
  // Today marker
  dateHeaderHTML += `<div style="position:absolute;left:${todayOffset*ganttDayW}px;top:0;width:${ganttDayW}px;bottom:-9999px;background:rgba(37,99,168,.07);pointer-events:none"></div>`;
  dateHeaderHTML += `<div style="position:absolute;left:${todayOffset*ganttDayW+ganttDayW/2}px;top:0;bottom:-9999px;border-left:2px dashed #2563a8;pointer-events:none"></div>`;
  dateHeaderHTML += `<div style="position:absolute;left:${todayOffset*ganttDayW+1}px;top:2px;background:#2563a8;color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;white-space:nowrap">今</div>`;

  // Grid lines every 7 days
  for (let i=0; i<totalDays; i+=7) {
    dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW}px;top:0;bottom:-9999px;border-left:1px solid var(--border);pointer-events:none"></div>`;
  }

  // Build rows grouped by project
  let leftHTML = '<div class="gantt-name-header">任务名称</div>';
  let rightHTML = `<div class="gantt-header-row" style="position:relative;width:${chartWidth}px">${dateHeaderHTML}</div>`;

  const groups = state.projects.map(p=>({proj:p, tasks:state.tasks.filter(t=>t.projectId===p.id)}));
  const uncat = state.tasks.filter(t=>!t.projectId);
  if (uncat.length) groups.push({proj:{id:'',name:'未分类',colorIdx:8}, tasks:uncat});

  groups.forEach(g => {
    if (!g.tasks.length) return;
    const color = PROJ_COLORS[(g.proj.colorIdx||0)%PROJ_COLORS.length];
    leftHTML += `<div class="gantt-group-header" style="border-left:3px solid ${color}">${g.proj.name}</div>`;
    rightHTML += `<div class="gantt-group-header-right" style="width:${chartWidth}px"></div>`;

    g.tasks.forEach(t => {
      const startD = t.createdAt ? new Date(t.createdAt) : (() => { const d=new Date(t.due); d.setDate(d.getDate()-5); return d; })();
      const endD = new Date(t.due);
      startD.setHours(0,0,0,0); endD.setHours(0,0,0,0);
      const startOffset = Math.round((startD-minDate)/86400000);
      const durDays = Math.max(1, Math.round((endD-startD)/86400000)+1);
      const left = Math.max(0, startOffset)*ganttDayW;
      const width = Math.max(ganttDayW-4, durDays*ganttDayW-4);
      const barColor = t.done ? '#c0c0b8' : color;
      const isOverdue = !t.done && new Date(t.due)<today;
      const blocked = isBlocked(t);

      leftHTML += `<div class="gantt-row-name${t.done?' done-row':''}${t.milestone?' milestone-row':''}" onclick="openEditTask('${t.id}')" title="${t.title}">${t.milestone?'◆ ':''}${blocked?'⚠ ':''}${t.title}</div>`;
      rightHTML += `<div style="position:relative;height:44px;border-bottom:1px solid var(--border);width:${chartWidth}px;background:${t.done?'transparent':'var(--surface)'}">
        <div title="${t.title}" onclick="openEditTask('${t.id}')" style="position:absolute;top:10px;left:${left}px;width:${width}px;height:24px;background:${barColor};opacity:${t.done?.5:1};border-radius:${t.milestone?'3px':'5px'};cursor:pointer;display:flex;align-items:center;padding:0 8px;overflow:hidden;transition:opacity .15s;${isOverdue?'outline:1.5px solid var(--red);':''}${t.milestone?'outline:2px solid '+barColor+';outline-offset:2px;':''} " onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='${t.done?.5:1}'">
          <span style="font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">${t.milestone?'◆ ':''}${t.title}</span>
        </div>
        ${t.milestone?`<div style="position:absolute;left:${left+width}px;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:12px;height:12px;background:var(--amber);border:2px solid #fff;box-shadow:0 0 0 1.5px var(--amber);pointer-events:none;z-index:2"></div>`:''}
        ${t.due===todayStr?`<div style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--red);font-weight:600">今</div>`:''}
      </div>`;
    });
  });

  if (!state.tasks.length) {
    leftHTML += '<div class="empty-state" style="padding:40px 16px">暂无任务</div>';
  }

  const html = `<div class="view-pane">
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
      <span style="font-size:12px;color:var(--text3)">缩放：</span>
      <button class="btn btn-ghost btn-sm" onclick="setGanttZoom(20)">小</button>
      <button class="btn btn-ghost btn-sm" onclick="setGanttZoom(30)">中</button>
      <button class="btn btn-ghost btn-sm" onclick="setGanttZoom(44)">大</button>
    </div>
    <div class="gantt-wrap" id="gantt-wrap">
      <div class="gantt-inner">
        <div class="gantt-left" id="gantt-left-col">${leftHTML}</div>
        <div style="flex:1;overflow-x:auto" id="gantt-right-scroll">
          <div style="min-width:${chartWidth}px" id="gantt-right-col">${rightHTML}</div>
        </div>
      </div>
    </div>
  </div>`;
  document.getElementById('main-content').innerHTML = html;
  ganttScrollToday();
}

function setGanttZoom(w) {
  ganttDayW = w;
  renderGantt();
}

function ganttScrollToday() {
  const sc = document.getElementById('gantt-right-scroll');
  if (!sc) return;
  const today = new Date(); today.setHours(0,0,0,0);
  // Scroll to show today minus some padding
  const wrap = document.getElementById('gantt-wrap');
  if (!wrap) return;
  // Calculate approximate scroll position
  sc.scrollLeft = Math.max(0, sc.scrollLeft + (sc.querySelector('[style*="border-left:2px dashed"]') ? 0 : 300));
  // Better: find the today line element
  setTimeout(()=>{
    const todayLine = document.querySelector('[style*="border-left:2px dashed #2563a8"]');
    if (todayLine && sc) {
      const parent = sc.getBoundingClientRect();
      sc.scrollLeft = Math.max(0, (parseInt(todayLine.style.left)||0) - parent.width/3);
    }
  }, 50);
}

// ─── Task Card ────────────────────────────────────────────────────────────────
