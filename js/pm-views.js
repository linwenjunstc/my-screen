/* ════════════════════════════════════════════════
 * pm-views.js  —  今日看板 / 任务列表 / 项目视图 / 图表 / 甘特图
 * ════════════════════════════════════════════════ */

window._todayViewMode = window._todayViewMode || 'today';

// 排序映射（中文值 → 数值）
var _PRIO_ORDER_MAP = { '紧急': 0, '重要': 1, '普通': 2 };
var _STATUS_ORDER_MAP = { 'todo': 0, 'doing': 1, 'blocked': 2, 'waiting': 3, 'done': 4 };

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
  // 过滤归档项目下的任务
  allActive = allActive.filter(function(t) {
    if (!t.projectId) return true;
    var proj = state.projects.find(function(p) { return p.id === t.projectId; });
    return !proj || proj.status !== 'archived';
  });
  allActive = applyGlobalSearch(allActive);

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
  var html = '<div class="view-pane">' + renderSearchBanner() +
    '<div class="view-mode-tabs">' +
      '<button class="vmtab active" onclick="window._todayViewMode=\'today\';renderToday()">今日</button>' +
      '<button class="vmtab" onclick="window._todayViewMode=\'week\';renderWeekGrid()">本周</button>' +
    '</div>' +
    '<div class="stats-grid">' +
      '<div class="stat-card sc-red"' + (g0.length ? ' onclick="showDashboardTaskList(\'g0\')"' : '') + '><div class="stat-icon"><i data-lucide="alert-circle" style="width:16px;height:16px"></i></div><div class="stat-label">紧急 / 逾期</div><div class="stat-val' + (g0.length ? ' red' : '') + '">' + g0.length + '</div></div>' +
      '<div class="stat-card sc-amber"' + (g1.length ? ' onclick="showDashboardTaskList(\'g1\')"' : '') + '><div class="stat-icon"><i data-lucide="clock" style="width:16px;height:16px"></i></div><div class="stat-label">3 天内到期</div><div class="stat-val' + (g1.length ? ' amber' : '') + '">' + g1.length + '</div></div>' +
      '<div class="stat-card sc-blue"' + (g2.length ? ' onclick="showDashboardTaskList(\'g2\')"' : '') + '><div class="stat-icon"><i data-lucide="calendar-check" style="width:16px;height:16px"></i></div><div class="stat-label">本周内</div><div class="stat-val">' + g2.length + '</div></div>' +
      '<div class="stat-card sc-green"' + (done.length ? ' onclick="showDashboardTaskList(\'done\')"' : '') + '><div class="stat-icon"><i data-lucide="check-circle-2" style="width:16px;height:16px"></i></div><div class="stat-label">今日已完成</div><div class="stat-val' + (done.length ? ' green' : '') + '">' + done.length + '</div></div>' +
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

  var hasFilter = filterProject !== 'all' || filterStatus !== 'all' || filterAssignee !== 'all' || filterModule !== 'all' || filterTag !== 'all';

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
        '<option value="blocked"' + (filterStatus === 'blocked' ? ' selected' : '') + '>阻塞中</option>' +
        '<option value="waiting"' + (filterStatus === 'waiting' ? ' selected' : '') + '>待反馈</option>' +
        '<option value="done"' + (filterStatus === 'done' ? ' selected' : '') + '>已完成</option>' +
      '</select>' +
    '</div>' +
    '<div class="filter-group">' +
      '<select id="tf-assignee" onchange="filterAssignee=this.value;render()">' + memberOpts + '</select>' +
      '<select id="tf-tag" onchange="filterTag=this.value;render()">' + tagOpts + '</select>' +
    '</div>' +
    '<div class="filter-actions">' +
      (hasFilter ? '<button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" onclick="clearAllTaskFilters()">✕ 清除</button>' : '') +
      '<div class="view-toggle">' +
        '' +
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

  tasks = applyGlobalSearch(tasks);
  var html = '<div class="view-pane">' + renderSearchBanner() + filterBarHTML + summaryHTML + contentHTML + '</div>';
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

  return '<tr class="task-row' + (t.done ? ' done' : '') + '" data-task-id="' + t.id + '" onclick="openEditTask(\'' + t.id + '\')">' +
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
  filterModule = 'all'; filterTag = 'all';
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

  var STATUS_LABEL = { active: '进行中', on_hold: '暂停中', completed: '已完成', archived: '已归档' };
  var STATUS_CLASS = { active: 'pill-green', on_hold: 'pill-amber', completed: 'pill-gray', archived: 'pill-gray' };

  // 状态筛选
  var _projStatusFilter = window._projStatusFilter || 'active';
  var filterBar = '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">' +
    ['all','active','on_hold','completed','archived'].map(function(s) {
      var label = { all:'全部', active:'进行中', on_hold:'暂停中', completed:'已完成', archived:'已归档' }[s];
      var isOn = _projStatusFilter === s;
      return '<span class="filter-chip' + (isOn ? ' active' : '') + '" ' +
        'onclick="window._projStatusFilter=\'' + s + '\';renderProjects()">' + label + '</span>';
    }).join('') +
  '</div>';

  var visibleProjects = state.projects.filter(function(p) {
    if (_projStatusFilter === 'all') return true;
    return (p.status || 'active') === _projStatusFilter;
  });

  let html = '<div class="view-pane">' + filterBar + '<div class="projects-grid">';
  visibleProjects.forEach(p => {
    const tasks=state.tasks.filter(t=>t.projectId===p.id);
    const doneCnt=tasks.filter(t=>t.done).length;
    const pct=tasks.length?Math.round(doneCnt/tasks.length*100):0;
    const sc={todo:0,doing:0,waiting:0,done:0};
    tasks.forEach(t=>sc[t.status]=(sc[t.status]||0)+1);
    const color = PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length];
    var statusBadge = '<span class="pill ' + (STATUS_CLASS[p.status] || 'pill-gray') + '" style="font-size:10px">' +
      (STATUS_LABEL[p.status] || p.status) + '</span>';
    var deadlineRow = p.deadline
      ? '<div class="proj-deadline" style="font-size:11px;color:var(--text3);margin-top:6px">' +
          '<i data-lucide="calendar" style="width:11px;height:11px;vertical-align:-1px;margin-right:3px"></i>' +
          p.deadline +
        '</div>'
      : '';
    const memberAvatars = (p.members||[]).slice(0,4).map(mid=>`<div class="member-avatar" style="background:${memberColor(mid)}" title="${memberName(mid)}">${memberInitial(mid)}</div>`).join('');
    html += `<div class="project-card stagger-in" style="--proj-color:${color}" onclick="switchView('project-${p.id}')">
      <div class="proj-header">
        <div><div class="proj-name" style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;background:${color};border-radius:50%;display:inline-block;flex-shrink:0"></span>${escHtml(p.name)} ${statusBadge}</div></div>
        <div class="proj-actions" onclick="event.stopPropagation()">
          <button class="icon-btn" onclick="openEditProject('${p.id}')" title="编辑"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>
          <button class="icon-btn" onclick="confirmDeleteProject('${p.id}')" title="删除"><i data-lucide="x" style="width:13px;height:13px"></i></button>
        </div>
      </div>
      ${deadlineRow}
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
window._projKanbanGroup = window._projKanbanGroup || 'module';
window._projModuleFilter = '';
// 表格模式筛选
window._projTblPriority = window._projTblPriority || '';
window._projTblStatus   = window._projTblStatus   || '';
window._projTblMember   = window._projTblMember   || '';
window._projTblDue      = window._projTblDue      || '';
window._projTblTag      = window._projTblTag      || '';
window._projTblHovered  = null;  // 快捷键跟踪当前悬停行

function renderProjectView(pid) {
  const proj = state.projects.find(function(p) { return p.id === pid; });
  if (!proj) { switchView('today'); return; }
  var archivedBanner = proj.status === 'archived'
    ? '<div style="background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-border);border-radius:var(--radius-sm);padding:8px 14px;font-size:12px;margin-bottom:12px">' +
        '此项目已归档，任务仅供查看。如需恢复，请在项目列表中修改状态。' +
      '</div>'
    : '';
  const mode = projectViewMode[pid] || 'kanban';
  var rawTasks = state.tasks.filter(function(t) { return t.projectId === pid; });
  // 模块筛选
  if (window._projModuleFilter) {
    rawTasks = rawTasks.filter(function(t) { return t.moduleId === window._projModuleFilter; });
  }
  rawTasks = applyGlobalSearch(rawTasks);
  // 表格模式筛选
  if (mode === 'list') {
    if (window._projTblPriority) rawTasks = rawTasks.filter(function(t) { return t.priority === window._projTblPriority; });
    if (window._projTblStatus)   rawTasks = rawTasks.filter(function(t) { return t.status === window._projTblStatus; });
    if (window._projTblMember)   rawTasks = rawTasks.filter(function(t) { return t.assignee === window._projTblMember || (t.assignees || []).indexOf(window._projTblMember) !== -1; });
    if (window._projTblTag)      rawTasks = rawTasks.filter(function(t) { return (t.tags || []).indexOf(window._projTblTag) !== -1; });
    if (window._projTblDue) {
      var today = new Date(); today.setHours(0,0,0,0);
      rawTasks = rawTasks.filter(function(t) {
        if (!t.due) return false;
        var d = new Date(t.due); d.setHours(0,0,0,0);
        var diff = Math.round((d - today) / 86400000);
        if (window._projTblDue === 'overdue') return diff < 0 && !t.done;
        if (window._projTblDue === 'today')   return diff === 0;
        if (window._projTblDue === 'week')    return diff >= 0 && diff <= 7;
        if (window._projTblDue === 'month')   return diff >= 0 && diff <= 31;
        return true;
      });
    }
  }
  var tasks = rawTasks;
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
    '<button class="pvt-btn' + (mode === 'kanban' ? ' active' : '') + '" onclick="projectViewMode[\'' + pid + '\']=\'kanban\';renderProjectView(\'' + pid + '\')">⬛ 看板</button>' +
    '<button class="pvt-btn' + (mode === 'list' ? ' active' : '') + '" onclick="projectViewMode[\'' + pid + '\']=\'list\';renderProjectView(\'' + pid + '\')">☰ 表格</button>';
  if (mode === 'kanban') {
    viewToggle += '<div class="pvt-sub" id="kanban-group-toggle">' +
      '<span class="pvt-label">分组:</span>' +
      '<span class="pvt-chip' + (kanbanGroup === 'module' ? ' active' : '') + '" onclick="setProjKanbanGroup(\'module\',\'' + pid + '\')">按模块</span>' +
      '<span class="pvt-chip' + (kanbanGroup === 'status' ? ' active' : '') + '" onclick="setProjKanbanGroup(\'status\',\'' + pid + '\')">按状态</span>' +
    '</div>';
  }
  viewToggle += '</div>';

  // Progress bar — project header card (V23)
  const colorName = getColorName(proj.colorIdx);
  const progressBar = `
    <div class="proj-header-card color-${colorName}">
      <div class="proj-header-card-top">
        <div class="proj-header-card-name">
          <span style="width:14px;height:14px;background:${color};border-radius:50%;flex-shrink:0;box-shadow:0 0 0 3px ${color}22"></span>
          ${escHtml(proj.name)}
        </div>
        <div class="proj-header-card-stats">
          <div class="proj-stat-item">
            <span class="proj-stat-num">${tasks.length}</span>
            <span class="proj-stat-label">任务总数</span>
          </div>
          <div class="proj-stat-item">
            <span class="proj-stat-num">${doneCnt}</span>
            <span class="proj-stat-label">已完成</span>
          </div>
          <div class="proj-stat-item">
            <span class="proj-stat-num highlight">${pct}%</span>
            <span class="proj-stat-label">完成率</span>
          </div>
        </div>
      </div>
      <div class="proj-progress-bar">
        <div class="proj-progress-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      ${memberAvatars?`<div style="display:flex;gap:4px;margin-top:14px">${memberAvatars}</div>`:''}
      <div style="display:flex;gap:6px;margin-top:14px">
        <button class="btn btn-ghost btn-sm" onclick="openEditProject('${pid}')">✎ 编辑项目</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteProject('${pid}')">✕ 删除</button>
      </div>
    </div>`;

  // 模块 & 筛选面板
  var canManage = isAdmin() || getEffectiveMenuPerms().includes('add_task');
  var mods = state.modules
    .filter(function(m) { return m.projectId === pid; })
    .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  var modulePanel = '';

  if (mode === 'list') {
    // ── 表格模式：筛选条 ──
    var modOpts = '<option value="">全部模块</option>' + mods.map(function(m) {
      return '<option value="' + m.id + '"' + (window._projModuleFilter === m.id ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
    }).join('');
    var priOpts = '<option value="">全部优先级</option>' +
      ['紧急','重要','普通'].map(function(v) { return '<option value="' + v + '"' + (window._projTblPriority === v ? ' selected' : '') + '>' + v + '</option>'; }).join('');
    var statOpts = '<option value="">全部状态</option>' +
      [{v:'todo',l:'待启动'},{v:'doing',l:'进行中'},{v:'blocked',l:'阻塞中'},{v:'waiting',l:'待反馈'},{v:'done',l:'已完成'}].map(function(s) {
        return '<option value="' + s.v + '"' + (window._projTblStatus === s.v ? ' selected' : '') + '>' + s.l + '</option>';
      }).join('');
    var memOpts = '<option value="">全部成员</option>' +
      state.members.map(function(m) {
        return '<option value="' + m.id + '"' + (window._projTblMember === m.id ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
      }).join('');
    var dueOpts = '<option value="">全部截止日</option>' +
      [{v:'overdue',l:'已逾期'},{v:'today',l:'今天'},{v:'week',l:'本周内'},{v:'month',l:'本月内'}].map(function(d) {
        return '<option value="' + d.v + '"' + (window._projTblDue === d.v ? ' selected' : '') + '>' + d.l + '</option>';
      }).join('');
    var tagOpts = '<option value="">全部标签</option>' +
      state.globalTags.map(function(tg) {
        return '<option value="' + tg.id + '"' + (window._projTblTag === tg.id ? ' selected' : '') + '>' + escHtml(tg.name) + '</option>';
      }).join('');

    var hasFilter = window._projModuleFilter || window._projTblPriority || window._projTblStatus || window._projTblMember || window._projTblDue || window._projTblTag;
    modulePanel = '<div class="tt-filter-bar">' +
      '<div class="tt-filter-row">' +
        '<select class="tt-filter-sel" onchange="onProjTblFilter(\'module\',this.value,\'' + pid + '\')">' + modOpts + '</select>' +
        '<select class="tt-filter-sel" onchange="onProjTblFilter(\'priority\',this.value,\'' + pid + '\')">' + priOpts + '</select>' +
        '<select class="tt-filter-sel" onchange="onProjTblFilter(\'status\',this.value,\'' + pid + '\')">' + statOpts + '</select>' +
        '<select class="tt-filter-sel" onchange="onProjTblFilter(\'member\',this.value,\'' + pid + '\')">' + memOpts + '</select>' +
        '<select class="tt-filter-sel" onchange="onProjTblFilter(\'due\',this.value,\'' + pid + '\')">' + dueOpts + '</select>' +
        '<select class="tt-filter-sel" onchange="onProjTblFilter(\'tag\',this.value,\'' + pid + '\')">' + tagOpts + '</select>' +
        (hasFilter ? '<button class="tt-filter-clear" onclick="clearProjTblFilters(\'' + pid + '\')" title="清除筛选"><i data-lucide="x" style="width:14px;height:14px"></i> 清除</button>' : '') +
        '<span style="flex:1"></span>' +
        (canManage ? '<button class="btn btn-ghost btn-sm" onclick="openAddModule(\'' + pid + '\')">+ 模块</button>' : '') +
        '<button class="btn btn-primary btn-sm" onclick="openAddTask(\'' + pid + '\')">+ 新建任务</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="exportProjTable(\'' + pid + '\')" title="导出当前筛选结果为 Excel"><i data-lucide="download" style="width:13px;height:13px;margin-right:3px"></i>导出表格</button>' +
      '</div>' +
    '</div>';
  } else {
    // ── 看板模式：模块 chips ──
    var modChips = mods.map(function(m, idx) {
      var isActive = window._projModuleFilter === m.id;
      return '<div class="module-chip' + (isActive ? ' active' : '') + '" ' +
        'data-module-id="' + m.id + '" ' +
        'draggable="true" ' +
        'ondragstart="onModuleDragStart(event,\'' + pid + '\')" ' +
        'ondragover="onModuleDragOver(event)" ' +
        'ondragleave="onModuleDragLeave(event)" ' +
        'ondrop="onModuleDrop(event,\'' + pid + '\')" ' +
        'ondragend="onModuleDragEnd(event)" ' +
        'onclick="event.stopPropagation();setProjModuleFilter(\'' + (isActive ? '' : m.id) + '\',\'' + pid + '\')">' + escHtml(m.name) +
        (canManage ? '<span class="edit-btn" onclick="event.stopPropagation();openEditModule(\'' + m.id + '\')"><i data-lucide="pencil" style="width:11px;height:11px"></i></span>' : '') +
        '</div>';
    }).join('');
    if (window._projModuleFilter) {
      modChips += ' <span style="font-size:11px;color:var(--accent);cursor:pointer;margin-left:4px" onclick="event.stopPropagation();setProjModuleFilter(\'\',\'' + pid + '\')">✕ 清除</span>';
    }
    var addBtn = canManage
      ? '<button class="btn btn-ghost btn-sm" onclick="openAddModule(\'' + pid + '\')">+ 新建模块</button>'
      : '';
    modulePanel = '<div class="modules-panel">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<span style="font-size:13px;font-weight:600;color:var(--text2)">模块 (' + mods.length + ')</span>' +
        addBtn +
      '</div>' +
      '<div class="module-list">' +
        (modChips || '<span style="font-size:12px;color:var(--text3)">暂无模块，点击右侧新建</span>') +
      '</div>' +
    '</div>';
  }

  let contentHTML = '';

  if (mode === 'kanban') {
    if (kanbanGroup === 'module') {
      // 按模块看板：有筛选时只显示选中模块，否则显示全部
      var allKanbanMods = mods.concat([{ id: null, name: '未分类' }]);
      var kanbanMods = window._projModuleFilter
        ? allKanbanMods.filter(function(m) { return (m.id || null) === window._projModuleFilter; })
        : allKanbanMods;
      var colsHTML = kanbanMods.map(function(m) {
        var colTasks = tasks.filter(function(t) { return (t.moduleId || null) === m.id; });
        var colColor = m.id ? 'var(--purple)' : 'var(--text3)';
        var cards = colTasks.map(function(t) { return taskCardHTML(t); }).join('');
        return '<div class="kanban-col">' +
          '<div class="kanban-col-header">' +
            '<span class="kanban-col-dot" style="background:' + colColor + '"></span>' +
            '<span class="kanban-col-name">' + escHtml(m.name) + '</span>' +
            '<span class="kanban-col-count">' + colTasks.length + '</span>' +
          '</div>' +
          '<div class="kanban-col-body">' +
            (cards || '<div class="kanban-col-empty">暂无任务</div>') +
          '</div>' +
        '</div>';
      }).join('');
      contentHTML = '<div class="kanban-wrap">' + colsHTML + '</div>';
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
        var cards = colTasks.map(function(t) {
          return '<div class="kanban-card-wrap" draggable="true" ' +
            'data-task-id="' + t.id + '" ' +
            'ondragstart="onKanbanDragStart(event)">' +
            taskCardHTML(t) +
            '</div>';
        }).join('');
        return '<div class="kanban-col">' +
          '<div class="kanban-col-header">' +
            '<span class="kanban-col-dot" style="background:' + col.color + '"></span>' +
            '<span class="kanban-col-name">' + col.label + '</span>' +
            '<span class="kanban-col-count">' + colTasks.length + '</span>' +
          '</div>' +
          '<div class="kanban-col-body" ' +
            'data-status="' + col.key + '" ' +
            'ondragover="onKanbanDragOver(event)" ' +
            'ondragleave="onKanbanDragLeave(event)" ' +
            'ondrop="onKanbanDrop(event,\'' + col.key + '\')">' +
            (cards || '<div class="kanban-col-empty">暂无任务</div>') +
          '</div>' +
        '</div>';
      }).join('');
      contentHTML = '<div class="kanban-wrap">' + colsHTML + '</div>';
    }
  } else {
    // 紧凑表格模式（按模块分组）
    var groupData = [];
    var groups = mods.concat([{ id: null, name: '未分类' }]);
    groups.forEach(function(grp) {
      var grpTasks = tasks.filter(function(t) { return (t.moduleId || null) === grp.id; });
      if (grp.id !== null) grpTasks = grpTasks.filter(function(t) { return !t.done; });
      if (grpTasks.length) {
        grpTasks.sort(function(a, b) { return (b.done ? 0 : 1) - (a.done ? 0 : 1) || priorityOrder(a.priority) - priorityOrder(b.priority); });
        groupData.push({ grp: grp, tasks: grpTasks });
      }
    });

    if (groupData.length) {
      var todayStr = new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-' + String(new Date().getDate()).padStart(2,'0');
      var tableHTML = '';
      groupData.forEach(function(gd) {
        var isVirtual = gd.grp.id === null;
        var editBtn = (!isVirtual && canManage)
          ? '<span class="tt-edit-mod" onclick="event.stopPropagation();openEditModule(\'' + gd.grp.id + '\')" title="编辑模块"><i data-lucide="pencil" style="width:12px;height:12px"></i></span>'
          : '';
        tableHTML += '<tr class="tt-group-row">' +
          '<td colspan="9"><span class="tt-group-name">' + escHtml(gd.grp.name) + '</span>' +
          editBtn +
          '<span class="tt-group-count">' + gd.tasks.length + ' 项</span>' +
          (isVirtual ? '' : '<span class="tt-group-add" onclick="event.stopPropagation();openAddTask(\'' + pid + '\',\'' + (gd.grp.id || '') + '\')" title="在此模块下新建任务"><i data-lucide="plus" style="width:12px;height:12px"></i> 新建</span>') +
          '</td></tr>';

        gd.tasks.forEach(function(t) {
          var di = dueInfo(t);
          var si = statusInfo(t.status);
          var projColorHex = '#c5c5c5';
          if (t.projectId) { var pp = state.projects.find(function(x) { return x.id === t.projectId; }); if (pp) projColorHex = PROJ_COLORS[(pp.colorIdx || 0) % PROJ_COLORS.length]; }
          var priColor = t.priority === '紧急' ? 'var(--red)' : t.priority === '重要' ? 'var(--amber)' : 'var(--text3)';
          var priDot = '<span class="tt-pri-dot" style="background:' + priColor + '" title="' + escHtml(t.priority) + '"></span>';
          var assigneeIds = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [t.assignee] : []);
          var assigneeNames = assigneeIds.map(function(id) { return memberName(id); }).filter(Boolean).join(', ');
          var doneClass = t.done ? ' tt-done' : '';
          var tagStr = (t.tags || []).length ? (t.tags || []).map(function(tid) { var tg = state.globalTags.find(function(x) { return x.id === tid; }); return tg ? escHtml(tg.name) : ''; }).filter(Boolean).join(' ') : '';
          var overdueClass = (!t.done && di.cls === 'pill-red') ? ' tt-overdue' : '';
          var milestoneIcon = t.milestone ? '<span class="tt-milestone" title="里程碑">◆</span>' : '';
          var descPreview = t.description ? escHtml(t.description.slice(0, 30) + (t.description.length > 30 ? '…' : '')) : '';

          tableHTML += '<tr class="tt-row' + doneClass + overdueClass + (t.milestone ? ' tt-milestone-row' : '') + '" ' +
            'onclick="openEditTask(\'' + t.id + '\')" ' +
            'onmouseenter="window._projTblHovered=\'' + t.id + '\'" ' +
            'onmouseleave="window._projTblHovered=null">' +
            '<td class="tt-check" onclick="event.stopPropagation();if(!' + t.done + ')celebrateCompletion(event.clientX,event.clientY);toggleDone(\'' + t.id + '\')">' +
              '<div class="check-btn' + (t.done ? ' checked' : '') + '"></div></td>' +
            '<td class="tt-title">' +
              '<div class="tt-title-inner">' +
                '<span class="tt-proj-bar" style="background:' + projColorHex + '"></span>' +
                milestoneIcon +
                '<span>' + escHtml(t.title) + '</span>' +
              '</div></td>' +
            '<td class="tt-desc" title="' + escHtml(t.description || '') + '">' + descPreview + '</td>' +
            '<td class="tt-priority"><div class="tt-pri-inner">' + priDot + ' <span>' + escHtml(t.priority) + '</span></div></td>' +
            '<td class="tt-assignee">' + escHtml(assigneeNames || '-') + '</td>' +
            '<td class="tt-due' + (di.cls === 'pill-red' && !t.done ? ' tt-due-red' : '') + '">' + escHtml(di.text) + '</td>' +
            '<td class="tt-status"><span class="tt-status-tag ' + si.cls.replace('pill-', 'tt-') + '">' + si.lbl + '</span></td>' +
            '<td class="tt-tags">' + tagStr + '</td>' +
            '<td class="tt-log" onclick="event.stopPropagation();openLog(\'' + t.id + '\')" title="记录跟进 (快捷键 L)"><i data-lucide="message-square-plus" style="width:13px;height:13px"></i></td>' +
          '</tr>';
        });
      });
      contentHTML = '<div class="task-table-wrap"><table class="task-table">' +
        '<thead><tr>' +
          '<th class="tt-h-check"></th>' +
          '<th class="tt-h-title">任务</th>' +
          '<th class="tt-h-desc">描述</th>' +
          '<th class="tt-h-pri">优先级</th>' +
          '<th class="tt-h-assignee">负责人</th>' +
          '<th class="tt-h-due">截止日</th>' +
          '<th class="tt-h-status">状态</th>' +
          '<th class="tt-h-tags">标签</th>' +
          '<th class="tt-h-log"></th>' +
        '</tr></thead>' +
        '<tbody>' + tableHTML + '</tbody>' +
      '</table></div>';
    } else {
      contentHTML = '';
    }
    if (!tasks.length) contentHTML += renderEmptyState({ icon: 'clipboard-list', title: '这个项目还没有任务', desc: '开始规划第一个任务吧', action: '<div class="empty-state-action"><button class="btn btn-primary btn-sm" onclick="openAddTask(\'' + pid + '\')"><i data-lucide="plus" style="width:13px;height:13px;margin-right:3px"></i>新建任务</button></div>' });
  }

  document.getElementById('main-content').innerHTML = `
    <div class="view-pane">
      ${viewToggle}
      ${progressBar}
      ${modulePanel}
      ${archivedBanner}
      ${renderSearchBanner()}
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

// ── 表格模式筛选 ─────────────────────────────────────────
window.onProjTblFilter = function(key, val, pid) {
  if (key === 'module')   window._projModuleFilter = val;
  if (key === 'priority') window._projTblPriority  = val;
  if (key === 'status')   window._projTblStatus    = val;
  if (key === 'member')   window._projTblMember    = val;
  if (key === 'due')      window._projTblDue       = val;
  if (key === 'tag')      window._projTblTag       = val;
  renderProjectView(pid);
};

window.clearProjTblFilters = function(pid) {
  window._projModuleFilter = '';
  window._projTblPriority  = '';
  window._projTblStatus    = '';
  window._projTblMember    = '';
  window._projTblDue       = '';
  window._projTblTag       = '';
  renderProjectView(pid);
};

window.exportProjTable = function(pid) {
  var proj = state.projects.find(function(p) { return p.id === pid; });
  if (!proj) return;
  var tasks = state.tasks.filter(function(t) { return t.projectId === pid; });
  if (window._projModuleFilter) tasks = tasks.filter(function(t) { return t.moduleId === window._projModuleFilter; });
  tasks = applyGlobalSearch(tasks);
  if (window._projTblPriority) tasks = tasks.filter(function(t) { return t.priority === window._projTblPriority; });
  if (window._projTblStatus)   tasks = tasks.filter(function(t) { return t.status === window._projTblStatus; });
  if (window._projTblMember)   tasks = tasks.filter(function(t) { return t.assignee === window._projTblMember || (t.assignees || []).indexOf(window._projTblMember) !== -1; });
  if (window._projTblTag)      tasks = tasks.filter(function(t) { return (t.tags || []).indexOf(window._projTblTag) !== -1; });
  if (window._projTblDue) {
    var today = new Date(); today.setHours(0,0,0,0);
    tasks = tasks.filter(function(t) {
      if (!t.due) return false;
      var d = new Date(t.due); d.setHours(0,0,0,0);
      var diff = Math.round((d - today) / 86400000);
      if (window._projTblDue === 'overdue') return diff < 0 && !t.done;
      if (window._projTblDue === 'today')   return diff === 0;
      if (window._projTblDue === 'week')    return diff >= 0 && diff <= 7;
      if (window._projTblDue === 'month')   return diff >= 0 && diff <= 31;
      return true;
    });
  }

  var mods = state.modules.filter(function(m) { return m.projectId === pid; });
  var modMap = {};
  mods.forEach(function(m) { modMap[m.id] = m.name; });

  var statusLabels = { todo: '待启动', doing: '进行中', blocked: '阻塞中', waiting: '待反馈', done: '已完成' };
  var colCount = 8;

  // 按模块排序，模块内按优先级排序
  var modOrder = {};
  mods.forEach(function(m, i) { modOrder[m.id] = i; });
  tasks.sort(function(a, b) {
    var ma = modOrder[a.moduleId] !== undefined ? modOrder[a.moduleId] : 9999;
    var mb = modOrder[b.moduleId] !== undefined ? modOrder[b.moduleId] : 9999;
    if (ma !== mb) return ma - mb;
    return priorityOrder(a.priority) - priorityOrder(b.priority);
  });

  // 按模块分组，计算 rowspan
  var groups = [];
  var curMod = null;
  tasks.forEach(function(t) {
    var mn = modMap[t.moduleId] || '未分类';
    if (mn !== curMod) {
      curMod = mn;
      groups.push({ modName: mn, count: 0, tasks: [] });
    }
    var g = groups[groups.length - 1];
    g.count++;
    g.tasks.push(t);
  });

  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">\n<head>\n<meta charset="UTF-8">\n';
  html += '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>项目任务</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->\n';
  html += '<style>\n';
  html += 'table { border-collapse: collapse; }\n';
  html += 'td, th { border: 1px solid #999999; padding: 6px 10px; font-size: 11pt; font-family: "Microsoft YaHei", "微软雅黑", sans-serif; }\n';
  html += '.title-row td { font-size: 16pt; font-weight: bold; text-align: center; padding: 12px 10px; border: none; color: #1a1d27; }\n';
  html += '.header-row td { font-weight: bold; text-align: center; background: #2563eb; color: #ffffff; font-size: 10.5pt; padding: 8px 10px; border: 1px solid #1d4ed8; }\n';
  html += '.mod-cell { text-align: center; vertical-align: middle; font-weight: 600; background: #f0f4ff; }\n';
  html += '.data-row td { vertical-align: middle; }\n';
  html += '.data-row-even td { background: #f7f9fc; }\n';
  html += '.data-row-even td.mod-cell { background: #f0f4ff; }\n';
  html += '</style>\n</head>\n<body>\n';
  html += '<table>\n';
  html += '<colgroup><col width="180"><col width="1260"><col width="180"><col width="225"><col width="225"><col width="160"><col width="480"><col width="520"></colgroup>\n';
  // Title row
  html += '<tr class="title-row"><td colspan="' + colCount + '">' + escHtml(proj.name) + ' — 任务列表</td></tr>\n';
  // Header row
  html += '<tr class="header-row"><td>模块</td><td>任务</td><td>状态</td><td>开始时间</td><td>结束时间</td><td>优先级</td><td>标签</td><td>描述</td></tr>\n';
  // Data rows with merged module cells
  var rowIdx = 0;
  groups.forEach(function(g) {
    g.tasks.forEach(function(t, ti) {
      var rowClass = (rowIdx % 2 === 0) ? 'data-row' : 'data-row data-row-even';
      var statusText = statusLabels[t.status] || t.status || '待启动';
      var tagStr = (t.tags || []).map(function(tid) {
        var tg = state.globalTags.find(function(x) { return x.id === tid; });
        return tg ? tg.name : '';
      }).filter(Boolean).join('、');
      var desc = (t.description || '').replace(/\n/g, ' ');
      html += '<tr class="' + rowClass + '">';
      if (ti === 0) {
        html += '<td class="mod-cell" rowspan="' + g.count + '">' + escHtml(g.modName) + '</td>';
      }
      html += '<td>' + escHtml(t.title) + '</td>';
      html += '<td style="text-align:center">' + escHtml(statusText) + '</td>';
      html += '<td style="text-align:center">' + escHtml(t.startDate || '-') + '</td>';
      html += '<td style="text-align:center">' + escHtml(t.due || '-') + '</td>';
      html += '<td style="text-align:center">' + escHtml(t.priority || '普通') + '</td>';
      html += '<td>' + escHtml(tagStr) + '</td>';
      html += '<td>' + escHtml(desc) + '</td>';
      html += '</tr>\n';
      rowIdx++;
    });
  });
  html += '</table>\n</body>\n</html>';

  var blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (proj.name || '项目') + '_任务列表.xls';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// 快捷键 L：记录跟进（项目表格模式下）
document.addEventListener('keydown', function(e) {
  if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey && window._projTblHovered) {
    var activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
    e.preventDefault();
    if (typeof openLog === 'function') openLog(window._projTblHovered);
  }
});

// ── 模块拖拽排序 ─────────────────────────────────────────
window._moduleDragSource = null;

window.onModuleDragStart = function(e, pid) {
  window._moduleDragSource = e.target.closest('.module-chip');
  if (!window._moduleDragSource) return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', window._moduleDragSource.getAttribute('data-module-id'));
  setTimeout(function() { window._moduleDragSource.classList.add('dragging'); }, 0);
};

window.onModuleDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var chip = e.target.closest('.module-chip');
  if (chip && chip !== window._moduleDragSource) {
    chip.classList.add('drag-over');
  }
};

