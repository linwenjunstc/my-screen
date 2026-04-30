/* ════════════════════════════════════════════════
 * pm-views.js  —  今日看板 / 任务列表 / 项目视图 / 图表 / 甘特图
 * ════════════════════════════════════════════════ */

function renderToday() {
  document.getElementById('header-title').textContent = '今日看板';
  const now = new Date();
  document.getElementById('header-sub').textContent = now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});

  const todayStr = new Date().toISOString().slice(0,10);
  const active = state.tasks.filter(t=>!t.done);
  const done = state.tasks.filter(t => {
    if (!t.done) return false;
    if (t.completedAt) return t.completedAt.slice(0,10) === todayStr;
    if (t.updated_at) return t.updated_at.slice(0,10) === todayStr;
    return false;
  });
  const g0 = active.filter(t=>urgencyOf(t)===0).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));
  const g1 = active.filter(t=>urgencyOf(t)===1).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));
  const g2 = active.filter(t=>urgencyOf(t)===2).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));
  const g3 = active.filter(t=>urgencyOf(t)===3).sort((a,b)=>priorityOrder(a.priority)-priorityOrder(b.priority));

  let html = `<div class="view-pane">
    <div class="stats-grid">
      <div class="stat-card" style="cursor:${g0.length?'pointer':'default'}" ${g0.length?`onclick="showDashboardTaskList('g0')"`:''}><div class="stat-label">紧急 / 逾期</div><div class="stat-val${g0.length?' red':''}">${g0.length}</div></div>
      <div class="stat-card" style="cursor:${g1.length?'pointer':'default'}" ${g1.length?`onclick="showDashboardTaskList('g1')"`:''}><div class="stat-label">3 天内到期</div><div class="stat-val${g1.length?' amber':''}">${g1.length}</div></div>
      <div class="stat-card" style="cursor:${g2.length?'pointer':'default'}" ${g2.length?`onclick="showDashboardTaskList('g2')"`:''}><div class="stat-label">本周内</div><div class="stat-val">${g2.length}</div></div>
      <div class="stat-card" style="cursor:${done.length?'pointer':'default'}" ${done.length?`onclick="showDashboardTaskList('done')"`:''}><div class="stat-label">今日已完成</div><div class="stat-val${done.length?' green':''}">${done.length}</div><div class="stat-sub" style="font-size:10px">今天标记完成的任务</div></div>
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
    {tasks:g0,dot:'#e74c3c',label:'紧急 / 逾期'},
    {tasks:g1,dot:'#d4842a',label:'3 天内'},
    {tasks:g2,dot:'#27ae60',label:'本周内'},
    {tasks:g3,dot:'#a8a59e',label:'较远'},
    {tasks:done,dot:'#b8b5ae',label:'已完成'},
  ];
  let anyTask = false;
  groups.forEach(g => {
    if (!g.tasks.length) return; anyTask = true;
    html += `<div class="task-group"><div class="group-header"><div class="group-dot" style="background:${g.dot}"></div><span class="group-title">${g.label}</span><span class="group-count">${g.tasks.length}</span></div>${g.tasks.map(t=>taskCardHTML(t)).join('')}</div>`;
  });
  if (!anyTask) html += `<div class="empty-state"><i data-lucide="check" class="empty-icon"></i>今天没有待推进的任务<div class="empty-hint">一切尽在掌握</div><div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddTask()"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建任务</button></div></div>`;
  html += '</div>';
  document.getElementById('main-content').innerHTML = html;

  // Store groups for dashboard clickable metrics
  window._dashboardGroups = { g0, g1, g2, done };
}

