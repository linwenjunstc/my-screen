/* ════════════════════════════════════════════════
 * pm-views.js  —  今日看板 / 任务列表 / 项目视图 / 图表 / 甘特图
 * ════════════════════════════════════════════════ */

window._todayViewMode = window._todayViewMode || 'today';

// 排序映射（中文值 → 数值）
var _PRIO_ORDER_MAP = { '紧急': 0, '重要': 1, '普通': 2 };
var _STATUS_ORDER_MAP = { 'todo': 0, 'doing': 1, 'waiting': 2, 'done': 3 };

// V20: 格式化任务负责人名（多选支持）
window.assigneeNamesStr = function(t, memberMap) {
  var ids = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
  return ids.map(function(id) { return memberMap[id] || id; }).join(', ') || '—';
};

window._todayGroupMode = window._todayGroupMode || 'project';
window._todayFilterScope = window._todayFilterScope || 'all';
window._todayCollapsed = window._todayCollapsed || {};

function renderToday() {
  if (window._todayViewMode === 'week') {
    renderWeekGrid();
    return;
  }
  document.getElementById('header-title').textContent = '今日看板';
  const now = new Date();
  document.getElementById('header-sub').textContent = now.toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'});

  const todayStr = new Date().toISOString().slice(0,10);
  var allActive = state.tasks.filter(function(t) { return !t.done; });
  // 筛选范围
  if (window._todayFilterScope === 'mine') {
    allActive = allActive.filter(function(t) { return t.assignee === currentUser.id; });
  } else if (window._todayFilterScope === 'involved') {
    allActive = allActive.filter(function(t) { return (t.assignees || []).includes(currentUser.id); });
  }

  const done = state.tasks.filter(function(t) {
    if (!t.done) return false;
    if (t.completedAt) return t.completedAt.slice(0,10) === todayStr;
    if (t.updated_at) return t.updated_at.slice(0,10) === todayStr;
    return false;
  });

  const g0 = allActive.filter(function(t) { return urgencyOf(t) === 0; }).sort(function(a,b) { return priorityOrder(a.priority) - priorityOrder(b.priority); });
  const g1 = allActive.filter(function(t) { return urgencyOf(t) === 1; }).sort(function(a,b) { return priorityOrder(a.priority) - priorityOrder(b.priority); });
  const g2 = allActive.filter(function(t) { return urgencyOf(t) === 2; }).sort(function(a,b) { return priorityOrder(a.priority) - priorityOrder(b.priority); });
  const g3 = allActive.filter(function(t) { return urgencyOf(t) === 3; }).sort(function(a,b) { return priorityOrder(a.priority) - priorityOrder(b.priority); });

  // 统计卡片（受筛选范围影响）
  var html = '<div class="view-pane">' +
    '<div class="view-mode-tabs">' +
      '<button class="vmtab active" onclick="window._todayViewMode=\'today\';renderToday()">今日</button>' +
      '<button class="vmtab" onclick="window._todayViewMode=\'week\';renderWeekGrid()">本周</button>' +
    '</div>' +
    '<div class="stats-grid">' +
      '<div class="stat-card sc-red" style="cursor:' + (g0.length ? 'pointer' : 'default') + '"' + (g0.length ? ' onclick="showDashboardTaskList(\'g0\')"' : '') + '><div class="stat-icon"><i data-lucide="alert-circle" style="width:16px;height:16px"></i></div><div class="stat-label">紧急 / 逾期</div><div class="stat-val' + (g0.length ? ' red' : '') + '">' + g0.length + '</div></div>' +
      '<div class="stat-card sc-amber" style="cursor:' + (g1.length ? 'pointer' : 'default') + '"' + (g1.length ? ' onclick="showDashboardTaskList(\'g1\')"' : '') + '><div class="stat-icon"><i data-lucide="clock" style="width:16px;height:16px"></i></div><div class="stat-label">3 天内到期</div><div class="stat-val' + (g1.length ? ' amber' : '') + '">' + g1.length + '</div></div>' +
      '<div class="stat-card sc-blue" style="cursor:' + (g2.length ? 'pointer' : 'default') + '"' + (g2.length ? ' onclick="showDashboardTaskList(\'g2\')"' : '') + '><div class="stat-icon"><i data-lucide="calendar-check" style="width:16px;height:16px"></i></div><div class="stat-label">本周内</div><div class="stat-val">' + g2.length + '</div></div>' +
      '<div class="stat-card sc-green" style="cursor:' + (done.length ? 'pointer' : 'default') + '"' + (done.length ? ' onclick="showDashboardTaskList(\'done\')"' : '') + '><div class="stat-icon"><i data-lucide="check-circle-2" style="width:16px;height:16px"></i></div><div class="stat-label">今日已完成</div><div class="stat-val' + (done.length ? ' green' : '') + '">' + done.length + '</div></div>' +
    '</div>';

  // 快捷筛选栏
  html += '<div class="today-scope-bar">' +
    '<span class="today-scope-chip' + (window._todayFilterScope === 'all' ? ' on' : '') + '" onclick="setTodayScope(\'all\')">全部</span>' +
    '<span class="today-scope-chip' + (window._todayFilterScope === 'mine' ? ' on' : '') + '" onclick="setTodayScope(\'mine\')">我负责的</span>' +
    '<span class="today-scope-chip' + (window._todayFilterScope === 'involved' ? ' on' : '') + '" onclick="setTodayScope(\'involved\')">我参与的</span>' +
    '<div class="today-group-toggle">' +
      '<button class="tgt-btn' + (window._todayGroupMode === 'project' ? ' active' : '') + '" onclick="setTodayGroupMode(\'project\')">按项目</button>' +
      '<button class="tgt-btn' + (window._todayGroupMode === 'urgency' ? ' active' : '') + '" onclick="setTodayGroupMode(\'urgency\')">按紧急度</button>' +
    '</div>' +
  '</div>';

  if (window._todayGroupMode === 'urgency') {
    // 兼容旧逻辑：按紧急度分组
    var groups = [
      { tasks: g0, dot: '#e74c3c', label: '紧急 / 逾期' },
      { tasks: g1, dot: '#d4842a', label: '3 天内' },
      { tasks: g2, dot: '#27ae60', label: '本周内' },
      { tasks: g3, dot: '#a8a59e', label: '较远' },
      { tasks: done, dot: '#b8b5ae', label: '已完成' },
    ];
    var anyTask = false;
    groups.forEach(function(g) {
      if (!g.tasks.length) return; anyTask = true;
      html += '<div class="task-group"><div class="group-header"><div class="group-dot" style="background:' + g.dot + '"></div><span class="group-title">' + g.label + '</span><span class="group-count">' + g.tasks.length + '</span></div>' + g.tasks.map(function(t) { return taskCardHTML(t); }).join('') + '</div>';
    });
    if (!anyTask) html += renderEmptyState({ icon: 'sun', title: '今日没有待办任务', desc: '点击「快速添加任务」开始安排今天的工作', action: '<div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddTask()"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建任务</button></div>' });
  } else {
    // ★ 新模式：按项目→模块分组
    var anyGroup = false;
    state.projects.forEach(function(p) {
      var projTasks = allActive.filter(function(t) { return t.projectId === p.id; });
      if (!projTasks.length) return;
      anyGroup = true;
      var projId = p.id;
      var color = PROJ_COLORS[(p.colorIdx || 0) % PROJ_COLORS.length][0];
      var doneCount = projTasks.filter(function(t) { return t.done; }).length;
      var pct = Math.round(doneCount / projTasks.length * 100);
      var isCollapsed = !!window._todayCollapsed[projId];
      var arrow = isCollapsed ? '▶' : '▼';

      html += '<div class="today-project-group">' +
        '<div class="today-project-header" onclick="toggleTodayGroup(\'' + projId + '\')">' +
          '<span class="tph-dot" style="background:' + color + '"></span>' +
          '<span class="tph-name" onclick="event.stopPropagation();switchView(\'project-' + projId + '\')">' + escHtml(p.name) + '</span>' +
          '<span class="tph-pct">' + pct + '%</span>' +
          '<span class="tph-count">' + projTasks.length + '</span>' +
          '<span class="tph-arrow">' + arrow + '</span>' +
        '</div>' +
        '<div class="tph-progress"><div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:2px;transition:width .4s ease"></div></div>';

      if (!isCollapsed) {
        var mods = state.modules.filter(function(m) { return m.projectId === p.id; }).sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
        var modGroups = [];
        mods.forEach(function(m) {
          var mt = projTasks.filter(function(t) { return t.moduleId === m.id; });
          if (mt.length) modGroups.push({ mod: m, tasks: mt });
        });
        var unmod = projTasks.filter(function(t) { return !t.moduleId; });
        if (unmod.length) modGroups.push({ mod: { id: null, name: '未分类' }, tasks: unmod });

        if (modGroups.length > 0) {
          html += '<div class="today-module-grid">';
          modGroups.forEach(function(mg) {
            html += '<div class="today-module-col">' +
              '<div class="today-module-name">' + escHtml(mg.mod.name) + '<span class="tmn-count">' + mg.tasks.length + '</span></div>' +
              mg.tasks.map(function(t) { return taskCardHTML(t); }).join('') +
            '</div>';
          });
          html += '</div>';
        }
      }
      html += '</div>';
    });

    // 未分项目
    var uncatTasks = allActive.filter(function(t) { return !t.projectId; });
    if (uncatTasks.length) {
      anyGroup = true;
      var uncatId = '__uncat';
      var isCollapsed = !!window._todayCollapsed[uncatId];
      var arrow = isCollapsed ? '▶' : '▼';
      html += '<div class="today-project-group">' +
        '<div class="today-project-header" onclick="toggleTodayGroup(\'' + uncatId + '\')">' +
          '<span class="tph-dot" style="background:#94a3b8"></span>' +
          '<span class="tph-name">未分类</span>' +
          '<span class="tph-count">' + uncatTasks.length + '</span>' +
          '<span class="tph-arrow">' + arrow + '</span>' +
        '</div>';
      if (!isCollapsed) {
        html += '<div class="today-module-grid"><div class="today-module-col">' +
          '<div class="today-module-name">未分类<span class="tmn-count">' + uncatTasks.length + '</span></div>' +
          uncatTasks.map(function(t) { return taskCardHTML(t); }).join('') +
        '</div></div>';
      }
      html += '</div>';
    }

    if (!anyGroup && !done.length) {
      html += renderEmptyState({ icon: 'sun', title: '今日没有待办任务', desc: '点击「快速添加任务」开始安排今天的工作', action: '<div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddTask()"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建任务</button></div>' });
    }
  }

  html += '</div>';
  document.getElementById('main-content').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  requestAnimationFrame(function() { staggerEntrance(); });

  // Store groups for dashboard clickable metrics
  window._dashboardGroups = { g0: g0, g1: g1, g2: g2, done: done };
}