window.onModuleDragLeave = function(e) {
  var chip = e.target.closest('.module-chip');
  if (chip) chip.classList.remove('drag-over');
};

window.onModuleDrop = async function(e, pid) {
  e.preventDefault();
  var chip = e.target.closest('.module-chip');
  if (chip) chip.classList.remove('drag-over');
  if (!window._moduleDragSource || chip === window._moduleDragSource) return;

  var draggedId = window._moduleDragSource.getAttribute('data-module-id');
  var targetId = chip.getAttribute('data-module-id');
  if (!draggedId || !targetId) return;

  // 获取当前项目的模块列表（已排序）
  var mods = state.modules
    .filter(function(m) { return m.projectId === pid; })
    .sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });

  var draggedIdx = mods.findIndex(function(m) { return m.id === draggedId; });
  var targetIdx = mods.findIndex(function(m) { return m.id === targetId; });
  if (draggedIdx === -1 || targetIdx === -1) return;

  // 移动元素
  var dragged = mods.splice(draggedIdx, 1)[0];
  mods.splice(targetIdx, 0, dragged);

  // 重新分配 sort_order
  for (var i = 0; i < mods.length; i++) {
    mods[i].sortOrder = i;
  }

  window._moduleDragSource = null;

  // 乐观更新：立即重渲染，不等网络
  renderProjectView(pid);

  // 触发重排动画
  requestAnimationFrame(function() {
    var list = document.querySelector('.module-list');
    if (list) {
      list.classList.add('reordered');
      setTimeout(function() { list.classList.remove('reordered'); }, 260);
    }
  });

  // 后台并行同步所有模块（不阻塞 UI）
  Promise.all(mods.map(function(m) { return syncModule(m); })).then(function() {
    var mod = state.modules.find(function(m) { return m.id === draggedId; });
    if (mod) logAction('模块排序', '调整模块顺序（项目「' + (state.projects.find(function(p) { return p.id === pid; }) || {}).name || pid + '」）');
  }).catch(function(e) {
    console.error('模块排序同步失败:', e);
    toast('排序同步失败，请刷新', 'error');
  });
};