// ─── Dashboard clickable metrics ──────────────────────────────────────────────
function showDashboardTaskList(groupKey) {
  const groups = window._dashboardGroups || {};
  const tasks = groups[groupKey] || [];
  const labels = { g0: '紧急 / 逾期', g1: '3 天内到期', g2: '本周内', done: '今日已完成' };
  const label = labels[groupKey] || '任务列表';

  const rows = tasks.map(t => {
    const di = dueInfo(t);
    const si = statusInfo(t.status);
    const pn = projName(t.projectId);
    return `<div class="task-card" style="cursor:default" onclick="closeModal();openEditTask('${t.id}')">
      <div class="task-body">
        <div class="task-title">${t.title}</div>
        <div class="task-meta">
          <span class="pill pill-project">${pn}</span>
          <span class="pill ${di.cls}">${di.text}</span>
          <span class="pill ${si.cls}">${si.lbl}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  openModal(modalHeader(label) + `<div class="modal-body" style="max-height:60vh;overflow-y:auto">${rows||'<div class="empty-state">暂无任务</div>'}</div>
    <div class="modal-footer"><div><span style="font-size:12px;color:var(--text3)">共 ${tasks.length} 个任务</span></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

// ─── Task List ────────────────────────────────────────────────────────────────
function renderTaskList() {
  document.getElementById('header-title').textContent = '全部任务';
  document.getElementById('header-sub').textContent = `共 ${state.tasks.length} 个任务`;

  // 持久化当前筛选条件
  try {
    localStorage.setItem('pm_task_filters', JSON.stringify({
      filterProject, filterStatus, filterAssignee
    }));
  } catch(e) {}

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
    ${(filterProject!=='all' || filterStatus!=='all' || filterAssignee!=='all') ? `<div style="margin-top:-8px;margin-bottom:4px"><button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--text3)" onclick="filterProject='all';filterStatus='all';filterAssignee='all';localStorage.removeItem('pm_task_filters');renderTaskList()">✕ 清除所有筛选</button></div>` : ''}
    ${tasks.length ? tasks.map(t=>taskCardHTML(t)).join('') : '<div class="empty-state"><i data-lucide="search" class="empty-icon"></i>没有匹配的任务<div class="empty-hint">试试调整筛选条件</div></div>'}
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
    html += `<div class="project-card stagger-in" onclick="switchView('project-${p.id}')">
      <div class="proj-header">
        <div><div class="proj-name" style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;background:${color};border-radius:50%;display:inline-block;flex-shrink:0"></span>${p.name}</div></div>
        <div class="proj-actions" onclick="event.stopPropagation()">
          <button class="icon-btn" onclick="openEditProject('${p.id}')" title="编辑"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
          <button class="icon-btn" onclick="confirmDeleteProject('${p.id}')" title="删除"><i data-lucide="x" style="width:13px;height:13px"></i></button>
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
  if (!state.projects.length) html += '<div class="empty-state"><i data-lucide="folder-open" class="empty-icon"></i>还没有项目<div class="empty-hint">创建项目来组织你的任务</div><div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddProject()"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建项目</button></div></div>';
  html += '</div></div>';
  document.getElementById('main-content').innerHTML = html;
}

// ─── Single Project ───────────────────────────────────────────────────────────
function renderProjectView(pid) {
  const proj = state.projects.find(p=>p.id===pid);
  if (!proj) { switchView('today'); return; }
  const tasks = state.tasks.filter(t=>t.projectId===pid);
  const mode = projectViewMode[pid] || 'list';
  const color = PROJ_COLORS[(proj.colorIdx||0)%PROJ_COLORS.length];
  const doneCnt = tasks.filter(t=>t.done).length;
  const pct = tasks.length ? Math.round(doneCnt/tasks.length*100) : 0;

  document.getElementById('header-title').textContent = '项目详情';
  document.getElementById('header-sub').textContent = `${proj.name} · ${tasks.length} 个任务 · ${pct}% 完成`;
  document.getElementById('header-add-btn').style.display = 'block';

  const memberAvatars = (proj.members||[]).map(mid=>`<div class="member-avatar" style="background:${memberColor(mid)}" title="${memberName(mid)}">${memberInitial(mid)}</div>`).join('');

  const viewToggle = `
    <div style="display:flex;gap:6px;margin-bottom:16px;align-items:center">
      <button class="btn btn-sm ${mode==='list'?'btn-primary':'btn-ghost'}"
        onclick="projectViewMode['${pid}']='list';renderProjectView('${pid}')">
        ☰ 列表
      </button>
      <button class="btn btn-sm ${mode==='kanban'?'btn-primary':'btn-ghost'}"
        onclick="projectViewMode['${pid}']='kanban';renderProjectView('${pid}')">
        ⬛ 看板
      </button>
    </div>`;

  // Progress bar (visible in both modes)
  const progressBar = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 22px;margin-bottom:22px;box-shadow:var(--shadow)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:13px;color:var(--text2)">完成进度 · ${doneCnt} / ${tasks.length}</div>
          ${memberAvatars?`<div style="display:flex;gap:4px;margin-left:8px">${memberAvatars}</div>`:''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="openEditProject('${pid}')">✎ 编辑项目</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteProject('${pid}')">✕ 删除</button>
        </div>
      </div>
      <div class="progress-track" style="height:7px"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;

  let contentHTML = '';

  if (mode === 'kanban') {
    const COLS = [
      { key:'todo',    label:'待启动', color:'var(--text3)' },
      { key:'doing',   label:'进行中', color:'var(--blue)' },
      { key:'waiting', label:'待反馈', color:'var(--amber)' },
      { key:'done',    label:'已完成', color:'var(--green)' },
    ];
    const colsHTML = COLS.map(col => {
      const colTasks = tasks.filter(t => {
        const s = t.status || 'todo';
        if (col.key === 'done') return s === 'done' || t.done;
        return s === col.key && !t.done;
      });
      const cards = colTasks.map(t => taskCardHTML(t)).join('');
      return `
        <div style="flex:1;min-width:220px;max-width:320px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;
                      padding:8px 12px;background:var(--surface);border-radius:var(--radius-sm)">
            <span style="width:8px;height:8px;border-radius:50%;background:${col.color};flex-shrink:0"></span>
            <span style="font-size:13px;font-weight:600;color:var(--text)">${col.label}</span>
            <span style="font-size:11px;color:var(--text3);margin-left:auto;
                         background:var(--surface2);padding:1px 7px;border-radius:10px">${colTasks.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${cards || '<div style="font-size:12px;color:var(--text3);padding:12px;text-align:center">暂无任务</div>'}
          </div>
        </div>`;
    }).join('');
    contentHTML = `
      <div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;align-items:flex-start">
        ${colsHTML}
      </div>`;
  } else {
    const active = tasks.filter(t=>!t.done).sort((a,b)=>urgencyOf(a)-urgencyOf(b)||priorityOrder(a.priority)-priorityOrder(b.priority));
    const doneT = tasks.filter(t=>t.done);
    if (active.length) contentHTML += active.map(t=>taskCardHTML(t)).join('');
    if (doneT.length) contentHTML += `<div class="task-group" style="margin-top:20px"><div class="group-header"><div class="group-dot" style="background:#b8b5ae"></div><span class="group-title">已完成</span><span class="group-count">${doneT.length}</span></div>${doneT.map(t=>taskCardHTML(t)).join('')}</div>`;
    if (!tasks.length) contentHTML += '<div class="empty-state"><i data-lucide="clipboard-list" class="empty-icon"></i>这个项目还没有任务<div class="empty-hint">开始规划第一个任务吧</div><div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddTask()"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建任务</button></div></div>';
  }

  document.getElementById('main-content').innerHTML = `
    <div class="view-pane">
      ${viewToggle}
      ${progressBar}
      ${contentHTML}
    </div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  requestAnimationFrame(() => staggerEntrance());
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts() {
  document.getElementById('header-title').textContent = '图表分析';
  document.getElementById('header-sub').textContent = '任务状态 · 优先级 · 成员负载 · 月度趋势';

  const total = state.tasks.length;
  const statusCount = {todo:0,doing:0,waiting:0,done:0};
  state.tasks.forEach(t => statusCount[t.status]=(statusCount[t.status]||0)+1);

  const donutData = [
    {label:'待启动',count:statusCount.todo,color:'#d4d1c9'},
    {label:'进行中',count:statusCount.doing,color:'#2e7dd1'},
    {label:'待反馈',count:statusCount.waiting,color:'#d4842a'},
    {label:'已完成',count:statusCount.done,color:'#27ae60'},
  ];

  const donutSVG = buildDonutSVG(donutData, total);

  // Project progress bars
  let projBarsHTML = '<div class="proj-progress-list">';
  if (!state.projects.length) {
    projBarsHTML += '<div class="empty-state" style="padding:28px 20px"><i data-lucide="bar-chart-3" class="empty-icon" style="width:32px;height:32px"></i>暂无项目数据<div class="empty-hint">创建项目后这里会展示进度</div></div>';
  } else {
    state.projects.forEach(p => {
      const tasks = state.tasks.filter(t=>t.projectId===p.id);
      const doneCnt = tasks.filter(t=>t.done).length;
      const pct = tasks.length?Math.round(doneCnt/tasks.length*100):0;
      const color = PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length];
      projBarsHTML += `<div class="proj-progress-row" data-tip="${p.name}: ${doneCnt}/${tasks.length} 完成 · ${pct}%">
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

  // Priority distribution
  const priorityData = {紧急:0,重要:0,普通:0};
  state.tasks.forEach(t => { if (!t.done && priorityData[t.priority] !== undefined) priorityData[t.priority]++; });
  const priTotal = priorityData['紧急']+priorityData['重要']+priorityData['普通'] || 1;
  const priBarsHTML = [
    {label:'紧急',count:priorityData['紧急'],color:'var(--red)',bg:'var(--red-bg)'},
    {label:'重要',count:priorityData['重要'],color:'var(--amber)',bg:'var(--amber-bg)'},
    {label:'普通',count:priorityData['普通'],color:'var(--text3)',bg:'var(--surface2)'},
  ].map(d => {
    const w = Math.max(2, Math.round(d.count/priTotal*100));
    return `<div class="chart-bar-row" data-tip="${d.label}优先级: ${d.count} 个任务 (${Math.round(d.count/priTotal*100)}%)">
      <span class="chart-bar-label">${d.label}</span>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${w}%;background:${d.color}"></div></div>
      <span class="chart-bar-val">${d.count}</span>
    </div>`;
  }).join('');

  // Member workload
  let membersHTML = '';
  if (state.members.length) {
    const active = state.tasks.filter(t=>!t.done);
    const maxTask = Math.max(1, ...state.members.map(m => active.filter(t=>t.assignee===m.id).length));
    membersHTML = state.members.map(m => {
      const myTasks = active.filter(t=>t.assignee===m.id);
      const cnt = myTasks.length;
      const doneCnt = state.tasks.filter(t=>t.assignee===m.id&&t.done).length;
      const totalMine = cnt + doneCnt || 1;
      const pct = Math.round(doneCnt/totalMine*100);
      const w = Math.max(2, Math.round(cnt/maxTask*100));
      const color = memberColor(m.id);
      return `<div class="chart-bar-row" data-tip="${m.name}: ${cnt} 个待办任务 · 完成率 ${pct}%">
        <span class="chart-bar-label" style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>${m.name}</span>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${w}%;background:${color}"></div></div>
        <span class="chart-bar-val" style="font-size:11px">${cnt} 待办 · ${pct}% 完成</span>
      </div>`;
    }).join('');
  } else {
    membersHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">暂无成员数据</div>';
  }

  // Burndown
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
        <div class="chart-title">待办优先级分布</div>
        <div class="chart-bars">${priBarsHTML}</div>
      </div>

      <div class="chart-card">
        <div class="chart-title">项目完成进度</div>
        ${projBarsHTML}
      </div>

      <div class="chart-card">
        <div class="chart-title">成员待办负载</div>
        <div class="chart-bars">${membersHTML}</div>
      </div>

      <div class="chart-card full">
        <div class="chart-title">月度任务趋势
          <span style="font-size:11px;font-weight:400;color:var(--text3)">近30天</span>
        </div>
        <div id="monthly-trend-area">${buildMonthlyTrendSVG()}</div>
      </div>

      <div class="chart-card full">
        <div class="chart-title">
          燃尽图 <span id="burndown-pts-hint" style="font-size:10px;font-weight:400;color:var(--text3)"></span>
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
  var hint = document.getElementById('burndown-pts-hint');
  if (hint) {
    var log = state.burndownLog[projId === 'all' ? 'all' : projId] || [];
    hint.textContent = '· ' + log.length + ' 个数据点';
  }
}

function buildDonutSVG(data, total) {
  const cx=90,cy=90,r=72,ir=46;
  let svg = `<svg width="180" height="180" viewBox="0 0 180 180">`;
  if (total===0) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f2f1ec"/><circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#a8a59e" font-size="13">暂无数据</text>`;
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
            <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="#a8a59e" font-size="11">进行中</text>`;
  }
  return svg+'</svg>';
}

function buildBurndownSVG(projId) {
  const log = state.burndownLog[projId] || [];
  const W=680, H=200, padL=44, padR=20, padT=16, padB=36;
  const chartW=W-padL-padR, chartH=H-padT-padB;

  if (log.length < 2) {
    return `<div style="padding:28px 16px;text-align:center;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:12px">📈</div>
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">数据积累中</div>
      <div style="font-size:12px;line-height:1.6">
        燃尽图需要至少 2 天的历史数据<br>
        系统每次打开时自动记录一个快照<br>
        <span style="color:var(--text2)">当前已有 ${log.length} 个数据点</span>
      </div>
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
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#e8e5df" stroke-width="1"/>`;
    yLabels += `<text x="${padL-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#a8a59e" font-size="11">${v}</text>`;
  }

  // X date labels (show first, middle, last)
  let xLabels = '';
  const xLabelIdxs = [0, Math.floor((log.length-1)/2), log.length-1];
  xLabelIdxs.forEach(i => {
    if (i < log.length) xLabels += `<text x="${toX(i)}" y="${padT+chartH+18}" text-anchor="middle" fill="#a8a59e" font-size="11">${log[i].date.slice(5)}</text>`;
  });

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">
    ${gridLines}
    <path d="${areaPath}" fill="#2e7dd1" opacity="0.08"/>
    <polyline points="${pointsStr}" fill="none" stroke="#2e7dd1" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${log.map((l,i)=>`<circle cx="${toX(i)}" cy="${toY(l.remaining)}" r="10" fill="transparent" stroke="none" data-tip="${l.date}: 剩余 ${l.remaining} 个任务" style="cursor:pointer"/>`).join('')}
    ${log.map((l,i)=>`<circle cx="${toX(i)}" cy="${toY(l.remaining)}" r="3.5" fill="#2e7dd1" style="pointer-events:none"/>`).join('')}
    ${yLabels}${xLabels}
    <text x="${padL}" y="${padT-4}" fill="#a8a59e" font-size="10">剩余任务数</text>
  </svg>`;
}

// ─── Monthly trend (new vs completed per day, last 30 days) ───────────────────
function buildMonthlyTrendSVG() {
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0,10));
  }

  const createdByDay = {}; const completedByDay = {};
  days.forEach(d => { createdByDay[d] = 0; completedByDay[d] = 0; });
  state.tasks.forEach(t => {
    if (t.createdAt) { const k = t.createdAt.slice(0,10); if (createdByDay[k] !== undefined) createdByDay[k]++; }
    if (t.completedAt) { const k = t.completedAt.slice(0,10); if (completedByDay[k] !== undefined) completedByDay[k]++; }
  });

  const W = 680, H = 200, padL = 44, padR = 20, padT = 16, padB = 36;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const createdVals = days.map(d => createdByDay[d]);
  const completedVals = days.map(d => completedByDay[d]);
  const maxVal = Math.max(...createdVals, ...completedVals, 1);
  const range = maxVal || 1;

  const toX = (i) => padL + (i / (days.length - 1)) * chartW;
  const toY = (v) => padT + (1 - v / range) * chartH;

  // Grid lines and Y labels
  const yTicks = 4;
  let gridLines = '', yLabels = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = Math.round(maxVal * i / yTicks);
    const y = toY(v);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#e8e5df" stroke-width="1"/>`;
    yLabels += `<text x="${padL-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#a8a59e" font-size="10">${v}</text>`;
  }

  // X labels
  let xLabels = '';
  [0, 9, 19, 29].forEach(i => {
    if (i < days.length) xLabels += `<text x="${toX(i)}" y="${padT+chartH+16}" text-anchor="middle" fill="#a8a59e" font-size="10">${days[i].slice(5)}</text>`;
  });

  // Build polylines
  function polyline(vals, stroke, dash) {
    let pts = vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"${dash ? ' stroke-dasharray="5,3"' : ''}/>`;
  }

  // Area fills
  function areaFill(vals, color, opacity) {
    const top = padT;
    const pts = vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
    const areaPts = `M${toX(0)},${top+chartH} ` + vals.map((v,i) => `L${toX(i)},${toY(v)}`).join(' ') + ` L${toX(days.length-1)},${top+chartH} Z`;
    return `<path d="${areaPts}" fill="${color}" opacity="${opacity}"/>`;
  }

  // Hover dots for each data point
  let createdDots = days.map((d, i) => `<circle cx="${toX(i)}" cy="${toY(createdByDay[d])}" r="8" fill="transparent" stroke="none" data-tip="${d}: 新建 ${createdByDay[d]} 个任务" style="cursor:pointer"/>`).join('');
  let completedDots = days.map((d, i) => `<circle cx="${toX(i)}" cy="${toY(completedByDay[d])}" r="8" fill="transparent" stroke="none" data-tip="${d}: 完成 ${completedByDay[d]} 个任务" style="cursor:pointer"/>`).join('');

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">
    ${gridLines}
    ${areaFill(createdVals, '#2e7dd1', '0.06')}
    ${areaFill(completedVals, '#27ae60', '0.08')}
    ${polyline(createdVals, '#2e7dd1', false)}
    ${polyline(completedVals, '#27ae60', true)}
    ${yLabels}${xLabels}
    ${createdDots}${completedDots}
    <circle cx="${toX(0)}" cy="${toY(createdVals[0])}" r="3" fill="#2e7dd1" style="pointer-events:none"/>
    <circle cx="${toX(days.length-1)}" cy="${toY(createdVals[days.length-1])}" r="3" fill="#2e7dd1" style="pointer-events:none"/>
    <circle cx="${toX(0)}" cy="${toY(completedVals[0])}" r="3" fill="#27ae60" style="pointer-events:none"/>
    <circle cx="${toX(days.length-1)}" cy="${toY(completedVals[days.length-1])}" r="3" fill="#27ae60" style="pointer-events:none"/>
    <text x="${padL}" y="${padT-3}" fill="#a8a59e" font-size="10">任务数</text>
  </svg>`;
}

// ─── Gantt ────────────────────────────────────────────────────────────────────
let ganttDayW = 42;
let projectViewMode = {}; // { [pid]: 'list' | 'kanban' }

async function renderGantt() {
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
    if (t.startDate) { const d=new Date(t.startDate); if(d<minDate) minDate=new Date(d); }
  });
  maxDate.setDate(maxDate.getDate()+7);
  minDate.setDate(minDate.getDate()-3);

  // Store for drag calculations
  window._ganttMinDate = new Date(minDate);
  window._ganttDayW = ganttDayW;

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
    // Day number every day
      dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW+3}px;top:20px;font-size:11px;color:var(--text);font-weight:600;white-space:nowrap">${d.getDate()}</div>`;
  }
  // Today marker
  dateHeaderHTML += `<div style="position:absolute;left:${todayOffset*ganttDayW}px;top:0;width:${ganttDayW}px;bottom:-9999px;background:rgba(37,99,168,.07);pointer-events:none"></div>`;
  dateHeaderHTML += `<div style="position:absolute;left:${todayOffset*ganttDayW+ganttDayW/2}px;top:0;bottom:-9999px;border-left:2px dashed #2e7dd1;pointer-events:none"></div>`;
  dateHeaderHTML += `<div style="position:absolute;left:${todayOffset*ganttDayW+1}px;top:2px;background:#2e7dd1;color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;white-space:nowrap">今</div>`;

  // Grid lines — thick every 7 days, thin every day
  for (let i=0; i<totalDays; i++) {
    dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW}px;top:0;bottom:-9999px;border-left:1px solid var(--border);opacity:${i%7===0?1:.35};pointer-events:none"></div>`;
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
      const startD = (t.startDate || t.createdAt) ? new Date(t.startDate || t.createdAt) : (() => { const d=new Date(t.due); d.setDate(d.getDate()-5); return d; })();
      const endD = new Date(t.due);
      startD.setHours(0,0,0,0); endD.setHours(0,0,0,0);
      const startStr = startD.getFullYear()+'-'+String(startD.getMonth()+1).padStart(2,'0')+'-'+String(startD.getDate()).padStart(2,'0');
      const endStr = endD.getFullYear()+'-'+String(endD.getMonth()+1).padStart(2,'0')+'-'+String(endD.getDate()).padStart(2,'0');
      const startOffset = Math.round((startD-minDate)/86400000);
      const durDays = Math.max(1, Math.round((endD-startD)/86400000)+1);
      const left = Math.max(0, startOffset)*ganttDayW;
      const width = Math.max(ganttDayW-2, durDays*ganttDayW-2);
      const barColor = t.done ? '#b8b5ae' : color;
      const isOverdue = !t.done && new Date(t.due)<today;
      const blocked = isBlocked(t);

      const canDrag = canAdjustGantt(t);
      leftHTML += `<div class="gantt-row-name${t.done?' done-row':''}${t.milestone?' milestone-row':''}" onclick="openEditTask('${t.id}')" title="${t.title}  |  ${startStr} ~ ${endStr}">${t.milestone?'◆ ':''}${blocked?'⚠ ':''}${t.title}</div>`;
      rightHTML += `<div style="position:relative;height:44px;border-bottom:1px solid var(--border);width:${chartWidth}px;background:${t.done?'transparent':'var(--surface)'}">
        <div class="gantt-bar" data-task-id="${t.id}" data-start-offset="${startOffset}" data-dur-days="${durDays}" title="${t.title}  |  ${startStr} ~ ${endStr}" ondblclick="openEditTask('${t.id}')" style="position:absolute;top:10px;left:${left}px;width:${width}px;height:24px;background:${barColor};opacity:${t.done?.5:1};border-radius:${t.milestone?'3px':'5px'};cursor:${canDrag?'grab':'default'};display:flex;align-items:center;padding:0 8px;overflow:hidden;transition:none;${isOverdue?'outline:1.5px solid var(--red);':''}${t.milestone?'outline:2px solid '+barColor+';outline-offset:2px;':''}" onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='${t.done?.5:1}'">
          <span style="font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;pointer-events:none">${t.milestone?'◆ ':''}${t.title}</span>
          ${canDrag?`<div class="gantt-resize-handle" data-task-id="${t.id}" style="position:absolute;right:0;top:0;width:8px;height:100%;cursor:ew-resize;background:rgba(255,255,255,.25);border-radius:0 5px 5px 0" title="拖动调整截止日期"></div>`:''}
        </div>
        ${t.milestone?`<div style="position:absolute;left:${left+width}px;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:12px;height:12px;background:var(--amber);border:2px solid #fff;box-shadow:0 0 0 1.5px var(--amber);pointer-events:none;z-index:2"></div>`:''}
        ${t.due===todayStr?`<div style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--red);font-weight:600">今</div>`:''}
      </div>`;
    });
  });

  if (!state.tasks.length) {
    leftHTML += '<div class="empty-state" style="padding:40px 16px">暂无任务</div>';
  }

  // ── Load adjustment history from Supabase BEFORE setting innerHTML ──
  var adjRecords = [];
  var adjProjects = [];
  try {
    var logRes = await sb.from('logs')
      .select('*')
      .in('action', ['甘特图调整','gantt_adjust'])
      .order('created_at', { ascending: false })
      .limit(200);
    var projSet = {};
    adjRecords = (logRes.data || []).map(function(row) {
      try {
        var d = JSON.parse(row.detail || '{}');
        var pid = d.projectId || '';
        var pname = projName(pid);
        if (pid && pname) projSet[pid] = pname;
        return {
          taskId: d.taskId || '',
          taskTitle: d.taskTitle || '—',
          projectId: pid,
          projectName: pname || '—',
          mode: d.mode || 'resize',
          newDue: d.newDue || '',
          oldDue: d.oldDue || '',
          operator: row.user_name || '—',
          time: new Date(row.created_at).toLocaleString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}),
          rawDate: row.created_at
        };
      } catch(e) { return null; }
    }).filter(Boolean);
    adjProjects = Object.entries(projSet).map(function(e) { return {id: e[0], name: e[1]}; });
  } catch(e) { /* ignore */ }

  // Build filter bar HTML
  var projOpts = adjProjects.map(function(p) {
    return '<option value="' + p.id + '">' + p.name + '</option>';
  }).join('');

  var adjHistoryHTML = '';
  if (adjRecords.length > 0) {
    adjHistoryHTML = `
      <div style="margin-top:16px" id="gantt-adj-section">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
          <div style="font-size:12px;font-weight:600;color:var(--text2)">📋 调整记录</div>
          <select id="gantt-adj-filter-proj" onchange="filterGanttHistory()" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2)">
            <option value="">全部项目</option>${projOpts}
          </select>
          <input id="gantt-adj-filter-task" oninput="filterGanttHistory()" placeholder="搜索任务…" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2);width:130px">
          <input type="date" id="gantt-adj-filter-from" onchange="filterGanttHistory()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2);width:115px" title="开始日期">
          <span style="font-size:11px;color:var(--text3)">至</span>
          <input type="date" id="gantt-adj-filter-to" onchange="filterGanttHistory()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2);width:115px" title="结束日期">
          <span style="font-size:10px;color:var(--text3);margin-left:auto">共 ${adjRecords.length} 条</span>
        </div>
        <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)" id="gantt-adj-table-wrap">
          ${buildGanttHistoryTable(adjRecords)}
        </div>
      </div>`;
  }

  // Store records for client-side filtering
  window._ganttAdjRecords = adjRecords;

  const html = `<div class="view-pane">
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text3)">缩放：</span>
      <button class="btn btn-ghost btn-sm" onclick="setGanttZoom(20)">小</button>
      <button class="btn btn-ghost btn-sm" onclick="setGanttZoom(30)">中</button>
      <button class="btn btn-ghost btn-sm" onclick="setGanttZoom(44)">大</button>
      <span style="font-size:11px;color:var(--text3);margin-left:12px;display:flex;align-items:center;gap:4px">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text3)" stroke-width="1.5"><path d="M5 3v10M11 3v10M3 8h10"/></svg>
        拖动时间条或右边缘可调整日期
      </span>
    </div>
    <div class="gantt-wrap" id="gantt-wrap">
      <div class="gantt-inner">
        <div class="gantt-left" id="gantt-left-col">${leftHTML}</div>
        <div style="flex:1;overflow-x:auto" id="gantt-right-scroll">
          <div style="min-width:${chartWidth}px" id="gantt-right-col">${rightHTML}</div>
        </div>
      </div>
    </div>
    ${adjHistoryHTML}
  </div>`;
  document.getElementById('main-content').innerHTML = html;
  ganttScrollToday();
  initGanttDrag();
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
    const todayLine = document.querySelector('[style*="border-left:2px dashed #2e7dd1"]');
    if (todayLine && sc) {
      const parent = sc.getBoundingClientRect();
      sc.scrollLeft = Math.max(0, (parseInt(todayLine.style.left)||0) - parent.width/3);
    }
  }, 50);
}

// ─── Task Card ────────────────────────────────────────────────────────────────

// ─── Gantt drag-to-resize/move ─────────────────────────────────
let _ganttDragging = null;
let _ganttMousedown = null;
let _ganttMousemove = null;
let _ganttMouseup = null;

function initGanttDrag() {
  if (_ganttMousedown) document.removeEventListener('mousedown', _ganttMousedown);
  if (_ganttMousemove) document.removeEventListener('mousemove', _ganttMousemove);
  if (_ganttMouseup) document.removeEventListener('mouseup', _ganttMouseup);

  // Ensure tooltip element exists
  var tip = document.getElementById('gantt-drag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'gantt-drag-tip';
    tip.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;background:#1e1e2e;color:#e0e0e0;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.35);white-space:nowrap;display:none;border:1px solid rgba(255,255,255,.12);letter-spacing:0.02em';
    document.body.appendChild(tip);
  }

  function fmtGanttDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function showTip(e, html) {
    tip.innerHTML = html;
    tip.style.display = '';
    var tx = e.clientX + 16;
    var ty = e.clientY - 44;
    if (tx + 200 > window.innerWidth) tx = e.clientX - 200;
    if (ty < 10) ty = e.clientY + 20;
    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';
  }

  function hideTip() {
    tip.style.display = 'none';
  }

  _ganttMousedown = function(e) {
    var ganttCol = document.getElementById('gantt-right-col');
    if (!ganttCol) return;
    var handle = e.target.closest('.gantt-resize-handle');
    var bar = e.target.closest('.gantt-bar');
    if (!handle && !bar) return;

    var taskId = (handle || bar).getAttribute('data-task-id');
    var task = state.tasks.find(function(t) { return t.id === taskId; });
    if (!task || !canAdjustGantt(task)) return;

    if (handle && handle.closest('.gantt-bar') === bar) {
      _ganttDragging = {
        taskId: taskId, mode: 'resize',
        startX: e.clientX,
        origWidth: parseInt(bar.style.width),
        origLeft: parseInt(bar.style.left),
        origStartOffset: parseInt(bar.getAttribute('data-start-offset')),
        origDurDays: parseInt(bar.getAttribute('data-dur-days')),
        dayW: ganttDayW,
        barEl: bar
      };
      e.preventDefault();
      showTip(e, '<span style="font-size:11px;opacity:.7">截止</span> ' + fmtGanttDate(task.due));
    } else if (bar && !handle) {
      _ganttDragging = {
        taskId: taskId, mode: 'move',
        startX: e.clientX,
        origLeft: parseInt(bar.style.left),
        origWidth: parseInt(bar.style.width),
        origStartOffset: parseInt(bar.getAttribute('data-start-offset')),
        origDurDays: parseInt(bar.getAttribute('data-dur-days')),
        dayW: ganttDayW,
        barEl: bar
      };
      bar.style.cursor = 'grabbing';
      e.preventDefault();
      var sd = task.startDate || task.createdAt;
      showTip(e, fmtGanttDate(sd) + ' <span style="opacity:.5">~</span> ' + fmtGanttDate(task.due));
    }
  };

  _ganttMousemove = function(e) {
    if (!_ganttDragging) return;
    var dx = e.clientX - _ganttDragging.startX;
    var days = Math.round(dx / _ganttDragging.dayW);
    var minDate = window._ganttMinDate;
    if (!minDate) return;

    if (_ganttDragging.mode === 'resize') {
      var newWidth = Math.max(_ganttDragging.dayW, _ganttDragging.origWidth + days * _ganttDragging.dayW);
      _ganttDragging.barEl.style.width = newWidth + 'px';
      // Calculate new end date for tooltip
      var newDurDays = Math.max(1, _ganttDragging.origDurDays + days);
      var tipDate = new Date(minDate);
      tipDate.setDate(tipDate.getDate() + _ganttDragging.origStartOffset + newDurDays - 1);
      var tipStr = tipDate.getFullYear() + '-' + String(tipDate.getMonth()+1).padStart(2,'0') + '-' + String(tipDate.getDate()).padStart(2,'0');
      showTip(e, '<span style="font-size:11px;opacity:.7">截止</span> <span style="color:#7ec8e3">' + tipStr + '</span>' + (days !== 0 ? ' <span style="font-size:10px;opacity:.5">' + (days > 0 ? '+' : '') + days + '天</span>' : ''));
    } else {
      var newLeft = _ganttDragging.origLeft + days * _ganttDragging.dayW;
      _ganttDragging.barEl.style.left = Math.max(0, newLeft) + 'px';
      // Calculate new start/end for tooltip
      var newStartOffset = Math.max(0, _ganttDragging.origStartOffset + days);
      var tipStart = new Date(minDate);
      tipStart.setDate(tipStart.getDate() + newStartOffset);
      var tipEnd = new Date(tipStart);
      tipEnd.setDate(tipEnd.getDate() + _ganttDragging.origDurDays - 1);
      var ts = tipStart.getFullYear() + '-' + String(tipStart.getMonth()+1).padStart(2,'0') + '-' + String(tipStart.getDate()).padStart(2,'0');
      var te = tipEnd.getFullYear() + '-' + String(tipEnd.getMonth()+1).padStart(2,'0') + '-' + String(tipEnd.getDate()).padStart(2,'0');
      var dayLabel = days !== 0 ? ' <span style="font-size:10px;opacity:.5">' + (days > 0 ? '+' : '') + days + '天</span>' : '';
      showTip(e, '<span style="color:#f0c060">' + ts + '</span> <span style="opacity:.5">~</span> <span style="color:#7ec8e3">' + te + '</span>' + dayLabel);
    }
  };

  _ganttMouseup = function(e) {
    hideTip();
    if (!_ganttDragging) return;
    var dx = e.clientX - _ganttDragging.startX;
    var days = Math.round(dx / _ganttDragging.dayW);
    var taskId = _ganttDragging.taskId;
    var mode = _ganttDragging.mode;
    var origStartOffset = _ganttDragging.origStartOffset;
    var origDurDays = _ganttDragging.origDurDays;
    _ganttDragging.barEl.style.cursor = mode === 'move' ? 'grab' : '';
    _ganttDragging = null;

    if (days === 0) return;

    var task = state.tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;

    var minDate = window._ganttMinDate;
    if (!minDate) { minDate = new Date(); minDate.setDate(minDate.getDate() - 14); }

    var oldDue = task.due;
    var oldStartDate = task.startDate;
    if (mode === 'resize') {
      var newDurDays = Math.max(1, origDurDays + days);
      var newEndDate = new Date(minDate);
      newEndDate.setDate(newEndDate.getDate() + origStartOffset + newDurDays - 1);
      task.due = newEndDate.getFullYear() + '-' + String(newEndDate.getMonth()+1).padStart(2,'0') + '-' + String(newEndDate.getDate()).padStart(2,'0');
    } else {
      var newStartOffset = Math.max(0, origStartOffset + days);
      var newStartDate = new Date(minDate);
      newStartDate.setDate(newStartDate.getDate() + newStartOffset);
      var newEndDate = new Date(newStartDate);
      newEndDate.setDate(newEndDate.getDate() + origDurDays - 1);
      task.startDate = newStartDate.getFullYear() + '-' + String(newStartDate.getMonth()+1).padStart(2,'0') + '-' + String(newStartDate.getDate()).padStart(2,'0');
      task.due = newEndDate.getFullYear() + '-' + String(newEndDate.getMonth()+1).padStart(2,'0') + '-' + String(newEndDate.getDate()).padStart(2,'0');
    }

    window._ganttSaving = true;
    saveGanttAdjustment(task, mode, oldDue).then(function(ok) {
      if (!ok) { task.due = oldDue; task.startDate = oldStartDate; }
      renderGantt();
      setTimeout(function() { window._ganttSaving = false; }, 1500);
    });
  };

  document.addEventListener('mousedown', _ganttMousedown);
  document.addEventListener('mousemove', _ganttMousemove);
  document.addEventListener('mouseup', _ganttMouseup);
}


async function saveGanttAdjustment(task, mode, oldDue) {
  try {
    var payload = { due: task.due };
    if (task.startDate) payload.start_date = task.startDate;
    var ret = await sb.from('tasks').update(payload).eq('id', task.id);
    if (ret.error) { toast('保存失败：' + ret.error.message, 'error'); return false; }
    toast('时间已更新', 'success');

    // Persist to logs table
    var detail = JSON.stringify({
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId || '',
      mode: mode || 'resize',
      newDue: task.due,
      oldDue: oldDue || ''
    });
	    try {
      await sb.from('logs').insert({
        id: 'gl' + uid(),
        user_id: currentUser ? currentUser.id : '',
        user_name: currentUser ? currentUser.name : '',
        action: '甘特图调整',
        detail: detail,
        created_at: new Date().toISOString()
      });
    } catch(e) { /* ignore */ }

    if (typeof addTimelineEntry === 'function') {
      addTimelineEntry(task, '调整时间', '截止日期更新为 ' + task.due);
    }
    return true;
  } catch(err) {
    toast('保存异常', 'error');
    return false;
  }
}

// ─── Gantt permission check ────────────────────────────────
function canAdjustGantt(task) {
  if (!currentUser) return false;
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  // 项目负责人：用户在项目成员列表中
  if (task.projectId) {
    var proj = state.projects.find(function(p) { return p.id === task.projectId; });
    if (proj && (proj.members || []).indexOf(currentUser.id) >= 0) return true;
  }
  // 任务负责人
  if (task.assignee === currentUser.id) return true;
  return false;
}

// ─── Gantt history filters ─────────────────────────────────
function filterGanttHistory() {
  var records = window._ganttAdjRecords || [];
  var projFilter = (document.getElementById('gantt-adj-filter-proj') || {}).value || '';
  var taskFilter = ((document.getElementById('gantt-adj-filter-task') || {}).value || '').toLowerCase();
  var fromFilter = (document.getElementById('gantt-adj-filter-from') || {}).value || '';
  var toFilter = (document.getElementById('gantt-adj-filter-to') || {}).value || '';

  var filtered = records.filter(function(r) {
    if (projFilter && r.projectId !== projFilter) return false;
    if (taskFilter && r.taskTitle.toLowerCase().indexOf(taskFilter) === -1) return false;
    if (fromFilter && r.rawDate < fromFilter) return false;
    if (toFilter && r.rawDate > toFilter + 'T23:59:59') return false;
    return true;
  });

  var wrap = document.getElementById('gantt-adj-table-wrap');
  if (wrap) wrap.innerHTML = buildGanttHistoryTable(filtered);
}

function buildGanttHistoryTable(records) {
  if (!records.length) {
    return '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px">无匹配记录</div>';
  }
  return '<table style="width:100%;border-collapse:collapse;font-size:11px">'
    + '<thead><tr style="background:var(--surface2)">'
    + '<th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">项目</th>'
    + '<th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">任务</th>'
    + '<th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">调整方式</th>'
    + '<th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">截止日期</th>'
    + '<th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">操作人</th>'
    + '<th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">时间</th>'
    + '</tr></thead>'
    + '<tbody>' + records.map(function(a) { return ''
    + '<tr>'
    + '<td style="padding:5px 10px;color:var(--text2);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + a.projectName + '</td>'
    + '<td style="padding:5px 10px;color:var(--text)">' + a.taskTitle + '</td>'
    + '<td style="padding:5px 10px;color:' + (a.mode==='resize'?'var(--blue)':'var(--amber)') + '">' + (a.mode==='resize'?'调整截止':'平移时间') + '</td>'
    + '<td style="padding:5px 10px;color:var(--text2);font-family:var(--mono)">' + a.newDue + '</td>'
    + '<td style="padding:5px 10px;color:var(--text2)">' + a.operator + '</td>'
    + '<td style="padding:5px 10px;color:var(--text3)">' + a.time + '</td>'
    + '</tr>'; }).join('') + '</tbody>'
    + '</table>';
}