// Today view helpers (on window for inline onclick)
window.toggleTodayGroup = function(projId) {
  window._todayCollapsed[projId] = !window._todayCollapsed[projId];
  render();
};

window.setTodayScope = function(scope) {
  window._todayFilterScope = scope;
  render();
};

window.setTodayGroupMode = function(mode) {
  window._todayGroupMode = mode;
  render();
};

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
        <div class="task-title">${escHtml(t.title)}</div>
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

window._taskViewMode = window._taskViewMode || 'card';
window._taskSortCol = window._taskSortCol || '';
window._taskSortDir = window._taskSortDir || 'asc';
window._taskListCollapsed = window._taskListCollapsed || {};

// ─── Task List ────────────────────────────────────────────────────────────────
function renderTaskList() {
  document.getElementById('header-title').textContent = '全部任务';
  document.getElementById('header-sub').textContent = '共 ' + state.tasks.length + ' 个任务';

  // 持久化筛选条件
  try {
    localStorage.setItem('pm_task_filters', JSON.stringify({
      filterProject: filterProject, filterStatus: filterStatus, filterAssignee: filterAssignee,
      filterModule: filterModule, filterTag: filterTag
    }));
  } catch(e) {}

  // 筛选
  var tasks = state.tasks.filter(function(t) {
    if (filterProject !== 'all' && t.projectId !== filterProject) return false;
    if (filterModule !== 'all' && t.moduleId !== filterModule) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterAssignee !== 'all' && t.assignee !== filterAssignee && !(t.assignees || []).includes(filterAssignee)) return false;
    if (filterTag !== 'all' && !(t.tags || []).includes(filterTag)) return false;
    if (searchQuery && !t.title.includes(searchQuery)) return false;
    return true;
  });

  // 排序
  if (window._taskSortCol) {
    tasks.sort(function(a, b) {
      var va, vb;
      switch (window._taskSortCol) {
        case 'title': va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase(); break;
        case 'due': va = a.due || '9999-12-31'; vb = b.due || '9999-12-31'; break;
        case 'status': va = _STATUS_ORDER_MAP[a.status] || 0; vb = _STATUS_ORDER_MAP[b.status] || 0; break;
        case 'priority': va = _PRIO_ORDER_MAP[a.priority] || 2; vb = _PRIO_ORDER_MAP[b.priority] || 2; break;
        case 'project': va = projName(a.projectId); vb = projName(b.projectId); break;
        default: return 0;
      }
      var cmp = va > vb ? 1 : va < vb ? -1 : 0;
      return window._taskSortDir === 'desc' ? -cmp : cmp;
    });
  } else {
    tasks.sort(function(a, b) { return urgencyOf(a) - urgencyOf(b) || priorityOrder(a.priority) - priorityOrder(b.priority); });
  }

  // 统计
  var countTodo = 0, countDoing = 0, countWaiting = 0, countDone = 0;
  var countTotal = tasks.length;
  tasks.forEach(function(t) {
    if (t.done || t.status === 'done') countDone++;
    else if (t.status === 'doing') countDoing++;
    else if (t.status === 'waiting') countWaiting++;
    else countTodo++;
  });

  var hasFilter = filterProject !== 'all' || filterStatus !== 'all' || filterAssignee !== 'all' || filterModule !== 'all' || filterTag !== 'all' || searchQuery !== '';

  // 项目下拉选项
  var projOpts = '<option value="all">全部项目</option>' + state.projects.map(function(p) {
    return '<option value="' + p.id + '"' + (filterProject === p.id ? ' selected' : '') + '>' + escHtml(p.name) + '</option>';
  }).join('');

  // 模块下拉选项（联动项目）
  var modsForProj = filterProject === 'all' ? state.modules : state.modules.filter(function(m) { return m.projectId === filterProject; });
  var modOpts = '<option value="all">全部模块</option>' + modsForProj.map(function(m) {
    return '<option value="' + m.id + '"' + (filterModule === m.id ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
  }).join('');

  // 成员下拉选项
  var memberOpts = '<option value="all">全部成员</option>' + state.members.map(function(m) {
    return '<option value="' + m.id + '"' + (filterAssignee === m.id ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
  }).join('');

  // 标签下拉选项
  var tagOpts = '<option value="all">全部标签</option>' + state.globalTags.map(function(tg) {
    return '<option value="' + tg.id + '"' + (filterTag === tg.id ? ' selected' : '') + '>' + escHtml(tg.name) + '</option>';
  }).join('');

  // 筛选栏
  var filterBarHTML = '<div class="task-filter-bar">' +
    '<div class="filter-group">' +
      '<select id="tf-project" onchange="applyTaskFilters()">' + projOpts + '</select>' +
      '<select id="tf-module" onchange="filterModule=this.value;render()">' + modOpts + '</select>' +
      '<select id="tf-status" onchange="filterStatus=this.value;render()">' +
        '<option value="all"' + (filterStatus === 'all' ? ' selected' : '') + '>全部状态</option>' +
        '<option value="todo"' + (filterStatus === 'todo' ? ' selected' : '') + '>待启动</option>' +
        '<option value="doing"' + (filterStatus === 'doing' ? ' selected' : '') + '>进行中</option>' +
        '<option value="waiting"' + (filterStatus === 'waiting' ? ' selected' : '') + '>待反馈</option>' +
        '<option value="done"' + (filterStatus === 'done' ? ' selected' : '') + '>已完成</option>' +
      '</select>' +
    '</div>' +
    '<div class="filter-group">' +
      '<select id="tf-assignee" onchange="filterAssignee=this.value;render()">' + memberOpts + '</select>' +
      '<select id="tf-tag" onchange="filterTag=this.value;render()">' + tagOpts + '</select>' +
      '<div class="search-input-wrap">' +
        '<input id="tf-search" placeholder="搜索任务名..." value="' + escHtml(searchQuery) + '" oninput="searchQuery=this.value;render()">' +
      '</div>' +
    '</div>' +
    '<div class="filter-actions">' +
      (hasFilter ? '<button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" onclick="clearAllTaskFilters()">✕ 清除</button>' : '') +
      '<div class="view-toggle">' +
        '<button class="vt-btn' + (window._taskViewMode === 'card' ? ' active' : '') + '" onclick="window._taskViewMode=\'card\';render()" title="卡片视图">☰</button>' +
        '<button class="vt-btn' + (window._taskViewMode === 'compact' ? ' active' : '') + '" onclick="window._taskViewMode=\'compact\';render()" title="紧凑视图">≡</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  // 统计摘要栏
  var summaryHTML = '<div class="task-summary-bar">' +
    '<span>共 <strong>' + countTotal + '</strong> 个任务</span>' +
    '<span class="pill pill-gray">' + countTodo + ' 待启动</span>' +
    '<span class="pill pill-blue">' + countDoing + ' 进行中</span>' +
    '<span class="pill pill-amber">' + countWaiting + ' 待反馈</span>' +
    '<span class="pill pill-green">' + countDone + ' 已完成</span>' +
  '</div>';

  // 内容区
  var contentHTML = '';
  if (window._taskViewMode === 'card') {
    contentHTML = renderTaskCardView(tasks);
  } else {
    contentHTML = renderTaskCompactView(tasks);
  }

  var html = '<div class="view-pane">' + filterBarHTML + summaryHTML + contentHTML + '</div>';
  document.getElementById('main-content').innerHTML = html;
  document.getElementById('main-content').scrollTop = 0;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// 卡片视图：按项目→模块分组
function renderTaskCardView(tasks) {
  if (!tasks.length) return renderEmptyState({ icon: 'list-checks', title: '没有匹配的任务', desc: '试试调整筛选条件或创建一个新任务' });

  var html = '';
  var memberMap = {};
  state.members.forEach(function(m) { memberMap[m.id] = m.name; });

  // 按项目分组
  var projGroups = [];
  var uncatTasks = [];
  var seenProj = {};
  state.projects.forEach(function(p) {
    var pt = tasks.filter(function(t) { return t.projectId === p.id; });
    if (pt.length) { projGroups.push({ proj: p, tasks: pt }); seenProj[p.id] = true; }
  });
  // 未分项目
  tasks.forEach(function(t) {
    if (!t.projectId || !seenProj[t.projectId]) uncatTasks.push(t);
  });
  if (uncatTasks.length) projGroups.push({ proj: { id: '', name: '未分类', colorIdx: 8 }, tasks: uncatTasks });

  projGroups.forEach(function(g) {
    var projId = g.proj.id || '__uncat';
    var projColor = (PROJ_COLORS[g.proj.colorIdx] || PROJ_COLORS[0])[0];
    var isCollapsed = !!window._taskListCollapsed[projId];
    var arrow = isCollapsed ? '▶' : '▼';
    var doneCount = g.tasks.filter(function(t) { return t.done || t.status === 'done'; }).length;
    var pct = g.tasks.length > 0 ? Math.round(doneCount / g.tasks.length * 100) : 0;

    html += '<div class="group-header-primary" onclick="toggleTaskListGroup(\'' + projId + '\')">' +
      '<span style="font-size:10px;color:var(--text3);width:14px;text-align:center">' + arrow + '</span>' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + projColor + ';flex-shrink:0"></span>' +
      '<span style="font-weight:600;font-size:14px;color:var(--text);flex:1">' + escHtml(g.proj.name) + '</span>' +
      '<span style="font-size:11px;color:var(--text3);font-family:var(--mono)">' + pct + '%</span>' +
      '<span style="font-size:11px;color:var(--text3);background:var(--surface3);border:1px solid var(--border);border-radius:10px;padding:1px 8px">' + g.tasks.length + '</span>' +
    '</div>';

    if (!isCollapsed) {
      // 按模块分组
      var mods = state.modules.filter(function(m) { return m.projectId === g.proj.id; }).sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
      var modGroups = [];
      mods.forEach(function(m) {
        var mt = g.tasks.filter(function(t) { return t.moduleId === m.id; });
        if (mt.length) modGroups.push({ mod: m, tasks: mt });
      });
      var unmod = g.tasks.filter(function(t) { return !t.moduleId; });
      if (unmod.length) modGroups.push({ mod: { id: null, name: '未分类' }, tasks: unmod });

      if (modGroups.length > 1 || (modGroups.length === 1 && modGroups[0].mod.id !== null)) {
        modGroups.forEach(function(mg) {
          var mKey = projId + '__' + (mg.mod.id || '__uncat');
          var mCollapsed = !!window._taskListCollapsed[mKey];
          var mArrow = mCollapsed ? '▶' : '▼';
          html += '<div class="group-header-secondary" onclick="event.stopPropagation();toggleTaskListGroup(\'' + mKey + '\')">' +
            '<span style="font-size:9px;color:var(--text3);width:12px;text-align:center">' + mArrow + '</span>' +
            '<span>' + escHtml(mg.mod.name) + '</span>' +
            '<span style="font-size:10px;color:var(--text3);background:var(--surface3);border-radius:8px;padding:0 6px">' + mg.tasks.length + '</span>' +
          '</div>';
          if (!mCollapsed) {
            html += mg.tasks.map(function(t) { return taskCardHTML(t); }).join('');
          }
        });
      } else {
        // 无模块或只有一个未分类模块，直接平铺任务
        html += g.tasks.map(function(t) { return taskCardHTML(t); }).join('');
      }
    }
  });

  return html;
}

// 紧凑视图：表格行模式
function renderTaskCompactView(tasks) {
  if (!tasks.length) return renderEmptyState({ icon: 'list-checks', title: '没有匹配的任务', desc: '试试调整筛选条件或创建一个新任务' });

  var sortArrow = function(col) {
    if (window._taskSortCol !== col) return '';
    return window._taskSortDir === 'asc' ? ' ▲' : ' ▼';
  };

  var thClass = function(col) { return window._taskSortCol === col ? ' class="sorted"' : ''; };

  var html = '<div style="overflow-x:auto"><table class="task-table"><thead><tr>' +
    '<th class="tt-check">☐</th>' +
    '<th class="tt-title"' + thClass('title') + ' onclick="sortTasksByCol(\'title\')">任务名称' + sortArrow('title') + '</th>' +
    '<th class="tt-project"' + thClass('project') + ' onclick="sortTasksByCol(\'project\')">项目' + sortArrow('project') + '</th>' +
    '<th class="tt-module">模块</th>' +
    '<th class="tt-due"' + thClass('due') + ' onclick="sortTasksByCol(\'due\')">截止日' + sortArrow('due') + '</th>' +
    '<th class="tt-status"' + thClass('status') + ' onclick="sortTasksByCol(\'status\')">状态' + sortArrow('status') + '</th>' +
    '<th class="tt-priority"' + thClass('priority') + ' onclick="sortTasksByCol(\'priority\')">优先级' + sortArrow('priority') + '</th>' +
    '<th class="tt-assignee">负责人</th>' +
  '</tr></thead><tbody>';

  html += tasks.map(function(t) { return taskRowHTML(t); }).join('');
  html += '</tbody></table></div>';
  return html;
}

// 紧凑视图单个任务行
function taskRowHTML(t) {
  var di = dueInfo(t), si = statusInfo(t.status);
  var pn = projName(t.projectId);
  var mn = moduleName(t.moduleId);
  var priCls = t.priority === '紧急' ? 'pill-red' : t.priority === '重要' ? 'pill-amber' : 'pill-gray';
  var memberMap = {};
  state.members.forEach(function(m) { memberMap[m.id] = m.name; });
  var assigneeNames = assigneeNamesStr(t, memberMap);

  return '<tr class="task-row' + (t.done ? ' done' : '') + '" onclick="openEditTask(\'' + t.id + '\')">' +
    '<td class="tt-check" onclick="event.stopPropagation()">' +
      '<div class="check-btn' + (t.done ? ' checked' : '') + '" onclick="toggleDone(\'' + t.id + '\')"></div>' +
    '</td>' +
    '<td class="tt-title">' + escHtml(t.title) + '</td>' +
    '<td class="tt-project"><span class="pill pill-project">' + pn + '</span></td>' +
    '<td class="tt-module">' + (mn !== '未分类' ? '<span class="pill pill-module">' + escHtml(mn) + '</span>' : '<span style="color:var(--text3)">—</span>') + '</td>' +
    '<td class="tt-due"><span class="pill ' + di.cls + '">' + di.text + '</span></td>' +
    '<td class="tt-status"><span class="pill ' + si.cls + '">' + si.lbl + '</span></td>' +
    '<td class="tt-priority"><span class="pill ' + priCls + '">' + escHtml(t.priority) + '</span></td>' +
    '<td class="tt-assignee">' + assigneeNames + '</td>' +
  '</tr>';
}

// 辅助函数
window.clearAllTaskFilters = function() {
  filterProject = 'all'; filterStatus = 'all'; filterAssignee = 'all';
  filterModule = 'all'; filterTag = 'all'; searchQuery = '';
  window._taskSortCol = ''; window._taskSortDir = 'asc';
  try { localStorage.removeItem('pm_task_filters'); } catch(e) {}
  render();
};

window.sortTasksByCol = function(col) {
  if (window._taskSortCol === col) {
    window._taskSortDir = window._taskSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window._taskSortCol = col;
    window._taskSortDir = 'asc';
  }
  render();
};

window.toggleTaskListGroup = function(key) {
  window._taskListCollapsed[key] = !window._taskListCollapsed[key];
  render();
};

window.applyTaskFilters = function() {
  var sel = document.getElementById('tf-project');
  if (sel) {
    filterProject = sel.value;
    filterModule = 'all'; // 项目切换时重置模块
  }
  render();
};

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
        <div><div class="proj-name" style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;background:${color};border-radius:50%;display:inline-block;flex-shrink:0"></span>${escHtml(p.name)}</div></div>
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
  /* UI-V18: TASK-UI-13 */
  if (!state.projects.length) html += renderEmptyState({icon:'folder-open',title:'还没有项目',desc:'创建项目来组织你的任务',action:'<div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddProject()"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建项目</button></div>'});
  html += '</div></div>';
  document.getElementById('main-content').innerHTML = html;
}

// ─── Single Project ───────────────────────────────────────────────────────────
window._projKanbanGroup = window._projKanbanGroup || 'status';
window._projModuleFilter = '';

function renderProjectView(pid) {
  const proj = state.projects.find(function(p) { return p.id === pid; });
  if (!proj) { switchView('today'); return; }
  var rawTasks = state.tasks.filter(function(t) { return t.projectId === pid; });
  // 模块筛选
  if (window._projModuleFilter) {
    rawTasks = rawTasks.filter(function(t) { return t.moduleId === window._projModuleFilter; });
  }
  var tasks = rawTasks;
  const mode = projectViewMode[pid] || 'list';
  const color = PROJ_COLORS[(proj.colorIdx||0)%PROJ_COLORS.length];
  const doneCnt = tasks.filter(function(t) { return t.done; }).length;
  const pct = tasks.length ? Math.round(doneCnt/tasks.length*100) : 0;

  document.getElementById('header-title').textContent = '项目详情';
  document.getElementById('header-sub').textContent = proj.name + ' · ' + tasks.length + ' 个任务 · ' + pct + '% 完成';
  document.getElementById('header-add-btn').style.display = 'block';

  const memberAvatars = (proj.members||[]).map(function(mid) { return '<div class="member-avatar" style="background:' + memberColor(mid) + '" title="' + memberName(mid) + '">' + memberInitial(mid) + '</div>'; }).join('');

  // 视图切换 tab
  var kanbanGroup = window._projKanbanGroup || 'status';
  var viewToggle = '<div class="proj-view-tabs">' +
    '<button class="pvt-btn' + (mode === 'list' ? ' active' : '') + '" onclick="projectViewMode[\'' + pid + '\']=\'list\';renderProjectView(\'' + pid + '\')">☰ 列表</button>' +
    '<button class="pvt-btn' + (mode === 'kanban' ? ' active' : '') + '" onclick="projectViewMode[\'' + pid + '\']=\'kanban\';renderProjectView(\'' + pid + '\')">⬛ 看板</button>';
  if (mode === 'kanban') {
    viewToggle += '<div class="pvt-sub" id="kanban-group-toggle">' +
      '<span class="pvt-label">分组:</span>' +
      '<span class="pvt-chip' + (kanbanGroup === 'status' ? ' active' : '') + '" onclick="setProjKanbanGroup(\'status\',\'' + pid + '\')">按状态</span>' +
      '<span class="pvt-chip' + (kanbanGroup === 'module' ? ' active' : '') + '" onclick="setProjKanbanGroup(\'module\',\'' + pid + '\')">按模块</span>' +
    '</div>';
  }
  viewToggle += '</div>';

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

  // V20: 模块面板
  var canManage = isAdmin() || getEffectiveMenuPerms().includes('add_task');
  var mods = state.modules
    .filter(function(m) { return m.projectId === pid; })
    .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  var modChips = mods.map(function(m) {
    var isActive = window._projModuleFilter === m.id;
    return '<div class="module-chip' + (isActive ? ' active' : '') + '" onclick="event.stopPropagation();setProjModuleFilter(\'' + (isActive ? '' : m.id) + '\',\'' + pid + '\')">' + escHtml(m.name) +
      (canManage ? '<span class="edit-btn" onclick="event.stopPropagation();openEditModule(\'' + m.id + '\')"><i data-lucide="pencil" style="width:11px;height:11px"></i></span>' : '') +
      '</div>';
  }).join('');
  // 清除筛选按钮
  if (window._projModuleFilter) {
    modChips += ' <span style="font-size:11px;color:var(--accent);cursor:pointer;margin-left:4px" onclick="event.stopPropagation();setProjModuleFilter(\'\',\'' + pid + '\')">✕ 清除</span>';
  }
  var addBtn = canManage
    ? '<button class="btn btn-ghost btn-sm" onclick="openAddModule(\'' + pid + '\')">+ 新建模块</button>'
    : '';
  var modulePanel = '<div class="modules-panel">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
      '<span style="font-size:13px;font-weight:600;color:var(--text2)">模块 (' + mods.length + ')</span>' +
      addBtn +
    '</div>' +
    '<div class="module-list">' +
      (modChips || '<span style="font-size:12px;color:var(--text3)">暂无模块，点击右侧新建</span>') +
    '</div>' +
  '</div>';

  let contentHTML = '';

  if (mode === 'kanban') {
    if (kanbanGroup === 'module') {
      // 按模块看板
      var kanbanMods = mods.concat([{ id: null, name: '未分类' }]);
      var colsHTML = kanbanMods.map(function(m) {
        var colTasks = tasks.filter(function(t) { return (t.moduleId || null) === m.id; });
        var colColor = m.id ? 'var(--purple)' : 'var(--text3)';
        var cards = colTasks.map(function(t) { return taskCardHTML(t); }).join('');
        return '<div style="flex:1;min-width:220px;max-width:320px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;background:var(--surface);border-radius:var(--radius-sm)">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + colColor + ';flex-shrink:0"></span>' +
            '<span style="font-size:13px;font-weight:600;color:var(--text)">' + escHtml(m.name) + '</span>' +
            '<span style="font-size:11px;color:var(--text3);margin-left:auto;background:var(--surface2);padding:1px 7px;border-radius:10px">' + colTasks.length + '</span>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            (cards || '<div style="font-size:12px;color:var(--text3);padding:12px;text-align:center">暂无任务</div>') +
          '</div>' +
        '</div>';
      }).join('');
      contentHTML = '<div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;align-items:flex-start">' + colsHTML + '</div>';
    } else {
      // 按状态看板（原有逻辑）
      const COLS = [
        { key:'todo',    label:'待启动', color:'var(--text3)' },
        { key:'doing',   label:'进行中', color:'var(--blue)' },
        { key:'waiting', label:'待反馈', color:'var(--amber)' },
        { key:'done',    label:'已完成', color:'var(--green)' },
      ];
      var colsHTML = COLS.map(function(col) {
        var colTasks = tasks.filter(function(t) {
          var s = t.status || 'todo';
          if (col.key === 'done') return s === 'done' || t.done;
          return s === col.key && !t.done;
        });
        var cards = colTasks.map(function(t) { return taskCardHTML(t); }).join('');
        return '<div style="flex:1;min-width:220px;max-width:320px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;background:var(--surface);border-radius:var(--radius-sm)">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:' + col.color + ';flex-shrink:0"></span>' +
            '<span style="font-size:13px;font-weight:600;color:var(--text)">' + col.label + '</span>' +
            '<span style="font-size:11px;color:var(--text3);margin-left:auto;background:var(--surface2);padding:1px 7px;border-radius:10px">' + colTasks.length + '</span>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            (cards || '<div style="font-size:12px;color:var(--text3);padding:12px;text-align:center">暂无任务</div>') +
          '</div>' +
        '</div>';
      }).join('');
      contentHTML = '<div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;align-items:flex-start">' + colsHTML + '</div>';
    }
  } else {
    // V20: 按模块分组渲染任务列表
    var groups = mods.concat([{ id: null, name: '未分类' }]);
    groups.forEach(function(grp) {
      var grpTasks = tasks.filter(function(t) { return (t.moduleId || null) === grp.id; });
      // 过滤：已完成的任务只在未分类组展示
      if (grp.id !== null) grpTasks = grpTasks.filter(function(t) { return !t.done; });
      var activeGrp = grpTasks.filter(function(t) { return !t.done; });
      var doneGrp = grpTasks.filter(function(t) { return t.done; });
      var isVirtual = grp.id === null;
      var editBtn = (!isVirtual && canManage)
        ? '<button class="icon-btn" onclick="event.stopPropagation();openEditModule(\'' + grp.id + '\')" title="编辑模块"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>'
        : '';
      // 未分类组：先活跃后完成
      if (isVirtual) {
        var sortedActive = activeGrp.sort(function(a,b) { return urgencyOf(a)-urgencyOf(b)||priorityOrder(a.priority)-priorityOrder(b.priority); });
        if (sortedActive.length) contentHTML += sortedActive.map(taskCardHTML).join('');
        if (doneGrp.length) contentHTML += '<div class="task-group" style="margin-top:20px"><div class="group-header"><div class="group-dot" style="background:#b8b5ae"></div><span class="group-title">已完成</span><span class="group-count">' + doneGrp.length + '</span></div>' + doneGrp.map(taskCardHTML).join('') + '</div>';
      } else {
        contentHTML += '<div class="module-group">' +
          '<div class="module-group-header">' +
            '<span class="module-group-name">' + escHtml(grp.name) + '</span>' +
            '<span class="module-task-count">' + grpTasks.length + '</span>' +
            editBtn +
            '<button class="module-add-task-btn" onclick="openAddTask(\'' + pid + '\',\'' + (grp.id || '') + '\')">+ 新建任务</button>' +
          '</div>' +
          (grpTasks.length ? grpTasks.sort(function(a,b) { return urgencyOf(a)-urgencyOf(b)||priorityOrder(a.priority)-priorityOrder(b.priority); }).map(taskCardHTML).join('') : '<div class="module-empty">暂无任务</div>') +
        '</div>';
      }
    });
    if (!tasks.length) contentHTML += '<div class="empty-state"><i data-lucide="clipboard-list" class="empty-icon"></i>这个项目还没有任务<div class="empty-hint">开始规划第一个任务吧</div><div class="empty-action"><button class="btn btn-primary btn-sm" onclick="openAddTask(\'' + pid + '\')"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建任务</button></div></div>';
  }

  document.getElementById('main-content').innerHTML = `
    <div class="view-pane">
      ${viewToggle}
      ${progressBar}
      ${modulePanel}
      ${contentHTML}
    </div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  requestAnimationFrame(function() { staggerEntrance(); });
}

// 项目详情视图辅助函数
window.setProjKanbanGroup = function(mode, pid) {
  window._projKanbanGroup = mode;
  renderProjectView(pid);
};

window.setProjModuleFilter = function(modId, pid) {
  window._projModuleFilter = modId;
  renderProjectView(pid);
};

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
    projBarsHTML += renderEmptyState({icon:'bar-chart-3',title:'暂无项目数据',desc:'创建项目后这里会展示进度'});
  } else {
    state.projects.forEach(p => {
      const tasks = state.tasks.filter(t=>t.projectId===p.id);
      const doneCnt = tasks.filter(t=>t.done).length;
      const pct = tasks.length?Math.round(doneCnt/tasks.length*100):0;
      const color = PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length];
      projBarsHTML += `<div class="proj-progress-row" onclick="showProjectTaskList('${p.id}')" data-tip="${escHtml(p.name)}: ${doneCnt}/${tasks.length} 完成 · ${pct}%" style="cursor:pointer" title="点击查看详情">
        <div class="proj-progress-label">
          <span class="proj-progress-name">${escHtml(p.name)}</span>
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
    return `<div class="chart-bar-row" onclick="showPriorityTaskList('${d.label}')" data-tip="${d.label}优先级: ${d.count} 个任务 (${Math.round(d.count/priTotal*100)}%)" style="cursor:pointer" title="点击查看详情">
      <span class="chart-bar-label">${d.label}</span>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${w}%;background:${d.color}"></div></div>
      <span class="chart-bar-val">${d.count}</span>
    </div>`;
  }).join('');

  // Member workload
  let membersHTML = '';
  if (state.members.length) {
    const active = state.tasks.filter(t=>!t.done);
    const maxTask = Math.max(1, ...state.members.map(m => active.filter(t=>t.assignee===m.id || (t.assignees||[]).includes(m.id)).length));
    membersHTML = state.members.map(m => {
      const myTasks = active.filter(t=>t.assignee===m.id || (t.assignees||[]).includes(m.id));
      const cnt = myTasks.length;
      const doneCnt = state.tasks.filter(t=>(t.assignee===m.id || (t.assignees||[]).includes(m.id))&&t.done).length;
      const totalMine = cnt + doneCnt || 1;
      const pct = Math.round(doneCnt/totalMine*100);
      const w = Math.max(2, Math.round(cnt/maxTask*100));
      const color = memberColor(m.id);
      return `<div class="chart-bar-row" onclick="showMemberTaskList('${m.id}')" data-tip="${escHtml(m.name)}: ${cnt} 个待办任务 · 完成率 ${pct}%" style="cursor:pointer" title="点击查看详情">
        <span class="chart-bar-label" style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>${escHtml(m.name)}</span>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${w}%;background:${color}"></div></div>
        <span class="chart-bar-val" style="font-size:11px">${cnt} 待办 · ${pct}% 完成</span>
      </div>`;
    }).join('');
  } else {
    membersHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">暂无成员数据</div>';
  }

  // Burndown
  const burndownOpts = `<option value="all">全部项目</option>` +
    state.projects.map(p=>`<option value="${p.id}">${escHtml(p.name)}</option>`).join('');

  let html = `<div class="view-pane">
    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-title">任务状态分布
          <span style="font-size:11px;font-weight:400;color:var(--text3)">共 ${total} 个</span>
        </div>
        <div style="display:flex;align-items:center;gap:24px">
          <div style="flex-shrink:0">${donutSVG}</div>
          <div class="chart-legend" style="flex-direction:column;gap:8px">
            ${donutData.map(d=>`<div class="legend-item" onclick="showStatusTaskList('${d.label==='待启动'?'todo':d.label==='进行中'?'doing':d.label==='待反馈'?'waiting':'done'}')" style="cursor:pointer" title="点击查看详情"><div class="legend-dot" style="background:${d.color}"></div><span style="font-size:13px">${d.label}</span><span style="font-family:var(--mono);font-size:13px;color:var(--text);font-weight:600;margin-left:auto">${d.count}</span></div>`).join('')}
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
      const statusMap = { '待启动': 'todo', '进行中': 'doing', '待反馈': 'waiting', '已完成': 'done' };
      svg += `<path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi1},${yi1} A${ir},${ir} 0 ${large},0 ${xi2},${yi2} Z" fill="${d.color}" onclick="showStatusTaskList('${statusMap[d.label]}')" style="cursor:pointer" title="点击查看${d.label}任务"/>`;
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
    ${log.map((l,i)=>`<circle cx="${toX(i)}" cy="${toY(l.remaining)}" r="10" fill="transparent" stroke="none" data-tip="${l.date}: 剩余 ${l.remaining} 个任务" style="cursor:pointer" onclick="showBurndownDayTasks('${projId}','${l.date}')"/>`).join('')}
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
  let createdDots = days.map((d, i) => `<circle cx="${toX(i)}" cy="${toY(createdByDay[d])}" r="8" fill="transparent" stroke="none" data-tip="${d}: 新建 ${createdByDay[d]} 个任务" style="cursor:pointer" onclick="showDayTaskList('${d}','created')"/>`).join('');
  let completedDots = days.map((d, i) => `<circle cx="${toX(i)}" cy="${toY(completedByDay[d])}" r="8" fill="transparent" stroke="none" data-tip="${d}: 完成 ${completedByDay[d]} 个任务" style="cursor:pointer" onclick="showDayTaskList('${d}','completed')"/>`).join('');

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