window.onModuleDragEnd = function(e) {
  if (window._moduleDragSource) {
    window._moduleDragSource.classList.remove('dragging');
  }
  document.querySelectorAll('.module-chip.drag-over').forEach(function(el) {
    el.classList.remove('drag-over');
  });
  window._moduleDragSource = null;
};

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts() {
  document.getElementById('header-title').textContent = '图表分析';
  document.getElementById('header-sub').textContent = '任务状态 · 优先级 · 月度趋势';

  const total = state.tasks.length;
  const statusCount = {todo:0,doing:0,blocked:0,waiting:0,done:0};
  state.tasks.forEach(t => statusCount[t.status]=(statusCount[t.status]||0)+1);

  const donutData = [
    {label:'待启动',count:statusCount.todo,color:'#d4d1c9'},
    {label:'进行中',count:statusCount.doing,color:'#2e7dd1'},
    {label:'阻塞中',count:statusCount.blocked,color:'#8b5cf6'},
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
            ${donutData.map(d=>`<div class="legend-item" onclick="showStatusTaskList('${d.label==='待启动'?'todo':d.label==='进行中'?'doing':d.label==='阻塞中'?'blocked':d.label==='待反馈'?'waiting':'done'}')" style="cursor:pointer" title="点击查看详情"><div class="legend-dot" style="background:${d.color}"></div><span style="font-size:13px">${d.label}</span><span style="font-family:var(--mono);font-size:13px;color:var(--text);font-weight:600;margin-left:auto">${d.count}</span></div>`).join('')}
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
      const statusMap = { '待启动': 'todo', '进行中': 'doing', '阻塞中': 'blocked', '待反馈': 'waiting', '已完成': 'done' };
      svg += `<path class="donut-segment" style="animation-delay:${0.05*data.indexOf(d)}s;cursor:pointer" d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi1},${yi1} A${ir},${ir} 0 ${large},0 ${xi2},${yi2} Z" fill="${d.color}" onclick="showStatusTaskList('${statusMap[d.label]}')" title="点击查看${d.label}任务"/>`;
      sa=ea;
    });
    const activeCnt = total - (data.find(d=>d.label==='已完成')||{count:0}).count;
    svg += `<text class="donut-center-num" x="${cx}" y="${cy-9}" text-anchor="middle" fill="#1a1916" font-size="22" font-weight="600" font-family="DM Mono, monospace">${activeCnt}</text>
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
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#e8e5df" stroke-width=".6"/>`;
    yLabels += `<text x="${padL-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#a8a59e" font-size="5">${v}</text>`;
  }

  // X date labels (show first, middle, last)
  let xLabels = '';
  const xLabelIdxs = [0, Math.floor((log.length-1)/2), log.length-1];
  xLabelIdxs.forEach(i => {
    if (i < log.length) xLabels += `<text x="${toX(i)}" y="${padT+chartH+18}" text-anchor="middle" fill="#a8a59e" font-size="5">${log[i].date.slice(5)}</text>`;
  });

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block">
    ${gridLines}
    <path d="${areaPath}" fill="#2e7dd1" opacity="0.08"/>
    <polyline class="chart-line-draw" points="${pointsStr}" fill="none" stroke="#2e7dd1" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${log.map((l,i)=>`<circle cx="${toX(i)}" cy="${toY(l.remaining)}" r="10" fill="transparent" stroke="none" data-tip="${l.date}: 剩余 ${l.remaining} 个任务" style="cursor:pointer" onclick="showBurndownDayTasks('${projId}','${l.date}')"/>`).join('')}
    ${log.map((l,i)=>`<circle cx="${toX(i)}" cy="${toY(l.remaining)}" r="3.5" fill="#2e7dd1" style="pointer-events:none"/>`).join('')}
    ${yLabels}${xLabels}
    <text x="${padL}" y="${padT-4}" fill="#a8a59e" font-size="5">剩余任务数</text>
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
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL+chartW}" y2="${y}" stroke="#e8e5df" stroke-width=".6"/>`;
    yLabels += `<text x="${padL-6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#a8a59e" font-size="5">${v}</text>`;
  }

  // X labels
  let xLabels = '';
  [0, 9, 19, 29].forEach(i => {
    if (i < days.length) xLabels += `<text x="${toX(i)}" y="${padT+chartH+16}" text-anchor="middle" fill="#a8a59e" font-size="5">${days[i].slice(5)}</text>`;
  });

  // Build polylines
  function polyline(vals, stroke, dash) {
    let pts = vals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
    return `<polyline${dash ? "" : " class=\"chart-line-draw\""} points="${pts}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"${dash ? ' stroke-dasharray="5,3"' : ''}/>`;
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
    <text x="${padL}" y="${padT-3}" fill="#a8a59e" font-size="5">任务数</text>
  </svg>`;
}

// ─── Chart click-to-detail modals ──────────────────────────────────────────────
function showStatusTaskList(status) {
  const statusLabels = STATUS_LABELS;
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
  const statusLabels = STATUS_LABELS;
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
  const statusLabels = STATUS_LABELS;
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
  const statusLabels = STATUS_LABELS;
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
window._ganttWeekActive     = window._ganttWeekActive     || 'today'; // today|thisWeek|nextWeek
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
  // Today markers injected dynamically after DOM render (see drawGanttTodayLine)
  window._ganttTodayOffset = todayOffset;
  window._ganttChartWidth = chartWidth;
  window._ganttDayW = ganttDayW;

  // Grid lines + weekend column backgrounds (PRD §2.2)
  for (let i=0; i<totalDays; i++) {
    const d = new Date(minDate); d.setDate(d.getDate()+i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW}px;top:0;bottom:-9999px;width:${ganttDayW}px;background:rgba(15,23,42,.025);pointer-events:none"></div>`;
    }
    dateHeaderHTML += `<div style="position:absolute;left:${i*ganttDayW}px;top:0;bottom:-9999px;border-left:1px solid var(--border);opacity:${i%7===0?.7:.18};pointer-events:none"></div>`;
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

  let totalContentH = 38; // header height, tracked to replace -9999px grid/today lines

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
    totalContentH += 32;

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
          totalContentH += 30;

          if (!modCollapsed) {
          mg.tasks.forEach(function(t) { var row = renderGanttTaskRow(t, color, minDate, chartWidth, ganttDayW, today, todayStr); leftHTML += row.leftHTML; rightHTML += row.rightHTML; });
          totalContentH += mg.tasks.length * 42;
        }
      });
    } else {
      // 无模块分组或只有未分类，直接平铺任务行
      tasks.forEach(function(t) { var row = renderGanttTaskRow(t, color, minDate, chartWidth, ganttDayW, today, todayStr); leftHTML += row.leftHTML; rightHTML += row.rightHTML; });
      totalContentH += tasks.length * 42;
      }
    }
  });

  // Replace -9999px in rightHTML with actual content height so grid/today lines
  // don't create massive blank scrollable area
  rightHTML = rightHTML.replace(/bottom:-9999px/g, 'height:' + (totalContentH + 80) + 'px');

  if (!state.tasks.length) {
    leftHTML += '<div class="empty-state" style="padding:40px 16px">暂无任务</div>';
  }

  // Adjustment history loads asynchronously after main render (don't block)
  var adjHistoryHTML = '';
  window._ganttAdjRecords = window._ganttAdjRecords || [];

  // ── 构建筛选下拉选项 ───────────────────────────────────────────────────────
  const _ganttMemberOpts = state.members.map(m =>
    `<option value="${m.id}" ${window._ganttFilterAssignee===m.id?'selected':''}>${escHtml(m.name)}</option>`
  ).join('');
  const _ganttStatusLabels = STATUS_LABELS;
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

  // 筛选面板中的选项
  var projectOptions = '<option value="">全部项目</option>' + _ganttProjOpts;
  var moduleOptions = '<option value="">全部模块</option>' + _ganttModOpts;
  var statusOptions = '<option value="">全部状态</option>' + _ganttStatusOpts;
  var assigneeOptions = '<option value="">全部成员</option>' + _ganttMemberOpts;
  var activeFilterCount = [
    window._ganttFilterStatus,
    window._ganttFilterAssignee,
    window._ganttFilterProject,
    window._ganttFilterModule
  ].filter(Boolean).length;

  var weekNavHTML = '<div class="gantt-week-group">' +
    '<button class="gantt-week-btn' + (window._ganttWeekActive==='today'?' active':'') + '" onclick="window.ganttScrollToday()">今天</button>' +
    '<button class="gantt-week-btn' + (window._ganttWeekActive==='thisWeek'?' active':'') + '" onclick="window.ganttJumpToWeek(0)">本周</button>' +
    '<button class="gantt-week-btn' + (window._ganttWeekActive==='nextWeek'?' active':'') + '" onclick="window.ganttJumpToWeek(1)">下周</button>' +
  '</div>';

  var sortHTML = '<span class="gantt-ctrl-label">排序</span>' +
    '<select class="gantt-ctrl-select" onchange="window._ganttSort=this.value;renderGantt()">' + _ganttSortOpts + '</select>';

  var zoomHTML = '<span class="gantt-ctrl-label">缩放</span>' +
    '<div class="gantt-zoom-group">' +
      '<button class="gantt-zoom-btn' + (ganttDayW===20?' active':'') + '" onclick="window.setGanttZoom(20)"' + (ganttDayW===20?' disabled':'') + '>−</button>' +
      '<button class="gantt-zoom-btn' + (ganttDayW===42?' active':'') + '" onclick="window.setGanttZoom(42)"' + (ganttDayW===42?' disabled':'') + '>+</button>' +
    '</div>';

  var expandCollapseHTML = '<button class="gantt-ctrl-expand" onclick="ganttExpandAll()" title="展开所有分组">展开全部</button>' +
    '<button class="gantt-ctrl-expand" onclick="ganttCollapseAll()" title="折叠所有分组">折叠全部</button>';

  const html = `<div class="view-pane">
    <div class="gantt-toolbar">
      <div class="gantt-tb-group">
        ${weekNavHTML}
      </div>
      <div class="gantt-tb-sep"></div>
      <div class="gantt-tb-group" style="gap:6px;flex-wrap:wrap">
        <select class="gantt-inline-select" onchange="window._ganttFilterProject=this.value;window._ganttFilterModule='';renderGantt()">
          ${projectOptions}
        </select>
        <select class="gantt-inline-select" onchange="window._ganttFilterModule=this.value;renderGantt()">
          ${moduleOptions}
        </select>
        <select class="gantt-inline-select" onchange="window._ganttFilterStatus=this.value;renderGantt()">
          ${statusOptions}
        </select>
        <select class="gantt-inline-select" onchange="window._ganttFilterAssignee=this.value;renderGantt()">
          ${assigneeOptions}
        </select>
        ${activeFilterCount > 0 ? '<button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--red)" onclick="clearGanttFilters()">✕ 清除</button>' : ''}
        ${activeFilterCount > 0 ? '<span class="gantt-filter-count">' + _ganttVisibleCount + ' 条</span>' : ''}
      </div>
      <div class="gantt-tb-sep"></div>
      <div class="gantt-tb-group">
        ${sortHTML}
        ${zoomHTML}
        ${expandCollapseHTML}
      </div>
    </div>
    <div class="gantt-wrap" id="gantt-wrap">
      <div class="gantt-inner" style="grid-template-columns:200px ${chartWidth}px">
        <div class="gantt-left" id="gantt-left-col">${leftHTML}</div>
        <div id="gantt-right-col" style="min-width:${chartWidth}px">${rightHTML}</div>
      </div>
    </div>
    ${adjHistoryHTML}
  </div>`;
  document.getElementById('main-content').innerHTML = html;

  // ── 事件委托：确保周导航按钮在 innerHTML 替换后始终可用 ──
  if (!window._ganttNavDelegated) {
    window._ganttNavDelegated = true;
    document.getElementById('main-content').addEventListener('click', function(e) {
      var btn = e.target.closest('.gantt-week-btn');
      if (!btn) return;
      var t = btn.textContent.trim();
      if (t === '今天') window.ganttScrollToday();
      else if (t === '本周') window.ganttJumpToWeek(0);
      else if (t === '下周') window.ganttJumpToWeek(1);
    });
  }

  adjustGanttWrapHeight();
  // Apply saved scroll position (zoom) or default scroll to today
  if (window._ganttTargetScroll !== null && window._ganttTargetScroll !== undefined) {
    var wrapEl = document.getElementById('gantt-wrap');
    if (wrapEl) wrapEl.scrollLeft = window._ganttTargetScroll;
    window._ganttTargetScroll = null;
  } else {
    ganttScrollToday();
  }
  initGanttDrag();
  // 依赖关系连线（双帧确保 DOM 已稳定）
  requestAnimationFrame(function() {
    drawGanttTodayLine();
    requestAnimationFrame(drawGanttDepLines);
  });

  // ── 异步加载调整记录（不阻塞主渲染）──
  (function() {
    var _loadAdj = async function() {
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

      window._ganttAdjRecords = adjRecords;

      // 权限过滤：普通用户只看自己的操作记录
      var isAdminUser = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
      if (!isAdminUser && currentUser) {
        window._ganttAdjRecords = window._ganttAdjRecords.filter(function(r) {
          return r.operator === currentUser.name;
        });
        // 重建项目列表（仅包含可见记录的项目）
        var visibleProjSet = {};
        window._ganttAdjRecords.forEach(function(r) {
          if (r.projectId && r.projectName) visibleProjSet[r.projectId] = r.projectName;
        });
        adjProjects = Object.entries(visibleProjSet).map(function(e) { return {id: e[0], name: e[1]}; });
      }

      var visibleRecords = window._ganttAdjRecords;
      if (visibleRecords.length > 0) {
        var projOpts = adjProjects.map(function(p) {
          return '<option value="' + p.id + '">' + p.name + '</option>';
        }).join('');

        var adjHTML = '<div style="margin-top:16px" id="gantt-adj-section">' +
          '<div class="gantt-adj-toggle" onclick="toggleGanttHistory()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);user-select:none">' +
            '<span id="gantt-adj-arrow" style="font-size:10px;transition:transform .15s">▶</span>' +
            '<span style="font-size:12px;font-weight:600;color:var(--text2)">📋 调整记录</span>' +
            '<span style="font-size:10px;color:var(--text3);margin-left:auto">共 ' + visibleRecords.length + ' 条</span>' +
          '</div>' +
          '<div id="gantt-adj-body" style="display:none;margin-top:8px">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">' +
              '<select id="gantt-adj-filter-proj" onchange="filterGanttHistory()" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2)">' +
                '<option value="">全部项目</option>' + projOpts +
              '</select>' +
              '<input id="gantt-adj-filter-task" oninput="filterGanttHistory()" placeholder="搜索任务…" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2);width:130px">' +
              '<input type="date" id="gantt-adj-filter-from" onchange="filterGanttHistory()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2);width:115px" title="开始日期">' +
              '<span style="font-size:11px;color:var(--text3)">至</span>' +
              '<input type="date" id="gantt-adj-filter-to" onchange="filterGanttHistory()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text2);width:115px" title="结束日期">' +
            '</div>' +
            '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)" id="gantt-adj-table-wrap">' +
              buildGanttHistoryTable(visibleRecords) +
            '</div>' +
          '</div>' +
        '</div>';

        var existing = document.getElementById('gantt-adj-section');
        if (existing) existing.remove();
        var mc = document.getElementById('main-content');
        if (mc) {
          var vp = mc.querySelector('.view-pane');
          if (vp) vp.insertAdjacentHTML('beforeend', adjHTML);
        }
      }
    };
    _loadAdj();
  })();
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
  const overdueDays = isOverdue ? Math.floor((today - endD) / 86400000) : 0;
  const waitingDeps = isWaitingDeps(t);
  const canDrag = canAdjustGantt(t);
  const modTag = t.moduleId ? '<span class="gantt-mod-tag">' + escHtml(moduleName(t.moduleId)) + '</span>' : '';

  // V23: 左侧任务名信息密度升级 — 状态点 + 标题 + 模块 tag + 负责人头像
  var assigneeIds = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [t.assignee] : []);
  var firstAssignee = assigneeIds[0] ? state.members.find(function(m){return m.id===assigneeIds[0];}) : null;
  var extraCount = Math.max(0, assigneeIds.length - 1);
  var avatarHTML = firstAssignee
    ? '<div class="gantt-row-avatar" style="background:' + memberColor(firstAssignee.id) + '" title="' + escHtml(firstAssignee.name) + (extraCount ? ' +' + extraCount + ' 人' : '') + '">' +
        memberInitial(firstAssignee.id) +
        (extraCount ? '<span class="gantt-row-avatar-extra">+' + extraCount + '</span>' : '') +
      '</div>'
    : '<div class="gantt-row-avatar gantt-row-avatar-empty" title="未分配">·</div>';

  var statusCls = t.done ? 'sd-done'
                : t.status === 'blocked' ? 'sd-blocked'
                : t.status === 'doing'   ? 'sd-doing'
                : t.status === 'waiting' ? 'sd-waiting'
                : 'sd-todo';

  var barClasses = 'gantt-bar' +
    (t.done ? ' is-done' : '') +
    (isOverdue ? ' is-overdue' : '') +
    (waitingDeps ? ' is-blocked' : '') +
    (t.status === 'blocked' ? ' is-status-blocked' : '') +
    (t.milestone ? ' is-milestone' : '') +
    (!canDrag ? ' is-locked' : '');

  return {
    leftHTML: '<div class="gantt-row-name' + (t.done ? ' done-row' : '') + (t.milestone ? ' milestone-row' : '') + '" onclick="openEditTask(\'' + t.id + '\')" title="' + escHtml(t.title) + '  |  ' + startStr + ' ~ ' + endStr + '">' +
      '<span class="gantt-status-dot ' + statusCls + '"></span>' +
      '<span class="gantt-row-title">' + (t.milestone ? '◆ ' : '') + (waitingDeps ? '⚠ ' : '') + escHtml(t.title) + '</span>' +
      modTag +
      avatarHTML +
    '</div>',

    rightHTML: '<div class="gantt-row-track' + (t.done ? ' is-done' : '') + '" style="width:' + chartWidth + 'px">' +
      '<div class="' + barClasses + '" data-task-id="' + t.id + '" data-start-offset="' + startOffset + '" data-dur-days="' + durDays + '" title="' + escHtml(t.title) + '  |  ' + startStr + ' ~ ' + endStr + '" ondblclick="openEditTask(\'' + t.id + '\')" style="left:' + left + 'px;width:' + width + 'px;background:' + barColor + ';' + (canDrag ? '' : 'cursor:default;') + '">' +
        '<span class="gantt-bar-label">' + (t.milestone ? '◆ ' : '') + escHtml(t.title) + '</span>' +
        (canDrag ? '<div class="gantt-resize-handle" data-task-id="' + t.id + '" title="拖动调整截止日期"></div>' : '') +
      '</div>' +
      (isOverdue ? '<span class="gantt-overdue-badge" style="left:' + (left + width + 3) + 'px">已逾期' + overdueDays + '天</span>' : '') +
      (t.milestone ? '<div class="gantt-milestone-marker" style="left:' + (left + width) + 'px"></div>' : '') +
      (t.due === todayStr ? '<div class="gantt-today-flag">今</div>' : '') +
    '</div>'
  };
}