// ─── Chart click-to-detail modals ──────────────────────────────────────────────
function showStatusTaskList(status) {
  const statusLabels = { todo: '待启动', doing: '进行中', waiting: '待反馈', done: '已完成' };
  const label = statusLabels[status] || status;
  const tasks = state.tasks.filter(t => t.status === status);
  const projMap = {};
  state.projects.forEach(p => { projMap[p.id] = p.name; });
  const memberMap = {};
  state.members.forEach(m => { memberMap[m.id] = m.name; });
  const rows = tasks.length
    ? tasks.map(t => `<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.title)}">${escHtml(t.title)}</td>
      <td style="white-space:nowrap">${escHtml(projMap[t.projectId]||'—')}</td>
      <td style="white-space:nowrap">${escHtml(assigneeNamesStr(t, memberMap))}</td>
      <td style="white-space:nowrap">${t.due||'—'}</td>
      <td>${t.done?'✅':'—'}</td>
    </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">暂无数据</td></tr>`;
  openModal(modalHeader('任务状态：' + label) +
    `<div class="modal-body" style="padding:16px 20px">
      <div style="margin-bottom:12px;font-size:12px;color:var(--text3)">共 ${tasks.length} 个任务</div>
      <div style="max-height:60vh;overflow:auto">
        <table class="data-table" style="width:100%"><thead><tr><th>任务名称</th><th>项目</th><th>负责人</th><th>截止</th><th>完成</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>` +
    `<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

function showPriorityTaskList(priority) {
  const tasks = state.tasks.filter(t => !t.done && t.priority === priority);
  const projMap = {};
  state.projects.forEach(p => { projMap[p.id] = p.name; });
  const memberMap = {};
  state.members.forEach(m => { memberMap[m.id] = m.name; });
  const rows = tasks.length
    ? tasks.map(t => `<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.title)}">${escHtml(t.title)}</td>
      <td style="white-space:nowrap">${escHtml(projMap[t.projectId]||'—')}</td>
      <td style="white-space:nowrap">${escHtml(assigneeNamesStr(t, memberMap))}</td>
      <td style="white-space:nowrap">${t.due||'—'}</td>
      <td><span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;background:var(--surface2)">${priority}</span></td>
    </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">暂无数据</td></tr>`;
  openModal(modalHeader('优先级：' + priority + '（待办）') +
    `<div class="modal-body" style="padding:16px 20px">
      <div style="margin-bottom:12px;font-size:12px;color:var(--text3)">共 ${tasks.length} 个待办任务</div>
      <div style="max-height:60vh;overflow:auto">
        <table class="data-table" style="width:100%"><thead><tr><th>任务名称</th><th>项目</th><th>负责人</th><th>截止</th><th>优先级</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>` +
    `<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

function showProjectTaskList(projectId) {
  const proj = state.projects.find(p => p.id === projectId);
  const tasks = state.tasks.filter(t => t.projectId === projectId);
  const memberMap = {};
  state.members.forEach(m => { memberMap[m.id] = m.name; });
  const doneCnt = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round(doneCnt / tasks.length * 100) : 0;
  const statusLabels = { todo: '待启动', doing: '进行中', waiting: '待反馈', done: '已完成' };
  const rows = tasks.length
    ? tasks.map(t => `<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.title)}">${escHtml(t.title)}</td>
      <td style="white-space:nowrap">${statusLabels[t.status]||t.status}</td>
      <td style="white-space:nowrap">${escHtml(t.priority)}</td>
      <td style="white-space:nowrap">${escHtml(assigneeNamesStr(t, memberMap))}</td>
      <td style="white-space:nowrap">${t.due||'—'}</td>
      <td>${t.done?'✅':'—'}</td>
    </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">暂无任务</td></tr>`;
  openModal(modalHeader('项目：' + (proj ? proj.name : projectId)) +
    `<div class="modal-body" style="padding:16px 20px">
      <div style="margin-bottom:12px;font-size:12px;color:var(--text3)">${tasks.length} 个任务 · ${doneCnt} 完成 · ${pct}%</div>
      <div style="max-height:60vh;overflow:auto">
        <table class="data-table" style="width:100%"><thead><tr><th>任务名称</th><th>状态</th><th>优先级</th><th>负责人</th><th>截止</th><th>完成</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>` +
    `<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

function showMemberTaskList(memberId) {
  const member = state.members.find(m => m.id === memberId);
  const tasks = state.tasks.filter(t => t.assignee === memberId || (t.assignees||[]).includes(memberId));
  const projMap = {};
  state.projects.forEach(p => { projMap[p.id] = p.name; });
  const doneCnt = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round(doneCnt / tasks.length * 100) : 0;
  const statusLabels = { todo: '待启动', doing: '进行中', waiting: '待反馈', done: '已完成' };
  const rows = tasks.length
    ? tasks.map(t => `<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.title)}">${escHtml(t.title)}</td>
      <td style="white-space:nowrap">${escHtml(projMap[t.projectId]||'—')}</td>
      <td style="white-space:nowrap">${statusLabels[t.status]||t.status}</td>
      <td style="white-space:nowrap">${escHtml(t.priority)}</td>
      <td style="white-space:nowrap">${t.due||'—'}</td>
      <td>${t.done?'✅':'—'}</td>
    </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">暂无任务</td></tr>`;
  openModal(modalHeader('成员：' + (member ? member.name : memberId)) +
    `<div class="modal-body" style="padding:16px 20px">
      <div style="margin-bottom:12px;font-size:12px;color:var(--text3)">${tasks.length} 个任务 · ${doneCnt} 完成 · ${pct}% · 待办 ${tasks.length-doneCnt} 个</div>
      <div style="max-height:60vh;overflow:auto">
        <table class="data-table" style="width:100%"><thead><tr><th>任务名称</th><th>项目</th><th>状态</th><th>优先级</th><th>截止</th><th>完成</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>` +
    `<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

function showDayTaskList(date, type) {
  const label = type === 'created' ? '新建' : '完成';
  const statusLabels = { todo: '待启动', doing: '进行中', waiting: '待反馈', done: '已完成' };
  const projMap = {};
  state.projects.forEach(p => { projMap[p.id] = p.name; });
  const memberMap = {};
  state.members.forEach(m => { memberMap[m.id] = m.name; });
  let tasks;
  if (type === 'created') {
    tasks = state.tasks.filter(t => t.createdAt && t.createdAt.slice(0, 10) === date);
  } else {
    tasks = state.tasks.filter(t => t.completedAt && t.completedAt.slice(0, 10) === date);
  }
  const rows = tasks.length
    ? tasks.map(t => `<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.title)}">${escHtml(t.title)}</td>
      <td style="white-space:nowrap">${escHtml(projMap[t.projectId]||'—')}</td>
      <td style="white-space:nowrap">${statusLabels[t.status]||t.status}</td>
      <td style="white-space:nowrap">${escHtml(assigneeNamesStr(t, memberMap))}</td>
      <td style="white-space:nowrap">${t.due||'—'}</td>
    </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">暂无数据</td></tr>`;
  openModal(modalHeader(date + ' · ' + label + '任务') +
    `<div class="modal-body" style="padding:16px 20px">
      <div style="margin-bottom:12px;font-size:12px;color:var(--text3)">共 ${tasks.length} 个任务</div>
      <div style="max-height:60vh;overflow:auto">
        <table class="data-table" style="width:100%"><thead><tr><th>任务名称</th><th>项目</th><th>状态</th><th>负责人</th><th>截止</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>` +
    `<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

function showBurndownDayTasks(projId, date) {
  const projLabel = projId === 'all' ? '全部项目' : (state.projects.find(p => p.id === projId) || {}).name || projId;
  const remaining = state.burndownLog[projId]
    ? (state.burndownLog[projId].find(l => l.date === date) || {}).remaining
    : null;
  const tasks = projId === 'all'
    ? state.tasks.filter(t => !t.done)
    : state.tasks.filter(t => t.projectId === projId && !t.done);
  const projMap = {};
  state.projects.forEach(p => { projMap[p.id] = p.name; });
  const memberMap = {};
  state.members.forEach(m => { memberMap[m.id] = m.name; });
  const rows = tasks.length
    ? tasks.map(t => `<tr>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.title)}">${escHtml(t.title)}</td>
      <td style="white-space:nowrap">${escHtml(projMap[t.projectId]||'—')}</td>
      <td style="white-space:nowrap">${escHtml(assigneeNamesStr(t, memberMap))}</td>
      <td style="white-space:nowrap">${t.due||'—'}</td>
    </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px">暂无待办任务</td></tr>`;
  openModal(modalHeader('燃尽图 · ' + date + ' · ' + projLabel) +
    `<div class="modal-body" style="padding:16px 20px">
      <div style="margin-bottom:12px;font-size:12px;color:var(--text3)">快照剩余：${remaining != null ? remaining : '—'} 个 · 当前待办：${tasks.length} 个</div>
      <div style="max-height:60vh;overflow:auto">
        <table class="data-table" style="width:100%"><thead><tr><th>任务名称</th><th>项目</th><th>负责人</th><th>截止</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>` +
    `<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`);
}