window.setGanttZoom = function(w) {
  if (window._ganttRendering) return;
  window._ganttRendering = true;
  // Pre-calculate target scroll so renderGantt can apply it synchronously
  var wrap = document.getElementById('gantt-wrap');
  var centerDays = 0;
  if (wrap && window._ganttMinDate && ganttDayW) {
    centerDays = (wrap.scrollLeft + wrap.clientWidth / 2) / ganttDayW;
  }
  ganttDayW = w;
  window._ganttTargetScroll = centerDays > 0 ? Math.max(0, centerDays * w - (wrap ? wrap.clientWidth / 2 : 200)) : null;
  // renderGantt body has no await — it runs synchronously, so we can clear the flag immediately
  renderGantt();
  window._ganttRendering = false;
};

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

window.toggleGanttFilterPanel = function(e) {
  e.stopPropagation();
  var panel = document.getElementById('gantt-filter-panel');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  window._ganttFilterPanelOpen = !isOpen;
  if (!isOpen && window.lucide) window.lucide.createIcons();
};

window.clearGanttFilters = function() {
  window._ganttFilterStatus = '';
  window._ganttFilterAssignee = '';
  window._ganttFilterProject = '';
  window._ganttFilterModule = '';
  renderGantt();
};

function adjustGanttWrapHeight() {
  var wrap = document.getElementById('gantt-wrap');
  if (!wrap) return;
  var top = wrap.getBoundingClientRect().top;
  var avail = window.innerHeight - top - 24;
  wrap.style.maxHeight = 'none';
  var contentH = wrap.scrollHeight;
  wrap.style.maxHeight = Math.min(contentH, Math.max(200, avail)) + 'px';

  // 注册一次性 resize 监听，窗口变化时同步调整高度
  if (!window._ganttResizeBound) {
    window._ganttResizeBound = true;
    var tid = 0;
    window.addEventListener('resize', function() {
      clearTimeout(tid);
      tid = setTimeout(function() {
        var w = document.getElementById('gantt-wrap');
        if (!w) return;
        var t = w.getBoundingClientRect().top;
        var a = window.innerHeight - t - 24;
        w.style.maxHeight = 'none';
        w.style.maxHeight = Math.min(w.scrollHeight, Math.max(200, a)) + 'px';
      }, 150);
    });
  }
}

// ── 动态绘制今日标记线（虚线）──
function drawGanttTodayLine() {
  var rightCol = document.getElementById('gantt-right-col');
  if (!rightCol) return;
  // 移除旧标记
  var old = rightCol.querySelectorAll('.gantt-today-overlay');
  for (var i = 0; i < old.length; i++) old[i].remove();

  var offset = window._ganttTodayOffset;
  var dayW = window._ganttDayW || ganttDayW || 42;
  if (offset === undefined || offset === null) return;

  var contentH = Math.max(rightCol.scrollHeight, rightCol.offsetHeight, 800);

  // Background column
  var bg = document.createElement('div');
  bg.className = 'gantt-today-overlay';
  bg.style.cssText = 'position:absolute;left:' + (offset * dayW) + 'px;top:0;width:' + dayW + 'px;height:' + contentH + 'px;background:linear-gradient(180deg,rgba(37,99,235,.08) 0%,rgba(37,99,235,.02) 100%);pointer-events:none;z-index:1';
  rightCol.appendChild(bg);

  // Dashed vertical line
  var line = document.createElement('div');
  line.className = 'gantt-today-overlay';
  line.id = 'gantt-today-line';
  line.style.cssText = 'position:absolute;left:' + (offset * dayW + dayW / 2) + 'px;top:0;width:0;height:' + contentH + 'px;border-left:2px dashed #2563eb;pointer-events:none;z-index:1;opacity:.85';
  rightCol.appendChild(line);

  // TODAY label
  var label = document.createElement('div');
  label.className = 'gantt-today-overlay';
  label.style.cssText = 'position:absolute;left:' + (offset * dayW + dayW / 2) + 'px;top:4px;transform:translateX(-50%);background:#2563eb;color:#fff;font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;white-space:nowrap;pointer-events:none;z-index:3;letter-spacing:.5px';
  label.textContent = 'TODAY';
  rightCol.appendChild(label);
}

window.ganttScrollToday = function() {
  window._ganttWeekActive = 'today';
  updateGanttWeekBtns();
  var sc = document.getElementById('gantt-wrap');
  if (!sc) return;
  var offset = window._ganttTodayOffset;
  var dayW = window._ganttDayW || ganttDayW || 42;
  if (offset !== undefined && offset !== null && sc) {
    var targetLeft = offset * dayW + dayW / 2;
    sc.scrollLeft = Math.max(0, targetLeft - sc.clientWidth / 3);
  }
};

// 更新周导航按钮的选中态（直接操作 DOM，无需重渲染）
function updateGanttWeekBtns() {
  var btns = document.querySelectorAll('.gantt-week-btn');
  for (var i = 0; i < btns.length; i++) {
    var t = btns[i].textContent.trim();
    var active = (t === '今天' && window._ganttWeekActive === 'today') ||
                 (t === '本周' && window._ganttWeekActive === 'thisWeek') ||
                 (t === '下周' && window._ganttWeekActive === 'nextWeek');
    btns[i].classList.toggle('active', active);
  }
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

  // Ensure tooltip element exists (PRD §2.7: use .gantt-drag-tooltip class)
  var tip = document.getElementById('gantt-drag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'gantt-drag-tip';
    tip.className = 'gantt-drag-tooltip';
    tip.style.display = 'none';
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

// ─── Gantt history toggle ───────────────────────────────────
window.toggleGanttHistory = function() {
  var body = document.getElementById('gantt-adj-body');
  var arrow = document.getElementById('gantt-adj-arrow');
  if (!body || !arrow) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.textContent = isOpen ? '▶' : '▼';
};

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
  window._ganttWeekActive = offsetWeeks === 0 ? 'thisWeek' : 'nextWeek';
  updateGanttWeekBtns();
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

  var dayW = window._ganttDayW || ganttDayW || 42;
  var scrollLeft = diffDays * dayW - 16;

  var rightCol = document.getElementById('gantt-wrap');
  if (rightCol) {
    rightCol.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
  }
};

// ── 看板拖拽处理 ──
var _kanbanDragTaskId = null;

window.onKanbanDragStart = function(e) {
  var wrap = e.currentTarget;
  _kanbanDragTaskId = wrap.getAttribute('data-task-id');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _kanbanDragTaskId);
  wrap.style.opacity = '0.5';
  setTimeout(function() { wrap.classList.add('kanban-dragging'); }, 0);
};

window.onKanbanDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var col = e.currentTarget;
  col.classList.add('kanban-drop-target');
};

window.onKanbanDragLeave = function(e) {
  e.currentTarget.classList.remove('kanban-drop-target');
};

window.onKanbanDrop = async function(e, newStatus) {
  e.preventDefault();
  var col = e.currentTarget;
  col.classList.remove('kanban-drop-target');

  var taskId = e.dataTransfer.getData('text/plain') || _kanbanDragTaskId;
  _kanbanDragTaskId = null;

  var t = state.tasks.find(function(x) { return x.id === taskId; });
  if (!t) return;
  if (t.status === newStatus) return;

  var oldStatus = t.status;
  t.status = newStatus;
  t.done = (newStatus === 'done');
  if (t.done && !t.completedAt) {
    t.completedAt = new Date().toISOString();
    t.completedBy = currentUser ? currentUser.id : '';
  } else if (!t.done) {
    t.completedAt = null;
    t.completedBy = null;
  }

  addTimelineEntry(t, '状态变更', '从「' + oldStatus + '」改为「' + newStatus + '」（看板拖拽）');

  _lastLoadTime = Date.now();
  await syncTask(t);
  render();

  if (t.done) {
    logAction('完成任务', '拖拽完成「' + t.title + '」');
  }
};