// ─── Gantt ────────────────────────────────────────────────────────────────────
let ganttDayW = 42;
var projectViewMode = {}; // { [pid]: 'list' | 'kanban' }
// Gantt 排序 / 筛选 / 折叠状态（跨重渲染保持）
window._ganttSort           = window._ganttSort           || 'due';  // due|priority|status|title
window._ganttFilterStatus   = window._ganttFilterStatus   || '';     // ''=全部 | todo|doing|waiting|done
window._ganttFilterAssignee = window._ganttFilterAssignee || '';     // ''=全部 | member id
if (window._ganttCollapsed === undefined) window._ganttCollapsed = null; // null=首次渲染时自动折叠

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

  // ── 首次渲染：自动折叠所有项目组 ──────────────────────────────────────────
  if (window._ganttCollapsed === null) {
    window._ganttCollapsed = {};
    groups.forEach(g => {
      window._ganttCollapsed[g.proj.id || '__uncat'] = true;
    });
  }

  groups.forEach(g => {
    // ── 筛选 ─────────────────────────────────────────────────────────────────
    if (window._ganttFilterProject && g.proj.id !== window._ganttFilterProject) return;
    let tasks = g.tasks;
    if (window._ganttFilterStatus)   tasks = tasks.filter(t => t.status === window._ganttFilterStatus);
    if (window._ganttFilterAssignee) tasks = tasks.filter(t => t.assignee === window._ganttFilterAssignee || (t.assignees||[]).includes(window._ganttFilterAssignee));
    if (window._ganttFilterModule)   tasks = tasks.filter(t => t.moduleId === window._ganttFilterModule);
    if (!tasks.length) return;

    // ── 排序 ─────────────────────────────────────────────────────────────────
    tasks = [...tasks].sort((a, b) => {
      if (window._ganttSort === 'due')      return (a.due || '9999-12-31') > (b.due || '9999-12-31') ? 1 : -1;
      if (window._ganttSort === 'priority') return (_PRIO_ORDER_MAP[a.priority] ?? 2) - (_PRIO_ORDER_MAP[b.priority] ?? 2);
      if (window._ganttSort === 'status')   return (_STATUS_ORDER_MAP[a.status] ?? 0) - (_STATUS_ORDER_MAP[b.status] ?? 0);
      return (a.title || '') > (b.title || '') ? 1 : -1; // title
    });

    const color = PROJ_COLORS[(g.proj.colorIdx||0)%PROJ_COLORS.length];
    const collapseKey = g.proj.id || '__uncat';
    const isCollapsed = !!window._ganttCollapsed[collapseKey];
    const arrow = isCollapsed ? '▶' : '▼';
    const visCount = tasks.length;

    leftHTML += `<div class="gantt-group-header gantt-group-toggle" style="border-left:3px solid ${color}" onclick="window._ganttCollapsed['${collapseKey}']=!window._ganttCollapsed['${collapseKey}'];renderGantt()">
      <span class="gantt-collapse-arrow">${arrow}</span>
      ${escHtml(g.proj.name)}
      <span class="gantt-group-count">${visCount}</span>
    </div>`;
    rightHTML += `<div class="gantt-group-header-right" style="width:${chartWidth}px"></div>`;

    if (!isCollapsed) {
      // V22: 按模块二级分组
      var projMods = state.modules.filter(function(m) { return m.projectId === g.proj.id; }).sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
      var modGroups = [];
      projMods.forEach(function(m) {
        var mt = tasks.filter(function(t) { return t.moduleId === m.id; });
        if (mt.length) modGroups.push({ mod: m, tasks: mt });
      });
      var unmodTasks = tasks.filter(function(t) { return !t.moduleId; });
      if (unmodTasks.length) modGroups.push({ mod: { id: null, name: '未分类' }, tasks: unmodTasks });

      // 如果没有进行模块筛选且存在模块分组，渲染二级分组
      if (!window._ganttFilterModule && modGroups.length > 1) {
        modGroups.forEach(function(mg) {
          var modCollapseKey = collapseKey + '__' + (mg.mod.id || '__uncat');
          var modCollapsed = !!window._ganttCollapsed[modCollapseKey];
          var modArrow = modCollapsed ? '▶' : '▼';

          leftHTML += '<div class="gantt-module-header gantt-module-toggle" onclick="window._ganttCollapsed[\'' + modCollapseKey + '\']=!window._ganttCollapsed[\'' + modCollapseKey + '\'];renderGantt()">' +
            '<span class="gantt-collapse-arrow">' + modArrow + '</span>' +
            escHtml(mg.mod.name) +
            '<span class="gantt-group-count" style="font-size:9px">' + mg.tasks.length + '</span>' +
          '</div>';
          rightHTML += '<div class="gantt-module-header-right" style="width:' + chartWidth + 'px"></div>';

          if (!modCollapsed) {
          mg.tasks.forEach(function(t) { var row = renderGanttTaskRow(t, color, minDate, chartWidth, ganttDayW, today, todayStr); leftHTML += row.leftHTML; rightHTML += row.rightHTML; });
        }
      });
    } else {
      // 无模块分组或只有未分类，直接平铺任务行
      tasks.forEach(function(t) { var row = renderGanttTaskRow(t, color, minDate, chartWidth, ganttDayW, today, todayStr); leftHTML += row.leftHTML; rightHTML += row.rightHTML; });
      }
    }
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

  // ── 构建筛选下拉选项 ───────────────────────────────────────────────────────
  const _ganttMemberOpts = state.members.map(m =>
    `<option value="${m.id}" ${window._ganttFilterAssignee===m.id?'selected':''}>${escHtml(m.name)}</option>`
  ).join('');
  const _ganttStatusLabels = {todo:'待启动',doing:'进行中',waiting:'待反馈',done:'已完成'};
  const _ganttStatusOpts = Object.entries(_ganttStatusLabels).map(([v,l]) =>
    `<option value="${v}" ${window._ganttFilterStatus===v?'selected':''}>${l}</option>`
  ).join('');
  const _ganttSortLabels = {due:'截止日期',priority:'优先级',status:'状态',title:'任务名称'};
  const _ganttSortOpts = Object.entries(_ganttSortLabels).map(([v,l]) =>
    `<option value="${v}" ${window._ganttSort===v?'selected':''}>${l}</option>`
  ).join('');
  // FEAT-GANTT-FILTER: 项目 + 模块联动筛选
  const _ganttProjOpts = state.projects.map(p =>
    `<option value="${p.id}" ${window._ganttFilterProject===p.id?'selected':''}>${escHtml(p.name)}</option>`
  ).join('');
  const _ganttModOpts = state.modules
    .filter(m => !window._ganttFilterProject || m.projectId === window._ganttFilterProject)
    .map(m => `<option value="${m.id}" ${window._ganttFilterModule===m.id?'selected':''}>${escHtml(m.name)}</option>`
  ).join('');
  // 计算当前筛选结果数量
  let _ganttVisibleCount = 0;
  groups.forEach(g => {
    if (window._ganttFilterProject && g.proj.id !== window._ganttFilterProject) return;
    let t = g.tasks;
    if (window._ganttFilterStatus)   t = t.filter(x => x.status === window._ganttFilterStatus);
    if (window._ganttFilterAssignee) t = t.filter(x => x.assignee === window._ganttFilterAssignee || (x.assignees||[]).includes(window._ganttFilterAssignee));
    if (window._ganttFilterModule)   t = t.filter(x => x.moduleId === window._ganttFilterModule);
    _ganttVisibleCount += t.length;
  });
  const _hasFilter = window._ganttFilterStatus || window._ganttFilterAssignee || window._ganttFilterProject || window._ganttFilterModule;

  const html = `<div class="view-pane">
    <div class="gantt-toolbar">
      <div class="gantt-toolbar-row">
        <div class="gantt-toolbar-left">
          <div class="gantt-week-group">
            <button class="gantt-week-btn" onclick="ganttScrollToday()">今天</button>
            <button class="gantt-week-btn" onclick="ganttJumpToWeek(0)">本周</button>
            <button class="gantt-week-btn" onclick="ganttJumpToWeek(1)">下周</button>
          </div>
          <div class="gantt-divider"></div>
          <select class="gantt-ctrl-select" title="按项目筛选" onchange="window._ganttFilterProject=this.value;window._ganttFilterModule='';renderGantt()">
            <option value="">全部项目</option>
            ${_ganttProjOpts}
          </select>
          <select class="gantt-ctrl-select" title="按模块筛选" onchange="window._ganttFilterModule=this.value;renderGantt()">
            <option value="">全部模块</option>
            ${_ganttModOpts}
          </select>
          <select class="gantt-ctrl-select" title="按状态筛选" onchange="window._ganttFilterStatus=this.value;renderGantt()">
            <option value="" ${!window._ganttFilterStatus?'selected':''}>全部状态</option>
            ${_ganttStatusOpts}
          </select>
          <select class="gantt-ctrl-select" title="按负责人筛选" onchange="window._ganttFilterAssignee=this.value;renderGantt()">
            <option value="" ${!window._ganttFilterAssignee?'selected':''}>全部成员</option>
            ${_ganttMemberOpts}
          </select>
          ${_hasFilter ? '<button class="gantt-ctrl-clear" onclick="window._ganttFilterStatus=\'\';window._ganttFilterAssignee=\'\';window._ganttFilterProject=\'\';window._ganttFilterModule=\'\';renderGantt()" title="清除筛选">✕ 清除</button>' : ''}
        </div>
      </div>
      <div class="gantt-toolbar-row">
        <div class="gantt-toolbar-left">
          <span class="gantt-ctrl-label">排序</span>
          <select class="gantt-ctrl-select" onchange="window._ganttSort=this.value;renderGantt()">
            ${_ganttSortOpts}
          </select>
          <div class="gantt-divider"></div>
          <span class="gantt-ctrl-label">缩放</span>
          <div class="gantt-zoom-group">
            <button class="gantt-zoom-btn${ganttDayW===20?' active':''}" onclick="setGanttZoom(20)">−</button>
            <button class="gantt-zoom-btn${ganttDayW===42?' active':''}" onclick="setGanttZoom(42)">+</button>
          </div>
        </div>
        <div class="gantt-toolbar-right">
          <button class="gantt-ctrl-expand" onclick="ganttExpandAll()" title="展开所有分组">展开全部</button>
          <button class="gantt-ctrl-expand" onclick="ganttCollapseAll()" title="折叠所有分组">折叠全部</button>
          ${_hasFilter ? '<span class="gantt-filter-badge">已筛选 ' + _ganttVisibleCount + ' 个任务</span>' : ''}
          <span class="gantt-drag-hint">ⓘ 可拖拽调整日期</span>
        </div>
      </div>
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
  // 依赖关系连线（双帧确保 DOM 已稳定）
  requestAnimationFrame(function() {
    requestAnimationFrame(drawGanttDepLines);
  });
}

function renderGanttTaskRow(t, color, minDate, chartWidth, ganttDayW, today, todayStr) {
  const startD = (t.startDate || t.createdAt) ? new Date(t.startDate || t.createdAt) : (function() { const d=new Date(t.due); d.setDate(d.getDate()-5); return d; })();
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
  const modTag = t.moduleId ? '<span class="gantt-mod-tag">' + escHtml(moduleName(t.moduleId)) + '</span>' : '';

  return {
    leftHTML: '<div class="gantt-row-name' + (t.done ? ' done-row' : '') + (t.milestone ? ' milestone-row' : '') + '" onclick="openEditTask(\'' + t.id + '\')" title="' + escHtml(t.title) + '  |  ' + startStr + ' ~ ' + endStr + '">' + modTag + (t.milestone ? '◆ ' : '') + (blocked ? '⚠ ' : '') + escHtml(t.title) + '</div>',
    rightHTML: '<div style="position:relative;height:44px;border-bottom:1px solid var(--border);width:' + chartWidth + 'px;background:' + (t.done ? 'transparent' : 'var(--surface)') + '">' +
      '<div class="gantt-bar" data-task-id="' + t.id + '" data-start-offset="' + startOffset + '" data-dur-days="' + durDays + '" title="' + escHtml(t.title) + '  |  ' + startStr + ' ~ ' + endStr + '" ondblclick="openEditTask(\'' + t.id + '\')" style="position:absolute;top:10px;left:' + left + 'px;width:' + width + 'px;height:24px;background:' + barColor + ';opacity:' + (t.done ? '.5' : '1') + ';border-radius:' + (t.milestone ? '3px' : '5px') + ';cursor:' + (canDrag ? 'grab' : 'default') + ';display:flex;align-items:center;padding:0 8px;overflow:hidden;transition:none;' + (isOverdue ? 'outline:1.5px solid var(--red);' : '') + (t.milestone ? 'outline:2px solid ' + barColor + ';outline-offset:2px;' : '') + '" onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'' + (t.done ? '.5' : '1') + '\'">' +
        '<span style="font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;pointer-events:none">' + (t.milestone ? '◆ ' : '') + escHtml(t.title) + '</span>' +
        (canDrag ? '<div class="gantt-resize-handle" data-task-id="' + t.id + '" style="position:absolute;right:0;top:0;width:8px;height:100%;cursor:ew-resize;background:rgba(255,255,255,.25);border-radius:0 5px 5px 0" title="拖动调整截止日期"></div>' : '') +
      '</div>' +
      (t.milestone ? '<div style="position:absolute;left:' + (left + width) + 'px;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:12px;height:12px;background:var(--amber);border:2px solid #fff;box-shadow:0 0 0 1.5px var(--amber);pointer-events:none;z-index:2"></div>' : '') +
      (t.due === todayStr ? '<div style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--red);font-weight:600">今</div>' : '') +
    '</div>'
  };
}

function setGanttZoom(w) {
  ganttDayW = w;
  renderGantt();
}

// 展开 / 折叠全部项目组
window.ganttExpandAll = function() {
  if (!window._ganttCollapsed) window._ganttCollapsed = {};
  Object.keys(window._ganttCollapsed).forEach(k => { window._ganttCollapsed[k] = false; });
  renderGantt();
};
window.ganttCollapseAll = function() {
  if (!window._ganttCollapsed) window._ganttCollapsed = {};
  Object.keys(window._ganttCollapsed).forEach(function(k) { window._ganttCollapsed[k] = true; });
  // 折叠所有项目组
  state.projects.forEach(function(p) { window._ganttCollapsed[p.id] = true; });
  window._ganttCollapsed['__uncat'] = true;
  // V22: 也折叠所有模块子组
  state.projects.forEach(function(p) {
    var mods = state.modules.filter(function(m) { return m.projectId === p.id; });
    mods.forEach(function(m) {
      window._ganttCollapsed[p.id + '__' + m.id] = true;
    });
    window._ganttCollapsed[p.id + '__' + '__uncat'] = true;
  });
  window._ganttCollapsed['__uncat__' + '__uncat'] = true;
  renderGantt();
};

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
  if (task.assignee === currentUser.id || (task.assignees||[]).includes(currentUser.id)) return true;
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

/* 甘特图依赖连线 */
window.drawGanttDepLines = function() {
  var rightCol = document.getElementById('gantt-right-col');
  if (!rightCol) return;

  // 清除旧 overlay
  var old = rightCol.querySelector('.gantt-dep-overlay');
  if (old) old.remove();

  // 清除旧阻塞标记
  rightCol.querySelectorAll('.gantt-bar.is-dep-blocked').forEach(function(el) {
    el.classList.remove('is-dep-blocked');
  });

  var colRect = rightCol.getBoundingClientRect();
  var hasDeps = false;

  // 收集所有 bar 位置（相对 rightCol）
  var barMap = {};
  rightCol.querySelectorAll('.gantt-bar[data-task-id]').forEach(function(bar) {
    var r = bar.getBoundingClientRect();
    barMap[bar.dataset.taskId] = {
      el: bar,
      x: r.left - colRect.left,
      y: r.top - colRect.top,
      w: r.width,
      h: r.height
    };
  });

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gantt-dep-overlay');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;pointer-events:none;z-index:6;overflow:visible';
  svg.setAttribute('height', String(rightCol.scrollHeight || rightCol.offsetHeight));

  // Arrow marker
  var defs = document.createElementNS(NS, 'defs');
  var marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'gdep-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '5');
  marker.setAttribute('markerHeight', '5');
  marker.setAttribute('orient', 'auto-start-reverse');
  var ap = document.createElementNS(NS, 'path');
  ap.setAttribute('d', 'M2 1L8 5L2 9');
  ap.setAttribute('fill', 'none');
  ap.setAttribute('stroke', 'var(--amber,#d4842a)');
  ap.setAttribute('stroke-width', '1.5');
  ap.setAttribute('stroke-linecap', 'round');
  marker.appendChild(ap);
  defs.appendChild(marker);
  svg.appendChild(defs);

  (state.tasks || []).forEach(function(task) {
    if (!task.dependencies || !task.dependencies.length) return;
    var tgt = barMap[task.id];
    if (!tgt) return;

    task.dependencies.forEach(function(depId) {
      var src = barMap[depId];
      if (!src) return;
      hasDeps = true;

      // 标记阻塞（依赖未完成且自身未完成）
      var depTask = (state.tasks || []).find(function(t) { return t.id === depId; });
      if (depTask && !depTask.done && !task.done) {
        tgt.el.classList.add('is-dep-blocked');
      }

      var x1 = src.x + src.w;
      var y1 = src.y + src.h / 2;
      var x2 = tgt.x;
      var y2 = tgt.y + tgt.h / 2;
      var d;

      if (x2 > x1 + 8) {
        // 正向连线：L 形
        var midX = x1 + Math.max(16, (x2 - x1) / 2);
        d = 'M ' + x1 + ' ' + y1 +
            ' L ' + midX + ' ' + y1 +
            ' L ' + midX + ' ' + y2 +
            ' L ' + x2 + ' ' + y2;
      } else {
        // 逆向绕道：当前任务在前置任务左边
        var bpX = Math.min(src.x, tgt.x) - 20;
        d = 'M ' + x1 + ' ' + y1 +
            ' L ' + (x1 + 10) + ' ' + y1 +
            ' L ' + (x1 + 10) + ' ' + (src.y - 8) +
            ' L ' + bpX + ' ' + (src.y - 8) +
            ' L ' + bpX + ' ' + (tgt.y - 8) +
            ' L ' + (tgt.x - 4) + ' ' + (tgt.y - 8) +
            ' L ' + x2 + ' ' + y2;
      }

      var path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'dep-arrow-line');
      path.setAttribute('d', d);
      path.setAttribute('marker-end', 'url(#gdep-arrow)');
      svg.appendChild(path);
    });
  });

  if (hasDeps) {
    rightCol.style.position = 'relative';
    rightCol.appendChild(svg);
  }
};

window.renderWeekGrid = function() {
  var now = new Date();
  var dow = now.getDay();
  var monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var dayNames = ['周一','周二','周三','周四','周五','周六','周日'];
  var MAX_SHOW = 6;

  // 统计
  var weekEnd = new Date(monday); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23,59,59,999);
  var weekTasks = (state.tasks || []).filter(function(t) {
    if (!t.due) return false;
    var d = new Date(t.due + 'T00:00:00');
    return d >= monday && d <= weekEnd;
  });
  var weekDone = weekTasks.filter(function(t) { return t.done; }).length;
  var weekPending = weekTasks.filter(function(t) { return !t.done; }).length;

  var colsHTML = '';
  for (var i = 0; i < 7; i++) {
    var day = new Date(monday); day.setDate(monday.getDate() + i);
    var dayStr = day.getFullYear() + '-' +
      String(day.getMonth() + 1).padStart(2, '0') + '-' +
      String(day.getDate()).padStart(2, '0');
    var isToday = day.getTime() === today.getTime();
    var isPast  = day < today;

    var dueTasks = (state.tasks || []).filter(function(t) { return t.due === dayStr; });
    var shown = dueTasks.slice(0, MAX_SHOW);
    var more  = dueTasks.length - MAX_SHOW;

    var itemsHTML = shown.map(function(t) {
      var cls = 'week-task-item';
      if (t.done) cls += ' t-done';
      else if (t.priority === '紧急') cls += ' t-urgent';
      else if (t.priority === '重要') cls += ' t-high';
      var title = (t.title || '');
      var projName = window.projName ? window.projName(t.projectId) : (t.projectId || '');
      var statusInfo = window.statusInfo ? window.statusInfo(t.status) : {lbl: t.status||'', cls: ''};
      var assigneeIds = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
      var assigneeHTML = '';
      if (assigneeIds.length === 1) {
        var aName = window.memberName ? window.memberName(assigneeIds[0]) : '';
        var aColor = window.memberColor ? window.memberColor(assigneeIds[0]) : '#a09e98';
        var aInit = window.memberInitial ? window.memberInitial(assigneeIds[0]) : (aName||'?')[0];
        assigneeHTML = '<span class="wti-member" title="' + escHtml(aName) + '"><span class="wti-avatar" style="background:' + aColor + '">' + escHtml(aInit) + '</span>' + escHtml(aName) + '</span>';
      } else if (assigneeIds.length > 1) {
        var names2 = assigneeIds.map(function(id) { return window.memberName ? window.memberName(id) : id; });
        assigneeHTML = assigneeIds.slice(0, 2).map(function(id) {
          var c = window.memberColor ? window.memberColor(id) : '#a09e98';
          var ini = window.memberInitial ? window.memberInitial(id) : '?';
          return '<span class="wti-avatar" style="background:' + c + '" title="' + escHtml(names2.join(', ')) + '">' + escHtml(ini) + '</span>';
        }).join('');
        if (assigneeIds.length > 2) assigneeHTML += '<span class="wti-avatar" style="background:var(--surface3);color:var(--text2);font-size:8px" title="' + escHtml(names2.join(', ')) + '">+' + (assigneeIds.length - 2) + '</span>';
      }
      var priDot = t.priority==='紧急'?'#ef4444':t.priority==='重要'?'#f59e0b':'#94a3b8';
      return '<div class="' + cls + '" onclick="openEditTask(\'' + t.id + '\')" title="' + escHtml(title) + '">' +
        '<div class="wti-top">' +
          '<span class="wti-status ' + statusInfo.cls + '">' + escHtml(statusInfo.lbl) + '</span>' +
          '<span class="wti-pri" style="color:' + priDot + '">●</span>' +
        '</div>' +
        '<div class="wti-title">' + escHtml(title) + '</div>' +
        '<div class="wti-meta">' +
          (projName ? '<span class="wti-proj">' + escHtml(projName) + '</span>' : '') +
          assigneeHTML +
        '</div>' +
      '</div>';
    }).join('');
    if (more > 0) itemsHTML += '<div class="week-more-label" onclick="window.showWeekDayTasks(\'' + dayStr + '\')">+' + more + ' 个</div>';
    if (!dueTasks.length) itemsHTML = '<div class="week-empty-label">—</div>';

    var colCls = 'week-day-col' + (isToday ? ' is-today' : '') + (isPast ? ' is-past' : '');
    colsHTML +=
      '<div class="' + colCls + '">' +
        '<div class="week-day-head">' +
          '<div class="week-day-name">' + dayNames[i] + '</div>' +
          '<div class="week-day-num">' + day.getDate() + '</div>' +
        '</div>' +
        '<div class="week-task-list">' + itemsHTML + '</div>' +
      '</div>';
  }

  var tabsHtml =
    '<div class="view-mode-tabs">' +
      '<button class="vmtab" onclick="window._todayViewMode=\'today\';renderToday()">今日</button>' +
      '<button class="vmtab active">本周</button>' +
    '</div>';

  var summaryHtml =
    '<div class="week-summary-bar">' +
      '<div class="week-summary-stat">本周共 <strong>' + weekTasks.length + '</strong> 个任务到期</div>' +
      '<div class="week-summary-stat">已完成 <strong class="c-green">' + weekDone + '</strong> 个</div>' +
      '<div class="week-summary-stat">待处理 <strong class="c-amber">' + weekPending + '</strong> 个</div>' +
    '</div>';

  document.getElementById('main-content').innerHTML =
    '<div class="view-pane">' + tabsHtml + summaryHtml + '<div class="week-grid">' + colsHTML + '</div></div>';
  lucide.createIcons();
};

/* UX-08: 周视图「+N 个」点击弹出当日完整任务列表 */
window.showWeekDayTasks = function(dayStr) {
  var tasks = (state.tasks || []).filter(function(t) { return t.due === dayStr; });
  var priOrder = { '紧急': 0, '重要': 1, '普通': 2 };
  tasks.sort(function(a, b) { return (priOrder[a.priority] || 3) - (priOrder[b.priority] || 3); });
  var rowsHTML = tasks.map(function(t) {
    var projName = window.projName ? window.projName(t.projectId) : '';
    var assigneeIds = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
    var assigneeNames = assigneeIds.map(function(id) { return window.memberName ? window.memberName(id) : id; }).join(', ') || '—';
    var statusInfo = window.statusInfo ? window.statusInfo(t.status) : {lbl: t.status||'', cls: ''};
    return '<tr class="clickable" onclick="openEditTask(\'' + t.id + '\')">' +
      '<td><span class="status-pill ' + statusInfo.cls + '">' + escHtml(statusInfo.lbl) + '</span></td>' +
      '<td>' + escHtml(t.title) + '</td>' +
      '<td style="font-size:12px;color:var(--text3)">' + escHtml(projName) + '</td>' +
      '<td style="font-size:12px">' + escHtml(assigneeNames) + '</td>' +
      '</tr>';
  }).join('');
  openModal(modalHeader(dayStr + ' 任务列表') +
    '<div class="modal-body" style="max-height:60vh;overflow:auto">' +
      '<table class="table" style="width:100%"><thead><tr>' +
        '<th>状态</th><th>任务名称</th><th>项目</th><th>负责人</th>' +
      '</tr></thead><tbody>' +
        (rowsHTML || '<tr><td colspan="4"><div class="empty">当天无任务</div></td></tr>') +
      '</tbody></table>' +
    '</div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
};

/* TASK-GANTT-WEEK-NAV */
window.ganttJumpToWeek = function(offsetWeeks) {
  const minDate = window._ganttMinDate;
  if (!minDate) return;

  const today = new Date();
  const dayOfWeek = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1 + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);

  const minDateNorm = new Date(minDate);
  minDateNorm.setHours(0, 0, 0, 0);
  const diffDays = Math.round((monday - minDateNorm) / 86400000);

  const scrollLeft = diffDays * ganttDayW - 16;

  const rightCol = document.querySelector('#gantt-right-scroll');
  if (rightCol) {
    rightCol.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
  }
};