document.addEventListener('dragend', function(e) {
  var wrap = e.target.closest('.kanban-card-wrap');
  if (wrap) {
    wrap.style.opacity = '';
    wrap.classList.remove('kanban-dragging');
  }
  document.querySelectorAll('.kanban-drop-target').forEach(function(el) {
    el.classList.remove('kanban-drop-target');
  });
});



// ─── 月历视图 V25 ──────────────────────────────────────────────
window._calYear          = window._calYear          || new Date().getFullYear();
window._calMonth         = window._calMonth         || new Date().getMonth(); // 0-indexed
window._calFilterProject = window._calFilterProject || '';
window._calFilterMember  = window._calFilterMember  || '';
window._calFilterModule  = window._calFilterModule  || '';
window._calFilterStatus  = window._calFilterStatus  || '';

var CAL_MONTH_NAMES   = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
var CAL_WEEKDAY_NAMES = ['周一','周二','周三','周四','周五','周六','周日'];

window.calPrev = function() {
  if (window._calMonth === 0) { window._calYear--; window._calMonth = 11; }
  else { window._calMonth--; }
  calCloseMonthPicker();
  renderCalendar();
};

window.calNext = function() {
  if (window._calMonth === 11) { window._calYear++; window._calMonth = 0; }
  else { window._calMonth++; }
  calCloseMonthPicker();
  renderCalendar();
};

window.calGoToday = function() {
  var now = new Date();
  window._calYear  = now.getFullYear();
  window._calMonth = now.getMonth();
  calCloseMonthPicker();
  renderCalendar();
};

// ── Helpers ───────────────────────────────────────────────
function calGetWeekNumber(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function calHeatLevel(count) {
  if (count <= 2) return 0;
  if (count <= 5) return 1;
  if (count <= 9) return 2;
  return 3;
}

function calTaskPillHTML(t, todayStr) {
  var projColor = '#c5c5c5';
  if (t.projectId) {
    var p = state.projects.find(function(x) { return x.id === t.projectId; });
    if (p) projColor = PROJ_COLORS[(p.colorIdx || 0) % PROJ_COLORS.length];
  }
  var pillClass = 'cal-task-pill';
  if (t.done) {
    pillClass += ' cal-done';
  } else {
    var dueDate = t.due ? t.due.slice(0, 10) : '';
    if (dueDate && dueDate < todayStr) {
      pillClass += ' cal-overdue';
    } else if (t.priority === '紧急') {
      pillClass += ' cal-urgent';
    }
  }
  var title = escHtml(t.title);
  var displayTitle = title.length > 16 ? title.slice(0, 16) + '…' : title;
  return '<div class="' + pillClass + '" ' +
    'style="border-left-color:' + projColor + '" ' +
    'onclick="event.stopPropagation();openEditTask(\'' + t.id + '\')" ' +
    'title="' + escHtml(t.title) + '">' +
    '<span class="cal-dot" style="background:' + projColor + '"></span>' +
    displayTitle +
    '</div>';
}

// ── Main render ──────────────────────────────────────────
function renderCalendar() {
  document.getElementById('header-title').textContent = '月历';
  document.getElementById('header-sub').textContent = '';
  document.getElementById('header-add-btn').style.display = 'none';

  var yr = window._calYear;
  var mo = window._calMonth;
  var filProj  = window._calFilterProject || '';
  var filMem   = window._calFilterMember  || '';
  var filMod   = window._calFilterModule  || '';
  var filStat  = window._calFilterStatus  || '';

  var now = new Date();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  // Build filtered task-by-date index
  var tasksByDate = {};
  state.tasks.forEach(function(t) {
    if (!t.due) return;
    if (filProj && t.projectId !== filProj) return;
    if (filMod && t.moduleId !== filMod) return;
    if (filStat && t.status !== filStat) return;
    if (filMem) {
      var match = (t.assignee === filMem) || ((t.assignees || []).indexOf(filMem) !== -1);
      if (!match) return;
    }
    var dueDate = t.due.slice(0, 10);
    if (!tasksByDate[dueDate]) tasksByDate[dueDate] = [];
    tasksByDate[dueDate].push(t);
  });

  // Grid cell data
  var firstDay = new Date(yr, mo, 1);
  var lastDay  = new Date(yr, mo + 1, 0);
  var startDow = firstDay.getDay();
  var startOffset = (startDow + 6) % 7;

  var cells = [];
  for (var i = 0; i < startOffset; i++) cells.push(null);
  for (var d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ day: d, dateStr: yr + '-' + String(mo+1).padStart(2,'0') + '-' + String(d).padStart(2,'0') });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  // Week numbers per row
  var weekNums = [];
  for (var row = 0; row < cells.length / 7; row++) {
    var repCell = null;
    for (var ci = row * 7; ci < row * 7 + 7; ci++) {
      if (cells[ci]) { repCell = cells[ci]; break; }
    }
    weekNums.push(repCell ? calGetWeekNumber(new Date(yr, mo, repCell.day)) : null);
  }

  // Filter option lists
  var projFilterOpts = '<option value="">全部项目</option>' +
    state.projects.map(function(p) {
      return '<option value="' + p.id + '"' + (filProj === p.id ? ' selected' : '') + '>' + escHtml(p.name) + '</option>';
    }).join('');
  var memberFilterOpts = '<option value="">全部成员</option>' +
    state.members.map(function(m) {
      return '<option value="' + m.id + '"' + (filMem === m.id ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
    }).join('');

  // Module filter: show modules of selected project (or all)
  var relModules = filProj ? state.modules.filter(function(m) { return m.projectId === filProj; }) : state.modules;
  var moduleFilterOpts = '<option value="">全部模块</option>' +
    relModules.map(function(m) {
      return '<option value="' + m.id + '"' + (filMod === m.id ? ' selected' : '') + '>' + escHtml(m.name) + '</option>';
    }).join('');
  if (!filProj) moduleFilterOpts = '<option value="">全部模块</option>'; // only show modules when project selected

  var statusFilterOpts = '<option value="">全部状态</option>' +
    [{v:'todo',l:'待启动'},{v:'doing',l:'进行中'},{v:'blocked',l:'阻塞中'},{v:'waiting',l:'待反馈'},{v:'done',l:'已完成'}].map(function(s) {
      return '<option value="' + s.v + '"' + (filStat === s.v ? ' selected' : '') + '>' + s.l + '</option>';
    }).join('');

  document.getElementById('header-sub').textContent = yr + '年 ' + CAL_MONTH_NAMES[mo];

  // ── Build HTML ──────────────────────────────────────────
  var html = '<div class="view-pane cal-view">';

  // Nav bar
  html += '<div class="cal-nav">' +
    '<button class="btn btn-ghost btn-sm" onclick="calPrev()"><i data-lucide="chevron-left" style="width:14px;height:14px"></i></button>' +
    '<span class="cal-month-label" onclick="calOpenMonthPicker()" title="点击选择月份">' + yr + '年 ' + CAL_MONTH_NAMES[mo] + '</span>' +
    '<button class="btn btn-ghost btn-sm" onclick="calNext()"><i data-lucide="chevron-right" style="width:14px;height:14px"></i></button>' +
    '<div class="cal-filter-wrap">' +
      '<select class="cal-filter-select" onchange="calOnFilterProject(this.value)" title="筛选项目">' + projFilterOpts + '</select>' +
      '<select class="cal-filter-select" onchange="calOnFilterModule(this.value)" title="筛选模块"' + (filProj ? '' : ' disabled') + '>' + moduleFilterOpts + '</select>' +
      '<select class="cal-filter-select" onchange="calOnFilterMember(this.value)" title="筛选成员">' + memberFilterOpts + '</select>' +
      '<select class="cal-filter-select" onchange="calOnFilterStatus(this.value)" title="筛选状态">' + statusFilterOpts + '</select>' +
    '</div>' +
    '<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="calGoToday()">今天</button>' +
    (filProj || filMem || filMod || filStat ?
      '<button class="btn btn-ghost btn-sm cal-clear-btn" onclick="calClearFilters()" title="清除筛选">✕</button>' : '') +
    '<div class="cal-month-picker" id="cal-month-picker">' + calBuildMonthPickerHTML(yr, mo) + '</div>' +
  '</div>';

  // Stats bar (above grid)
  var totalTasks = 0;
  var totalOverdue = 0;
  // Count totals first
  var allDays = Object.keys(tasksByDate);
  allDays.forEach(function(d) {
    var dayTasks = tasksByDate[d] || [];
    totalTasks += dayTasks.length;
    dayTasks.forEach(function(t) {
      if (!t.done && t.due && t.due.slice(0, 10) < todayStr) totalOverdue++;
    });
  });

  html += '<div class="cal-stats-bar">' +
    '<span class="cal-stat-item"><i data-lucide="calendar-check" style="width:14px;height:14px"></i> 本月 <b style="color:var(--text)">' + totalTasks + '</b> 项任务</span>';
  if (totalOverdue > 0) {
    html += '<span class="cal-stat-divider"></span>' +
      '<span class="cal-stat-item cal-stat-overdue"><i data-lucide="alert-circle" style="width:14px;height:14px"></i> <b style="color:var(--red)">' + totalOverdue + '</b> 项逾期</span>';
  }
  // Heatmap legend
  html += '<span style="margin-left:auto;display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-xxs);color:var(--text3)">' +
    '<span>少</span>' +
    '<span class="cal-heat-dot cal-heat-0"></span>' +
    '<span class="cal-heat-dot cal-heat-1"></span>' +
    '<span class="cal-heat-dot cal-heat-2"></span>' +
    '<span class="cal-heat-dot cal-heat-3"></span>' +
    '<span>多</span>' +
  '</span>' +
  '</div>';

  // Grid
  html += '<div class="cal-grid-wrap cal-fade-in">';
  html += '<div class="cal-grid">';
  var weekDayHeaders = ['一','二','三','四','五','六','日'];
  html += '<div class="cal-wn-header">#</div>';
  weekDayHeaders.forEach(function(w, wi) {
    html += '<div class="cal-week-header' + (wi >= 5 ? ' cal-weekend' : '') + '">' + w + '</div>';
  });

  var MAX_VISIBLE = 3;

  cells.forEach(function(cell, idx) {
    var rowIdx = Math.floor(idx / 7);
    var colIdx = idx % 7;

    if (colIdx === 0) {
      html += '<div class="cal-week-num">' + (weekNums[rowIdx] ? 'W' + weekNums[rowIdx] : '') + '</div>';
    }

    if (!cell) { html += '<div class="cal-cell cal-cell-empty"></div>'; return; }

    var isToday = cell.dateStr === todayStr;
    var dayOfWeek = (startOffset + cell.day - 1) % 7;
    var isWeekend = dayOfWeek >= 5;
    var dayTasks = tasksByDate[cell.dateStr] || [];
    var activeTasks = dayTasks.filter(function(t) { return !t.done; });
    var heatLvl = calHeatLevel(activeTasks.length);
    var overdueCount = dayTasks.filter(function(t) { return !t.done && t.due && t.due.slice(0, 10) < todayStr; }).length;

    html += '<div class="cal-cell cal-heat-' + heatLvl +
      (isToday ? ' cal-today' : '') + (isWeekend ? ' cal-weekend' : '') +
      '" onclick="calDayClick(\'' + cell.dateStr + '\')" data-dayofweek="' + dayOfWeek + '">' +
      '<div class="cal-day-top" data-weekday="' + CAL_WEEKDAY_NAMES[dayOfWeek] + '">' +
        (overdueCount > 0 ? '<span class="cal-overdue-badge" title="' + overdueCount + ' 项逾期任务">' + overdueCount + '</span>' : '') +
        '<span class="cal-day-num' + (isToday ? ' today' : '') + '">' + cell.day + '</span>' +
      '</div>' +
      '<div class="cal-day-content">';

    var visibleTasks = dayTasks.slice(0, MAX_VISIBLE);
    visibleTasks.forEach(function(t) {
      html += calTaskPillHTML(t, todayStr);
    });

    if (dayTasks.length > MAX_VISIBLE) {
      var remaining = dayTasks.length - MAX_VISIBLE;
      html += '<div class="cal-more" onclick="event.stopPropagation();calShowDayModal(\'' + cell.dateStr + '\')">' +
        '+ ' + remaining + ' 项更多</div>';
    }

    html += '</div></div>';
  });

  html += '</div>'; // .cal-grid
  html += '</div>'; // .cal-grid-wrap
  html += '</div>'; // .view-pane

  document.getElementById('main-content').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Month picker ─────────────────────────────────────────
function calBuildMonthPickerHTML(yr, mo) {
  var html = '<div class="cal-picker-header">' +
    '<button class="cal-picker-year-btn" onclick="event.stopPropagation();calPickerPrevYear()">' +
      '<i data-lucide="chevron-left" style="width:14px;height:14px"></i></button>' +
    '<span class="cal-picker-year" id="cal-picker-year-label">' + yr + '</span>' +
    '<button class="cal-picker-year-btn" onclick="event.stopPropagation();calPickerNextYear()">' +
      '<i data-lucide="chevron-right" style="width:14px;height:14px"></i></button>' +
  '</div>' +
  '<div class="cal-picker-months" id="cal-picker-months">' +
    CAL_MONTH_NAMES.map(function(m, i) {
      return '<button class="cal-picker-month-btn' + (i === mo ? ' active' : '') +
        '" onclick="event.stopPropagation();calSelectMonth(' + i + ')">' + m + '</button>';
    }).join('') +
  '</div>';
  return html;
}

function calRefreshMonthPicker() {
  var yr = window._calYear;
  var mo = window._calMonth;
  var picker = document.getElementById('cal-month-picker');
  if (!picker) return;
  picker.innerHTML = calBuildMonthPickerHTML(yr, mo);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.calOpenMonthPicker = function() {
  var picker = document.getElementById('cal-month-picker');
  if (!picker) return;
  if (picker.classList.contains('open')) { calCloseMonthPicker(); return; }
  calRefreshMonthPicker();
  picker.classList.add('open');
};

function calCloseMonthPicker() {
  var picker = document.getElementById('cal-month-picker');
  if (picker) picker.classList.remove('open');
}

window.calSelectMonth = function(monthIdx) {
  window._calMonth = monthIdx;
  calCloseMonthPicker();
  renderCalendar();
};

window.calPickerPrevYear = function() {
  window._calYear--;
  calRefreshMonthPicker();
};

window.calPickerNextYear = function() {
  window._calYear++;
  calRefreshMonthPicker();
};

document.addEventListener('click', function(e) {
  if (!e.target.closest('.cal-month-picker') && !e.target.closest('.cal-month-label')) {
    calCloseMonthPicker();
  }
});

// ── Filters ──────────────────────────────────────────────
window.calOnFilterProject = function(projId) {
  window._calFilterProject = projId || '';
  window._calFilterModule  = ''; // reset module when project changes
  renderCalendar();
};

window.calOnFilterModule = function(moduleId) {
  window._calFilterModule = moduleId || '';
  renderCalendar();
};

window.calOnFilterMember = function(memberId) {
  window._calFilterMember = memberId || '';
  renderCalendar();
};

window.calOnFilterStatus = function(status) {
  window._calFilterStatus = status || '';
  renderCalendar();
};

window.calClearFilters = function() {
  window._calFilterProject = '';
  window._calFilterModule  = '';
  window._calFilterMember  = '';
  window._calFilterStatus  = '';
  renderCalendar();
};

// ── Day click / detail modal ─────────────────────────────
window.calDayClick = function(dateStr) {
  calShowDayModal(dateStr);
};

window.calShowDayModal = function(dateStr) {
  var filProj = window._calFilterProject || '';
  var filMem  = window._calFilterMember  || '';
  var filMod  = window._calFilterModule  || '';
  var filStat = window._calFilterStatus  || '';
  var now = new Date();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  var dayTasks = state.tasks.filter(function(t) {
    if (!t.due || t.due.slice(0, 10) !== dateStr) return false;
    if (filProj && t.projectId !== filProj) return false;
    if (filMod && t.moduleId !== filMod) return false;
    if (filStat && t.status !== filStat) return false;
    if (filMem) {
      var match = (t.assignee === filMem) || ((t.assignees || []).indexOf(filMem) !== -1);
      if (!match) return false;
    }
    return true;
  });

  var modalTitle = dateStr + ' · ' + dayTasks.length + ' 个任务';
  var html = (typeof modalHeader === 'function' ? modalHeader(modalTitle) : '') +
    '<div class="modal-body" style="max-height:55vh;overflow-y:auto;padding:0 8px">' +
    (dayTasks.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">当天无任务</div>' : '') +
    dayTasks.sort(function(a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.title || '').localeCompare(b.title || ''); }).map(function(t) {
      var projColor = '#c5c5c5';
      if (t.projectId) {
        var p = state.projects.find(function(x) { return x.id === t.projectId; });
        if (p) projColor = PROJ_COLORS[(p.colorIdx || 0) % PROJ_COLORS.length];
      }
      var statusLabel = STATUS_LABELS[t.status] || t.status || '';
      var isOverdue = !t.done && t.due && t.due.slice(0, 10) < todayStr;
      var statusCls = t.status === 'done' ? 'done' : (isOverdue ? 'overdue' : '');
      return '<div class="cal-modal-task" onclick="closeModal();openEditTask(\'' + t.id + '\')">' +
        '<span class="cal-modal-left-bar" style="background:' + projColor + '"></span>' +
        '<span style="flex:1;' + (t.done ? 'text-decoration:line-through;opacity:.5;' : '') + '">' + escHtml(t.title) + '</span>' +
        '<span class="cal-modal-status ' + statusCls + '">' + statusLabel + '</span>' +
      '</div>';
    }).join('') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn btn-ghost" onclick="closeModal()">关闭</button>' +
      '<button class="btn btn-primary btn-sm" onclick="closeModal();openAddTask(null,\'' + dateStr + '\')">+ 新建任务</button>' +
    '</div>';
  if (typeof openModal === 'function') openModal(html);
};

// ── 全局搜索 ──
function applyGlobalSearch(tasks) {
  var q = window._globalSearch;
  if (!q) return tasks;
  return tasks.filter(function(t) {
    var titleMatch = t.title && t.title.toLowerCase().indexOf(q) !== -1;
    var descMatch  = t.description && t.description.toLowerCase().indexOf(q) !== -1;
    var projMatch  = false;
    if (t.projectId) {
      var p = state.projects.find(function(x) { return x.id === t.projectId; });
      projMatch = p && p.name.toLowerCase().indexOf(q) !== -1;
    }
    var assigneeMatch = false;
    var members = [t.assignee].concat(t.assignees || []).filter(Boolean);
    members.forEach(function(mid) {
      var m = state.members.find(function(x) { return x.id === mid; });
      if (m && m.name.toLowerCase().indexOf(q) !== -1) assigneeMatch = true;
    });
    return titleMatch || descMatch || projMatch || assigneeMatch;
  });
}

function renderSearchBanner() {
  var q = window._globalSearch;
  if (!q) return '';
  return '<div style="background:var(--accent-bg,rgba(37,99,235,.06));border-bottom:1px solid var(--accent);' +
    'padding:6px 20px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px">' +
    '<i data-lucide="search" style="width:13px;height:13px"></i>' +
     escHtml('搜索「' + q + '」的结果') +
    '<span style="margin-left:auto;cursor:pointer;color:var(--text3)" onclick="document.getElementById(\'task-search-input\').value=\'\';onGlobalSearch(\'\')">✕ 清除</span>' +
  '</div>';
}

// ─── 沉默任务判定 ──────────────────────────────────────────────
// 取最后更新时间：max(t.logs[].date) > t.updated_at > t.createdAt
function getLastUpdateTs(t) {
  var ts = 0;
  if (t.logs && t.logs.length) {
    t.logs.forEach(function(l) {
      var lt = new Date(l.date || l.createdAt || 0).getTime();
      if (lt > ts) ts = lt;
    });
  }
  if (t.updated_at) {
    var ut = new Date(t.updated_at).getTime();
    if (ut > ts) ts = ut;
  }
  if (!ts && t.createdAt) ts = new Date(t.createdAt).getTime();
  return ts;
}

// 距今工作日数
function getStaleWorkdays(t) {
  var ts = getLastUpdateTs(t);
  if (!ts) return 0;
  return countWorkdays(new Date(ts), new Date());
}

// 是否沉默：未完成 + 5 工作日以上未更新（且不是 blocked，blocked 单独算）
window.SILENT_THRESHOLD_WORKDAYS = 5;
function isSilent(t) {
  if (!t || t.done) return false;
  if (t.status === 'blocked') return false;  // blocked 已是独立指标，不双重统计
  return getStaleWorkdays(t) >= window.SILENT_THRESHOLD_WORKDAYS;
}

window.getLastUpdateTs = getLastUpdateTs;
window.getStaleWorkdays = getStaleWorkdays;
window.isSilent = isSilent;

// ─── 概览 Dashboard ──────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════
// PM 总览 · 数据计算辅助
// ═══════════════════════════════════════════════════════════════

// 计算今天（不含时间）
function _dbToday() {
  var t = new Date(); t.setHours(0,0,0,0); return t;
}

// YYYY-MM-DD
function _dbDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

// 本周一 0 点
function _dbWeekStart() {
  var d = _dbToday();
  var dow = d.getDay() || 7;  // 周日=0 → 7
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

// 本周日 23:59:59
function _dbWeekEnd() {
  var d = _dbWeekStart();
  d.setDate(d.getDate() + 6);
  d.setHours(23,59,59,999);
  return d;
}

// 取活跃项目（未归档）
function _dbActiveProjects() {
  return (state.projects || []).filter(function(p) {
    return !p.status || p.status === 'active' || p.status === 'on_hold';
  });
}

// 取项目下未归档的所有任务
function _dbProjectTasks(projectId) {
  return (state.tasks || []).filter(function(t) { return t.projectId === projectId; });
}

// 计算 4 个核心指标（用于指标卡 + 快照）
function _dbCoreMetrics() {
  var todayStr = _dbDateStr(_dbToday());
  var weekStart = _dbWeekStart();
  var activeProjIds = _dbActiveProjects().map(function(p) { return p.id; });
  var inScope = function(t) {
    return !t.projectId || activeProjIds.indexOf(t.projectId) >= 0;
  };
  var allTasks = (state.tasks || []).filter(inScope);
  var active = allTasks.filter(function(t) { return !t.done; });

  var overdue   = active.filter(function(t) { return t.due && t.due < todayStr; });
  var blocked   = active.filter(function(t) { return t.status === 'blocked'; });
  var silent    = active.filter(function(t) { return isSilent(t); });
  var weekDone  = allTasks.filter(function(t) {
    if (!t.done || !t.completedAt) return false;
    return new Date(t.completedAt) >= weekStart;
  });

  return {
    overdue: overdue,
    blocked: blocked,
    silent: silent,
    weekDone: weekDone,
    counts: {
      overdue: overdue.length,
      blocked: blocked.length,
      silent: silent.length,
      weekDone: weekDone.length
    }
  };
}

// ─── 沉默任务：判断本任务是否为"今天该追的人"清单条目 ────────
// 一个任务出现在"该追清单"的条件（满足任一即可）：
//   1. 逾期
//   2. 沉默（5 工作日未更新）
//   3. status === 'blocked'
//   4. status === 'waiting' 且超过 5 个工作日（卡审批超时）
function _dbIsFollowUpItem(t) {
  if (!t || t.done) return false;
  var todayStr = _dbDateStr(_dbToday());
  if (t.due && t.due < todayStr) return true;       // 逾期
  if (t.status === 'blocked') return true;           // 阻塞
  if (isSilent(t)) return true;                      // 沉默
  if (t.status === 'waiting') {
    // waiting 超过 5 工作日 → 卡审批
    var lastTs = getLastUpdateTs(t);
    if (lastTs && countWorkdays(new Date(lastTs), new Date()) >= 5) return true;
  }
  return false;
}

// ─── 给每个跟进项打标签 ──────────────────────────────────────
function _dbFollowUpReason(t) {
  var todayStr = _dbDateStr(_dbToday());
  // 1. 阻塞优先级最高（已主动标记 + 有原因）
  if (t.status === 'blocked') {
    var days = getBlockedDays(t);
    var reason = (t.blocked_reason || '').slice(0, 18);
    return { type: 'blocked', text: '阻塞 ' + days + ' 天' + (reason ? ' · ' + reason : ''), severity: 'purple' };
  }
  // 2. 逾期
  if (t.due && t.due < todayStr) {
    var od = countWorkdays(new Date(t.due), _dbToday());
    return { type: 'overdue', text: '逾期 ' + od + ' 天', severity: 'red' };
  }
  // 3. waiting 超 5 工作日
  if (t.status === 'waiting') {
    var lastTs = getLastUpdateTs(t);
    if (lastTs) {
      var d = countWorkdays(new Date(lastTs), new Date());
      if (d >= 5) return { type: 'waiting_long', text: '「待反馈」' + d + ' 天', severity: 'amber' };
    }
  }
  // 4. 沉默
  if (isSilent(t)) {
    var sw = getStaleWorkdays(t);
    return { type: 'silent', text: sw + ' 工作日未更新', severity: 'amber' };
  }
  return null;
}

// ─── 项目健康度 ─────────────────────────────────────────────
function _dbProjectHealth(p) {
  var tasks = _dbProjectTasks(p.id).filter(function(t) { return !t.done; });
  var todayStr = _dbDateStr(_dbToday());
  var overdue = tasks.filter(function(t) { return t.due && t.due < todayStr; });
  var silent  = tasks.filter(function(t) { return isSilent(t); });
  var blocked = tasks.filter(function(t) { return t.status === 'blocked'; });

  // 阻塞链：blocked 任务 + 下游有人在等
  var hasBlockChain = blocked.some(function(b) {
    return tasks.some(function(t) {
      return t.dependencies && t.dependencies.indexOf(b.id) >= 0;
    });
  });

  // 里程碑滑坡：本项目里程碑任务里有逾期
  var milestoneSlip = tasks.some(function(t) {
    return t.milestone && t.due && t.due < todayStr;
  });

  var color, reasons = [];
  if (overdue.length) reasons.push(overdue.length + ' 任务逾期');
  if (silent.length)  reasons.push(silent.length + ' 沉默');
  if (blocked.length) reasons.push(blocked.length + ' 阻塞');
  if (hasBlockChain)  reasons.push('阻塞链影响下游');
  if (milestoneSlip)  reasons.push('里程碑滑坡');

  if (overdue.length || hasBlockChain || milestoneSlip) color = 'red';
  else if (silent.length || blocked.length)             color = 'amber';
  else                                                  color = 'green';

  // 进度
  var allP = _dbProjectTasks(p.id);
  var doneC = allP.filter(function(t) { return t.done; }).length;
  var pct = allP.length ? Math.round(doneC / allP.length * 100) : 0;

  return {
    project: p,
    color: color,
    reasonText: reasons.length ? reasons.join(' · ') : '节奏稳定',
    pct: pct,
    overdueCount: overdue.length,
    silentCount: silent.length,
    blockedCount: blocked.length,
    hasBlockChain: hasBlockChain
  };
}

// ─── 最近动态：按任务聚合 ────────────────────────────────────
function _dbRecentTaskActivity() {
  var now = Date.now();
  var dayAgo = now - 24 * 3600 * 1000;
  var bucket = {};  // taskId -> { task, count, lastTs, latestSnippet, latestActor }
  (state.tasks || []).forEach(function(t) {
    if (!t.logs || !t.logs.length) return;
    t.logs.forEach(function(l) {
      var ts = new Date(l.date || l.createdAt || 0).getTime();
      if (ts < dayAgo) return;
      var key = t.id;
      if (!bucket[key]) bucket[key] = { task: t, count: 0, lastTs: 0, snippets: [], actor: '' };
      bucket[key].count++;
      if (ts > bucket[key].lastTs) {
        bucket[key].lastTs = ts;
        bucket[key].latestSnippet = (l.detail || '').slice(0, 60);
        var mid = l.user_id || l.memberId || l.userId;
        var m = (state.members || []).find(function(x) { return x.id === mid; });
        bucket[key].actor = m ? m.name : (l.user_name || '');
        bucket[key].action = l.action || '更新';
      }
    });
  });
  return Object.keys(bucket).map(function(k) { return bucket[k]; })
    .sort(function(a,b) {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastTs - a.lastTs;
    })
    .slice(0, 8);
}

// ─── 本周里程碑 ─────────────────────────────────────────────
function _dbWeeklyMilestones() {
  var weekStart = _dbWeekStart();
  var weekEnd = _dbWeekEnd();
  var todayStr = _dbDateStr(_dbToday());
  var weekStartStr = _dbDateStr(weekStart);
  var weekEndStr = _dbDateStr(weekEnd);

  var items = (state.tasks || []).filter(function(t) {
    return t.milestone && t.due && t.due >= weekStartStr && t.due <= weekEndStr;
  });

  return items.map(function(t) {
    var p = (state.projects || []).find(function(x) { return x.id === t.projectId; });
    var status;
    if (t.done) status = 'done';
    else if (t.due < todayStr) status = 'delay';
    else if (t.status === 'blocked' || isSilent(t)) status = 'risk';
    else status = 'ontrack';

    var dateLabel;
    if (status === 'delay') {
      var od = countWorkdays(new Date(t.due), _dbToday());
      dateLabel = '已延 ' + od + 'd';
    } else {
      dateLabel = t.due.slice(5);  // MM-DD
    }
    return { task: t, project: p, status: status, dateLabel: dateLabel };
  }).sort(function(a,b) {
    var order = { delay: 0, risk: 1, ontrack: 2, done: 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.task.due.localeCompare(b.task.due);
  });
}

// ─── 跟进清单按人聚合 ───────────────────────────────────────
function _dbFollowUpByPerson() {
  var byPerson = {};
  // 收集所有"该追"任务
  (state.tasks || []).forEach(function(t) {
    if (!_dbIsFollowUpItem(t)) return;
    // 多负责人：只挂第一个 assignee，避免重复
    var ids = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
    var primary = ids.length ? ids[0] : '__unassigned__';
    if (!byPerson[primary]) byPerson[primary] = { tasks: [], counts: { overdue: 0, silent: 0, blocked: 0, waiting_long: 0 } };
    var reason = _dbFollowUpReason(t);
    if (!reason) return;
    byPerson[primary].tasks.push({ task: t, reason: reason });
    byPerson[primary].counts[reason.type] = (byPerson[primary].counts[reason.type] || 0) + 1;
  });

  // 排序：每个人按任务严重度（red > purple > amber）
  var severityOrder = { red: 0, purple: 1, amber: 2 };
  Object.keys(byPerson).forEach(function(mid) {
    byPerson[mid].tasks.sort(function(a,b) {
      return (severityOrder[a.reason.severity] || 99) - (severityOrder[b.reason.severity] || 99);
    });
  });

  return byPerson;
}

// ─── 节奏正常的成员（无任何待跟进项） ────────────────────────
function _dbCleanMembers(byPersonObj) {
  var followIds = Object.keys(byPersonObj);
  var clean = (state.members || []).filter(function(m) {
    if (followIds.indexOf(m.id) >= 0) return false;
    // 必须至少有一个进行中任务，否则不计入"节奏正常"
    var has = (state.tasks || []).some(function(t) {
      if (t.done) return false;
      var ids = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
      return ids.indexOf(m.id) >= 0;
    });
    return has;
  });
  return clean;
}

// ═══════════════════════════════════════════════════════════════
// PM 总览主函数（V25 重写）
// ═══════════════════════════════════════════════════════════════
window.renderPMDashboard = function() {
  document.getElementById('header-title').textContent = '总览';
  var hh = (new Date()).getHours();
  var greet = hh < 6 ? '凌晨好' : hh < 12 ? '上午好' : hh < 18 ? '下午好' : '晚上好';
  var headerSub = document.getElementById('header-sub');
  if (headerSub) {
    headerSub.textContent = (new Date()).toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' })
      + ' · ' + greet + (currentUser ? '，' + currentUser.name : '');
  }

  var metrics = _dbCoreMetrics();
  var milestones = _dbWeeklyMilestones();
  var byPerson   = _dbFollowUpByPerson();
  var cleanMems  = _dbCleanMembers(byPerson);
  var healthList = _dbActiveProjects().map(_dbProjectHealth)
    .sort(function(a,b) {
      var order = { red: 0, amber: 1, green: 2 };
      return order[a.color] - order[b.color];
    });
  var activities = _dbRecentTaskActivity();

  // 写快照（异步，不阻塞渲染）
  _dbWriteSnapshotIfNeeded(metrics.counts);

  // 取昨日快照用于对比
  var trend = window._dbYesterdayTrend || { overdue: null, weekDone: null };

  var html = '<div class="view-pane db-v25">' +
    _dbBuildHeroRow(metrics, milestones, trend) +
    _dbBuildFollowUpSection(byPerson, cleanMems) +
    _dbBuildTwoColRow(healthList, activities) +
  '</div>';

  document.getElementById('main-content').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 数字计数动画
  requestAnimationFrame(function() {
    document.querySelectorAll('.db-v25 .m-num[data-target]').forEach(function(el) {
      animateDashCount(el);
    });
  });

  // 异步加载昨日快照（首次渲染后再 fetch，更新趋势）
  _dbFetchYesterdayTrend();
};

// ═══════════════════════════════════════════════════════════════
// HTML 构建块
// ═══════════════════════════════════════════════════════════════

function _dbTrendStr(metricKey, currentVal, trend) {
  if (trend == null || trend[metricKey] == null) return '';
  var diff = currentVal - trend[metricKey];
  if (diff === 0) return '<span>持平昨日</span>';
  var sign = diff > 0 ? '↑' : '↓';
  var isPositive = (metricKey === 'weekDone') ? (diff > 0) : (diff < 0);
  var cls = isPositive ? 't-down' : 't-up';
  return '<span class="' + cls + '">' + sign + ' ' + Math.abs(diff) + '</span><span>较昨日</span>';
}

function _dbBuildHeroRow(metrics, milestones, trend) {
  var c = metrics.counts;

  var metricsHtml =
    '<div class="metric m-red"   onclick="showDashboardTaskModal(\'overdue\')">' +
      '<div class="m-icon-wrap"><i data-lucide="alert-circle" class="m-icon"></i></div>' +
      '<div class="m-num" data-target="' + c.overdue + '">0</div>' +
      '<div class="m-label">逾期任务</div>' +
      '<div class="m-trend">' + (_dbTrendStr('overdue', c.overdue, trend) || '<span>所有未完成任务</span>') + '</div>' +
    '</div>' +
    '<div class="metric m-amber" onclick="showDashboardTaskModal(\'silent\')">' +
      '<div class="m-icon-wrap"><i data-lucide="moon" class="m-icon"></i></div>' +
      '<div class="m-num" data-target="' + c.silent + '">0</div>' +
      '<div class="m-label">沉默任务</div>' +
      '<div class="m-trend"><span>5 工作日未更新</span></div>' +
    '</div>' +
    '<div class="metric m-purple" onclick="showDashboardTaskModal(\'blocked\')">' +
      '<div class="m-icon-wrap"><i data-lucide="ban" class="m-icon"></i></div>' +
      '<div class="m-num" data-target="' + c.blocked + '">0</div>' +
      '<div class="m-label">阻塞中</div>' +
      '<div class="m-trend">' + _dbBuildBlockedTrend(metrics.blocked) + '</div>' +
    '</div>' +
    '<div class="metric m-blue" onclick="showDashboardTaskModal(\'weekDone\')">' +
      '<div class="m-icon-wrap"><i data-lucide="check-circle-2" class="m-icon"></i></div>' +
      '<div class="m-num" data-target="' + c.weekDone + '">0</div>' +
      '<div class="m-label">本周已完成</div>' +
      '<div class="m-trend">' + (_dbTrendStr('weekDone', c.weekDone, trend) || '<span>本周累计</span>') + '</div>' +
    '</div>';

  // 里程碑列表
  var msHtml = '';
  if (!milestones.length) {
    msHtml = '<div class="ms-empty">本周无关键里程碑</div>';
  } else {
    var statusMap = {
      delay:   { tag: '延误',   tagCls: 'delay',   rowCls: 'danger', dotCls: 'dot-danger' },
      risk:    { tag: '高风险', tagCls: 'risk',    rowCls: 'warn',   dotCls: 'dot-warn'   },
      ontrack: { tag: '在轨',   tagCls: 'ontrack', rowCls: '',       dotCls: ''           },
      done:    { tag: '已完成', tagCls: 'done',    rowCls: '',       dotCls: 'dot-done'   }
    };
    msHtml = milestones.map(function(m) {
      var s = statusMap[m.status];
      return '<div class="ms-row ' + s.rowCls + '" onclick="openEditTask(\'' + m.task.id + '\')">' +
        '<span class="ms-date">' + escHtml(m.dateLabel) + '</span>' +
        '<span class="ms-dot ' + s.dotCls + '"></span>' +
        '<span class="ms-name">' + escHtml(m.task.title) +
          (m.project ? '<span class="ms-proj">' + escHtml(m.project.name) + '</span>' : '') +
        '</span>' +
        '<span class="ms-tag ' + s.tagCls + '">' + s.tag + '</span>' +
      '</div>';
    }).join('');
  }

  return '<div class="hero-row">' +
    '<div class="metrics-grid">' + metricsHtml + '</div>' +
    '<div class="ms-card">' +
      '<div class="ms-head">' +
        '<i data-lucide="flag" class="ms-h-icon"></i>' +
        '<span class="ms-h-title">本周里程碑</span>' +
        '<span class="ms-h-meta">' + milestones.length + ' 个</span>' +
      '</div>' +
      '<div class="ms-list">' + msHtml + '</div>' +
    '</div>' +
  '</div>';
}

function _dbBuildBlockedTrend(blockedTasks) {
  if (!blockedTasks.length) return '<span>暂无阻塞</span>';
  var maxDays = 0;
  blockedTasks.forEach(function(t) {
    var d = getBlockedDays(t);
    if (d > maxDays) maxDays = d;
  });
  return '<span>最长 ' + maxDays + ' 天</span>';
}

// 跟进清单
function _dbBuildFollowUpSection(byPerson, cleanMems) {
  var memberMap = {};
  (state.members || []).forEach(function(m) { memberMap[m.id] = m; });

  var totalTasks = 0;
  var personIds = Object.keys(byPerson).filter(function(id) { return id !== '__unassigned__'; });
  if (byPerson['__unassigned__']) personIds.push('__unassigned__');

  personIds.forEach(function(id) { totalTasks += byPerson[id].tasks.length; });

  // 排序：按"逾期数 + 阻塞数" 倒序
  personIds.sort(function(a, b) {
    if (a === '__unassigned__') return 1;
    if (b === '__unassigned__') return -1;
    var sa = byPerson[a].counts.overdue + byPerson[a].counts.blocked;
    var sb = byPerson[b].counts.overdue + byPerson[b].counts.blocked;
    if (sb !== sa) return sb - sa;
    return byPerson[b].tasks.length - byPerson[a].tasks.length;
  });

  var personHtml = personIds.map(function(id) {
    var data = byPerson[id];
    var member = memberMap[id];
    var name = member ? member.name : '未分配';
    var role = (member && member.role && member.role !== 'normal') ? (ROLE_LABELS && ROLE_LABELS[member.role] ? ROLE_LABELS[member.role] : '') : '';
    var color = member ? memberColor(member.id) : '#94a3b8';
    var initial = name.charAt(0);

    var alarm = data.counts.overdue > 0 ? 'alarm' : (data.counts.silent + data.counts.blocked > 0 ? 'warn' : '');
    var pillsHtml = '';
    if (data.counts.overdue) pillsHtml += '<span class="fu-stat-pill red">逾 ' + data.counts.overdue + '</span>';
    if (data.counts.silent)  pillsHtml += '<span class="fu-stat-pill amber">沉 ' + data.counts.silent + '</span>';
    if (data.counts.blocked) pillsHtml += '<span class="fu-stat-pill purple">阻 ' + data.counts.blocked + '</span>';
    if (data.counts.waiting_long) pillsHtml += '<span class="fu-stat-pill amber">候 ' + data.counts.waiting_long + '</span>';

    var tasksHtml = data.tasks.map(function(item) {
      var t = item.task, r = item.reason;
      var bullet = r.severity;
      var p = (state.projects || []).find(function(x) { return x.id === t.projectId; });
      var modName = '';
      if (t.moduleId && state.modules) {
        var mod = state.modules.find(function(x) { return x.id === t.moduleId; });
        if (mod) modName = '·' + mod.name;
      }
      var projTag = p ? escHtml(p.name) + modName : '未分类';
      var iconName = r.type === 'overdue' ? 'alert-circle'
                  : r.type === 'blocked' ? 'ban'
                  : r.type === 'waiting_long' ? 'hourglass'
                  : 'moon';
      var isPrimary = (r.severity === 'red' || r.severity === 'purple') ? ' primary' : '';
      return '<div class="fu-task" onclick="openEditTask(\'' + t.id + '\')">' +
        '<span class="fu-task-bullet ' + bullet + '"></span>' +
        '<span class="fu-task-proj">' + projTag + '</span>' +
        '<span class="fu-task-title">' + escHtml(t.title) + '</span>' +
        '<span class="fu-task-reason r-' + bullet + '">' +
          '<i data-lucide="' + iconName + '" class="reason-icon"></i>' + escHtml(r.text) +
        '</span>' +
        '<div class="fu-task-actions">' +
          '<button class="fu-task-action' + isPrimary + '" onclick="event.stopPropagation();dbFollowUpAction(\'' + t.id + '\',\'' + (member ? member.id : '') + '\')">' +
            '<i data-lucide="at-sign" style="width:11px;height:11px"></i>追问' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="fu-person">' +
      '<div class="fu-person-pillar">' +
        '<div class="fu-avatar-lg ' + alarm + '" style="background:' + color + '">' +
          escHtml(initial) +
          (alarm ? '<div class="fu-ring"></div>' : '') +
        '</div>' +
        '<div class="fu-pillar-name">' + escHtml(name) + '</div>' +
        (role ? '<div class="fu-pillar-role">' + escHtml(role) + '</div>' : '') +
        '<div class="fu-pillar-stat">' + pillsHtml + '</div>' +
      '</div>' +
      '<div class="fu-tasks">' + tasksHtml + '</div>' +
    '</div>';
  }).join('');

  // "节奏正常的人"
  var cleanHtml = '';
  if (cleanMems.length) {
    var avHtml = cleanMems.slice(0, 6).map(function(m) {
      return '<div class="fu-mini-avatar" style="background:' + memberColor(m.id) + '">' + escHtml(m.name.charAt(0)) + '</div>';
    }).join('');
    var names = cleanMems.map(function(m) { return m.name; }).join('、');
    cleanHtml = '<div class="fu-clean">' +
      '<div class="fu-clean-icon"><i data-lucide="check" style="width:16px;height:16px"></i></div>' +
      '<div class="fu-clean-text"><strong>' + escHtml(names) + '</strong> · 节奏正常，无需跟进</div>' +
      '<div class="fu-clean-avatars">' + avHtml + '</div>' +
    '</div>';
  }

  var pillCls = totalTasks > 0 ? 'sh-pill danger' : 'sh-pill';
  var headerHtml = '<div class="section-head">' +
    '<i data-lucide="user-check" class="sh-icon"></i>' +
    '<span class="sh-title">今天要追的人</span>' +
    '<span class="' + pillCls + '">' + totalTasks + ' 件待跟进 · ' + personIds.length + ' 人</span>' +
  '</div>';

  var bodyHtml;
  if (totalTasks === 0) {
    bodyHtml = '<div class="fu-empty">' +
      '<i data-lucide="party-popper" style="width:32px;height:32px;color:var(--green)"></i>' +
      '<div style="font-size:14px;font-weight:600;margin-top:8px">所有人节奏正常</div>' +
      '<div style="font-size:12px;color:var(--text3);margin-top:4px">没有逾期、沉默或阻塞的任务</div>' +
      '</div>';
  } else {
    bodyHtml = personHtml + cleanHtml;
  }

  return '<section class="section fu-section">' + headerHtml +
    '<div class="section-body">' + bodyHtml + '</div>' +
  '</section>';
}

// 双栏：项目健康 + 最近动态
function _dbBuildTwoColRow(healthList, activities) {
  var phHtml = healthList.length === 0
    ? '<div class="db-empty">暂无进行中的项目</div>'
    : healthList.map(function(h) {
        var reasonCls = h.color === 'red' ? 'danger' : (h.color === 'amber' ? 'warn' : '');
        return '<div class="ph-row" onclick="switchView(\'project-' + h.project.id + '\')">' +
          '<div class="ph-light-wrap">' +
            '<span class="ph-light ' + h.color + '"></span>' +
            '<span class="ph-pct-mini">' + h.pct + '%</span>' +
          '</div>' +
          '<div class="ph-info">' +
            '<div class="ph-name-line"><span class="ph-name">' + escHtml(h.project.name) + '</span></div>' +
            '<div class="ph-reason ' + reasonCls + '">' + escHtml(h.reasonText) + '</div>' +
          '</div>' +
          '<i data-lucide="chevron-right" class="ph-arrow"></i>' +
        '</div>';
      }).join('');

  var actHtml = activities.length === 0
    ? '<div class="db-empty">最近 24 小时暂无动态</div>'
    : activities.map(function(a) {
        var t = a.task;
        var p = (state.projects || []).find(function(x) { return x.id === t.projectId; });
        var iconCls, iconName;
        if (a.count >= 3) { iconCls = 'hot'; iconName = 'flame'; }
        else if (a.action === '标记阻塞') { iconCls = 'block'; iconName = 'ban'; }
        else if (a.action === '完成任务' || t.done) { iconCls = 'done'; iconName = 'check-circle-2'; }
        else if ((a.action || '').indexOf('@') >= 0 || (a.latestSnippet || '').indexOf('@') >= 0) { iconCls = 'mention'; iconName = 'at-sign'; }
        else { iconCls = ''; iconName = 'git-commit'; }
        var burst = a.count >= 3 ? '<span class="act-burst-pill">' + a.count + ' 次更新</span>' : '';
        var snippet = a.latestSnippet ? '<div class="act-snippet">' + escHtml(a.latestSnippet) + '</div>' : '';
        var meta = (a.actor || '') + (a.actor ? ' · ' : '') + _dbRelTime(a.lastTs);
        return '<div class="act-task" onclick="openEditTask(\'' + t.id + '\')">' +
          '<div class="act-task-head">' +
            '<div class="act-icon-wrap ' + iconCls + '"><i data-lucide="' + iconName + '" class="act-icon"></i></div>' +
            '<span class="act-task-title">' + escHtml(t.title) + '</span>' +
            burst +
            (p ? '<span class="act-task-proj">' + escHtml(p.name) + '</span>' : '') +
          '</div>' +
          '<div class="act-task-meta">' + escHtml(meta) + '</div>' +
          snippet +
        '</div>';
      }).join('');

  return '<div class="two-col">' +
    '<section class="section" style="margin-bottom:0">' +
      '<div class="section-head">' +
        '<i data-lucide="layers" class="sh-icon"></i>' +
        '<span class="sh-title">项目健康</span>' +
        '<span class="sh-meta">' + healthList.length + ' 个进行中</span>' +
      '</div>' +
      '<div>' + phHtml + '</div>' +
    '</section>' +
    '<section class="section" style="margin-bottom:0">' +
      '<div class="section-head">' +
        '<i data-lucide="activity" class="sh-icon"></i>' +
        '<span class="sh-title">最近动态</span>' +
        '<span class="sh-meta">最近 24 小时 · 按任务聚合</span>' +
      '</div>' +
      '<div>' + actHtml + '</div>' +
    '</section>' +
  '</div>';
}

function _dbRelTime(ts) {
  var diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000) + ' 小时前';
  return Math.floor(diff/86400000) + ' 天前';
}

// ═══════════════════════════════════════════════════════════════
// 快照写入 + 趋势对比
// ═══════════════════════════════════════════════════════════════

// 写入今日快照（前端首次打开总览时触发）
async function _dbWriteSnapshotIfNeeded(counts) {
  var today = _dbDateStr(_dbToday());
  var lsKey = 'pm_snapshot_written_' + today;
  if (localStorage.getItem(lsKey)) return;

  try {
    var snapId = 'snap_' + today.replace(/-/g, '');
    await sb.from('dashboard_snapshots').upsert({
      id: snapId,
      snapshot_date: today,
      overdue_count: counts.overdue,
      silent_count: counts.silent,
      blocked_count: counts.blocked,
      weekly_done_count: counts.weekDone,
      created_at: new Date().toISOString()
    }, { onConflict: 'snapshot_date' });
    localStorage.setItem(lsKey, '1');
  } catch (e) {
    console.warn('[dashboard] snapshot write failed', e);
  }
}

// 取昨日快照（异步，渲染后再 fetch；下一次进 dashboard 时趋势就有了）
async function _dbFetchYesterdayTrend() {
  try {
    var d = new Date(); d.setDate(d.getDate() - 1);
    var yStr = _dbDateStr(d);
    var res = await sb.from('dashboard_snapshots')
      .select('overdue_count, silent_count, blocked_count, weekly_done_count')
      .eq('snapshot_date', yStr)
      .maybeSingle();
    if (res && res.data) {
      window._dbYesterdayTrend = {
        overdue:  res.data.overdue_count,
        silent:   res.data.silent_count,
        blocked:  res.data.blocked_count,
        weekDone: res.data.weekly_done_count
      };
      // 触发一次轻量重渲染（仅趋势数字部分）
      _dbUpdateTrendsInDom();
    }
  } catch (e) {
    console.warn('[dashboard] trend fetch failed', e);
  }
}

// 仅更新指标卡 m-trend 的小提示（不重绘整页）
function _dbUpdateTrendsInDom() {
  var trend = window._dbYesterdayTrend;
  if (!trend) return;
  var pane = document.querySelector('.db-v25');
  if (!pane) return;
  // 简化：直接重渲一次
  if (currentView === 'dashboard') renderPMDashboard();
}

// 概览指标弹窗（V25 扩展为 4 种类型）
window.showDashboardTaskModal = function(type) {
  var metrics = _dbCoreMetrics();
  var tasks, title;
  if (type === 'overdue')      { tasks = metrics.overdue;  title = '逾期任务';     }
  else if (type === 'silent')  { tasks = metrics.silent;   title = '沉默任务（5 工作日未更新）'; }
  else if (type === 'blocked') { tasks = metrics.blocked;  title = '阻塞中任务';   }
  else if (type === 'weekDone'){ tasks = metrics.weekDone; title = '本周已完成';   }
  else return;

  if (!tasks.length) { toast('暂无数据', 'info'); return; }

  var memberMap = {}; (state.members || []).forEach(function(m) { memberMap[m.id] = m.name; });
  var projMap   = {}; (state.projects || []).forEach(function(p) { projMap[p.id] = p.name; });

  var rows = tasks.map(function(t) {
    var ids = (t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : []);
    var names = ids.map(function(i) { return memberMap[i] || '?'; }).join('、') || '—';
    var extra = '';
    if (type === 'blocked' && t.blocked_reason) {
      extra = '<div style="font-size:11px;color:var(--purple);margin-top:2px">阻塞 ' + getBlockedDays(t) + ' 天 · ' + escHtml(t.blocked_reason) + '</div>';
    } else if (type === 'silent') {
      extra = '<div style="font-size:11px;color:var(--amber);margin-top:2px">' + getStaleWorkdays(t) + ' 工作日未更新</div>';
    } else if (type === 'overdue' && t.due) {
      extra = '<div style="font-size:11px;color:var(--red);margin-top:2px">截止 ' + t.due + '</div>';
    }
    return '<tr style="cursor:pointer" onclick="closeModal();openEditTask(\'' + t.id + '\')">' +
      '<td><div style="font-weight:500">' + escHtml(t.title) + '</div>' + extra + '</td>' +
      '<td style="font-size:12px;color:var(--text2)">' + (projMap[t.projectId] || '未分类') + '</td>' +
      '<td style="font-size:12px;color:var(--text2)">' + names + '</td>' +
    '</tr>';
  }).join('');

  openModal(modalHeader(title) +
    '<div class="modal-body" style="padding:0 22px 22px">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="background:var(--surface2);color:var(--text3);font-size:11px">' +
          '<th style="text-align:left;padding:8px">任务</th>' +
          '<th style="text-align:left;padding:8px;width:120px">项目</th>' +
          '<th style="text-align:left;padding:8px;width:120px">负责人</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>'
  );
};

// 总览页"追问"快捷动作
window.dbFollowUpAction = function(taskId, memberId) {
  if (!taskId) return;
  openEditTask(taskId);
  setTimeout(function() {
    var logTab = document.getElementById('tab-log');
    if (logTab) logTab.click();
  }, 80);
  setTimeout(function() {
    var ta = document.getElementById('fi-log');
    if (!ta) return;
    var member = (state.members || []).find(function(m) { return m.id === memberId; });
    if (member) {
      ta.value = '@' + member.name + ' ';
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, 200);
};

function animateDashCount(el) {
  var target  = parseInt(el.getAttribute('data-target')) || 0;
  var suffix  = el.getAttribute('data-suffix') || '';
  var current = 0;
  var duration = 600;
  var step     = Math.max(1, Math.ceil(target / (duration / 16)));
  var timer = setInterval(function() {
    current = Math.min(current + step, target);
    el.textContent = current + suffix;
    if (current >= target) clearInterval(timer);
  }, 16);
}

// ─── 工作量热力图 ──────────────────────────────────────────

function buildHeatmapHtml(clickable) {
  var completionMap = {};
  var completionTasks = {};
  (state.tasks || []).forEach(function(t) {
    if (t.done && t.completedAt) {
      var d = t.completedAt.slice(0, 10);
      completionMap[d] = (completionMap[d] || 0) + 1;
      if (!completionTasks[d]) completionTasks[d] = [];
      completionTasks[d].push(t);
    }
  });
  window._hmCompletionTasks = completionTasks;

  var today = new Date();
  today.setHours(0,0,0,0);
  var start = new Date(today);
  start.setDate(start.getDate() - 181);
  var dow = start.getDay() || 7;
  start.setDate(start.getDate() - (dow - 1));

  var vals = [];
  for (var k in completionMap) { if (completionMap.hasOwnProperty(k)) vals.push(completionMap[k]); }
  var maxVal = Math.max(1, vals.length ? Math.max.apply(null, vals) : 1);

  var HM_COLORS = ['#F1EFE8','#E1F5EE','#9FE1CB','#1D9E75','#085041'];

  var cols = [];
  for (var col = 0; col < 26; col++) {
    var colCells = [];
    for (var row = 0; row < 7; row++) {
      var d = new Date(start);
      d.setDate(d.getDate() + col * 7 + row);
      if (d > today) { colCells.push(null); continue; }
      var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      var count   = completionMap[dateStr] || 0;
      var ci      = count === 0 ? 0 : Math.min(4, Math.ceil(count / maxVal * 4));
      colCells.push({ date: dateStr, count: count, ci: ci });
    }
    cols.push(colCells);
  }

  var COL_W = 28; // 18px cell + 10px gap

  var monthLabels = '';
  var lastMonth   = -1;
  cols.forEach(function(col, colIdx) {
    var firstCell = null;
    for (var i = 0; i < col.length; i++) { if (col[i] !== null) { firstCell = col[i]; break; } }
    if (!firstCell) return;
    var mo = new Date(firstCell.date + 'T00:00:00').getMonth();
    if (mo !== lastMonth) {
      var moNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      monthLabels += '<div style="position:absolute;left:' + (colIdx * COL_W) + 'px;font-size:10px;color:var(--text3);white-space:nowrap">' + moNames[mo] + '</div>';
      lastMonth = mo;
    }
  });

  var gridInner = cols.map(function(col) {
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      col.map(function(cell) {
        if (!cell) return '<div style="width:18px;height:18px"></div>';
        var clickAttr = clickable && cell.count > 0
          ? ' onclick="showHeatmapDayDetail(\''+cell.date+'\')"'
          : '';
        return '<div class="hm-cell" style="background:'+HM_COLORS[cell.ci]+'" title="'+cell.date+'：完成 '+cell.count+' 个任务"'+clickAttr+'></div>';
      }).join('') +
    '</div>';
  }).join('');

  var dayLabels = '<div style="display:flex;flex-direction:column;gap:10px;margin-right:8px">' +
    ['','一','','三','','五',''].map(function(d) {
      return '<div style="width:18px;height:18px;font-size:9px;color:var(--text3);line-height:18px;text-align:right">'+d+'</div>';
    }).join('') +
  '</div>';

  // ── 周统计 ──
  var weekStats = [];
  for (var w = 0; w < 26; w++) {
    var weekTotal = 0, weekDays = 0;
    for (var r = 0; r < 7; r++) {
      var c = cols[w][r];
      if (c !== null) { weekTotal += c.count; weekDays++; }
    }
    var wd = new Date(start); wd.setDate(wd.getDate() + w * 7);
    var we = new Date(wd); we.setDate(we.getDate() + 6);
    var wLabel = (wd.getMonth()+1)+'/'+wd.getDate()+'–'+(we.getMonth()+1)+'/'+we.getDate();
    weekStats.push({ label: wLabel, total: weekTotal, days: weekDays });
  }
  var totalCompleted = weekStats.reduce(function(s,w){return s+w.total;},0);
  var weeksWithData = weekStats.filter(function(w){return w.total>0;}).length;
  var bestWeek = weekStats.reduce(function(b,w){return w.total>b.total?w:b;},{total:0});
  var avgPerWeek = weeksWithData > 0 ? Math.round(totalCompleted/weeksWithData) : 0;
  var recent4 = weekStats.slice(-4).reverse();

  // ── 顶部摘要卡片 ──
  var summaryRow = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">' +
    '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 18px;text-align:center">' +
      '<div style="font-size:26px;font-weight:600;color:var(--text);font-family:var(--mono)">'+totalCompleted+'</div>' +
      '<div style="font-size:11px;color:var(--text3);margin-top:4px">期内完成任务</div></div>' +
    '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 18px;text-align:center">' +
      '<div style="font-size:26px;font-weight:600;color:var(--text);font-family:var(--mono)">'+avgPerWeek+'</div>' +
      '<div style="font-size:11px;color:var(--text3);margin-top:4px">周均完成</div></div>' +
    '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 18px;text-align:center">' +
      '<div style="font-size:26px;font-weight:600;color:#1D9E75;font-family:var(--mono)">'+bestWeek.total+'</div>' +
      '<div style="font-size:11px;color:var(--text3);margin-top:4px">最高周 <span style="font-size:10px;color:var(--text3)">'+bestWeek.label+'</span></div></div>' +
    '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 18px;text-align:center">' +
      '<div style="font-size:26px;font-weight:600;color:var(--text);font-family:var(--mono)">'+weeksWithData+'</div>' +
      '<div style="font-size:11px;color:var(--text3);margin-top:4px">活跃周数</div></div>' +
  '</div>';

  // ── 热力图网格 ──
  var heatmapGrid = '<div style="overflow-x:auto">' +
    '<div style="position:relative;height:18px;margin-left:26px;margin-bottom:8px">'+monthLabels+'</div>' +
    '<div style="display:flex">' +
      dayLabels +
      '<div style="display:flex;gap:10px">'+gridInner+'</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:5px;margin-top:10px;justify-content:flex-end">' +
      '<span style="font-size:10px;color:var(--text3)">少</span>' +
      HM_COLORS.map(function(c){return '<div class="hm-cell" style="background:'+c+'"></div>';}).join('') +
      '<span style="font-size:10px;color:var(--text3)">多</span>' +
    '</div>' +
  '</div>';

  // ── 底部最近 4 周 ──
  var recentRow = '<div style="margin-top:16px;display:flex;align-items:center;gap:16px;background:var(--surface2);border-radius:var(--radius-sm);padding:12px 18px">' +
    '<span style="font-size:11px;font-weight:500;color:var(--text2);flex-shrink:0">最近 4 周</span>' +
    recent4.map(function(w) {
      var pct = w.days > 0 ? Math.round(w.total / w.days * 100) : 0;
      var barColor = w.total >= bestWeek.total * 0.8 ? '#1D9E75' : 'var(--accent)';
      return '<div style="flex:1;display:flex;align-items:center;gap:6px">' +
        '<span style="font-size:10px;color:var(--text3);flex-shrink:0">'+w.label+'</span>' +
        '<span style="font-weight:600;font-size:13px;color:var(--text);font-family:var(--mono);flex-shrink:0;min-width:22px">'+w.total+'</span>' +
        '<div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;background:'+barColor+';border-radius:3px;width:'+Math.min(100,Math.max(3,pct))+'%"></div></div>' +
      '</div>';
    }).join('') +
  '</div>';

  return summaryRow + heatmapGrid + recentRow;
}
// 热力图格子点击 → 弹窗显示当天完成的任务
window.showHeatmapDayDetail = function(dateStr) {
  var tasks = (window._hmCompletionTasks || {})[dateStr] || [];
  if (!tasks.length) return;
  var memberMap = {};
  state.members.forEach(function(m) { memberMap[m.id] = m.name; });
  var projMap = {};
  state.projects.forEach(function(p) { projMap[p.id] = p.name; });
  var rows = tasks.map(function(t) {
    return '<tr style="cursor:pointer" onclick="openEditTask(\''+t.id+'\');closeModal()">' +
      '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(t.title)+'</td>' +
      '<td>'+escHtml(projMap[t.projectId]||'—')+'</td>' +
      '<td>'+escHtml(memberMap[t.assignee]||'—')+'</td>' +
    '</tr>';
  }).join('');
  var html = modalHeader(dateStr + ' · 完成 ' + tasks.length + ' 个任务') +
    '<div class="modal-body"><div class="table-scroll" style="max-height:50vh"><table class="compact-table">' +
    '<thead><tr><th>任务</th><th>项目</th><th>负责人</th></tr></thead>' +
    '<tbody>'+rows+'</tbody></table></div></div>' +
    '<div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>';
  openModal(html);
};