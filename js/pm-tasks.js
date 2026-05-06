/* ════════════════════════════════════════════════
 * pm-tasks.js  —  任务卡片 / 增删改 / 子任务 / 依赖 / 任务日志
 * ════════════════════════════════════════════════ */

function taskCardHTML(t) {
  const di=dueInfo(t), si=statusInfo(t.status), pn=projName(t.projectId);
  const priCls=t.priority==='紧急'?'pill-red':t.priority==='重要'?'pill-amber':'pill-gray';
  const showProj = currentView!=='project-'+t.projectId;
  const blocked = isBlocked(t);
  const assigneeIds = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [t.assignee] : []);
  const assigneeMembers = assigneeIds.map(function(id) { return state.members.find(function(m) { return m.id === id; }); }).filter(Boolean);
  var assigneeHTML = '';
  if (assigneeMembers.length <= 3) {
    assigneeHTML = assigneeMembers.map(function(m) { return renderAvatar(m, 'avatar-sm'); }).join('');
  } else {
    assigneeHTML = assigneeMembers.slice(0, 2).map(function(m) { return renderAvatar(m, 'avatar-sm'); }).join('') +
      '<span class="avatar-extra" title="' + assigneeMembers.slice(2).map(function(m) { return escHtml(m.name); }).join(', ') + '">+' + (assigneeMembers.length - 2) + '</span>';
  }
  const tagPills = (t.tags||[]).map(tid=>tagHTML(tid)).join('');
  const subProg = subtaskProgress(t);
  const milestoneBadge = t.milestone ? '<span class="pill pill-amber" style="font-size:10px">◆ 里程碑</span>' : '';
  const blockedBadge = blocked ? '<span class="dep-blocked-badge"><i data-lucide=\"alert-triangle\" style=\"width:10px;height:10px;margin-right:1px\"></i>等待前置</span>' : '';

  return `<div class="task-card stagger-in${t.done?' done':''}${blocked?' dep-blocked':''}" onclick="openEditTask('${t.id}')">
    <div class="check-wrap" onclick="event.stopPropagation();if(!${t.done})celebrateCompletion(event.clientX,event.clientY);toggleDone('${t.id}')">
      <div class="check-btn${t.done?' checked':''}"></div>
    </div>
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      <div class="task-meta">
        ${showProj?`<span class="pill pill-project">${pn}</span>`:''}
        <span class="pill ${di.cls}">${di.text}</span>
	        ${t.startDate?`<span class="pill pill-start">${t.startDate}</span>`:''}
        <span class="pill ${priCls}">${escHtml(t.priority)}</span>
        <span class="pill ${si.cls}">${si.lbl}</span>
        ${tagPills}${milestoneBadge}${blockedBadge}
        ${subProg}
      </div>
    </div>
    <div class="task-end" onclick="event.stopPropagation()">
      ${assigneeHTML}
      ${t.logs&&t.logs.length?`<span class="log-count">${t.logs.length}条</span>`:''}
      <button class="icon-btn" onclick="openLog('${t.id}')" title="记录跟进"><i data-lucide="message-square-plus" style="width:13px;height:13px"></i></button>
    </div>
  </div>`;
}

// ─── Timeline helper ──────────────────────────────────────────────────────────
function addTimelineEntry(t, action, detail) {
  if (!t.logs) t.logs = [];
  t.logs.unshift({
    date: new Date().toISOString(),
    user_id: currentUser ? currentUser.id : '',
    user_name: currentUser ? currentUser.name : '',
    action: action,
    detail: detail || ''
  });
}

// ─── Toggle done ──────────────────────────────────────────────────────────────
async function toggleDone(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    const wasDone = t.done;
    t.done = !t.done;
    t.status = t.done ? 'done' : 'todo';
    if (t.done && !wasDone) {
      t.completedAt = new Date().toISOString();
      t.completedBy = currentUser ? currentUser.id : '';
      addTimelineEntry(t, '完成任务', '标记任务为已完成');
    } else if (!t.done && wasDone) {
      t.completedAt = null;
      t.completedBy = null;
      addTimelineEntry(t, '重新打开', '重新打开任务');
    }
    await syncTask(t);
    if (t.done && !wasDone && typeof pushNotification === 'function' && t.assignee) {
      pushNotification({ recipientId:t.assignee, type:'task_done',
        title:'「' + t.title + '」已完成',
        body:(currentUser?.name||'系统') + ' 标记此任务为已完成',
        navType:'task', navId:t.id });
    }
    _lastLoadTime = Date.now();
    render();
    if (t.done) logAction('完成任务', `标记「${t.title}」为已完成`);
  }
}

// ─── Subtask toggle ───────────────────────────────────────────────────────────
function toggleSubtask(taskId, subtaskId) {
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  const s=t.subtasks.find(x=>x.id===subtaskId); if(!s) return;
  const willDone = !s.done;
  s.done = willDone;
  syncTask(t);
  _lastLoadTime = Date.now();
  renderModalSubtasks(taskId);
  if (willDone) logAction('完成子任务', `「${t.title}」→ 子任务「${s.title}」已完成`);
}

function renderModalSubtasks(taskId) {
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  const el=document.getElementById('subtask-list-modal'); if(!el) return;
  el.innerHTML = buildSubtaskListHTML(t.subtasks||[], taskId);
}

function buildSubtaskListHTML(subtasks, taskId) {
  if (!subtasks.length) return '<div style="font-size:12px;color:var(--text3);padding:8px 0">暂无子任务，在下方输入框添加</div>';
  return subtasks.map(s=>`<div class="subtask-item">
    <div class="subtask-check${s.done?' done':''}" onclick="toggleSubtask('${taskId}','${s.id}')"></div>
    <div class="subtask-text${s.done?' done':''}">${escHtml(s.title)}</div>
    <button class="subtask-del" onclick="deleteSubtask('${taskId}','${s.id}')"><i data-lucide="x"></i></button>
  </div>`).join('');
}

function addSubtaskFromInput(taskId) {
  const inp=document.getElementById('new-subtask-input'); if(!inp) return;
  const title=inp.value.trim(); if(!title) return;
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  if(!t.subtasks) t.subtasks=[];
  t.subtasks.push({id:uid(),title,done:false});
  inp.value='';
  syncTask(t);
  renderModalSubtasks(taskId);
  logAction('添加子任务', `为「${t.title}」添加子任务「${title}」`);
}

function deleteSubtask(taskId, subtaskId) {
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  const s = t.subtasks.find(x=>x.id===subtaskId);
  t.subtasks = t.subtasks.filter(x=>x.id!==subtaskId);
  syncTask(t);
  renderModalSubtasks(taskId);
  if (s) logAction('删除子任务', `删除「${t.title}」的子任务「${s.title}」`);
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(html, cls) {
  const box = document.getElementById('modal-box');
  box.className = 'modal' + (cls ? ' ' + cls : '');
  box.innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
  // 自动聚焦第一个可见输入框
  requestAnimationFrame(() => {
    const firstInput = document.querySelector('#modal-box input:not([type=checkbox]):not([type=hidden]), #modal-box select, #modal-box textarea');
    if (firstInput) firstInput.focus();
  });
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function onOverlayClick(e) { if(e.target===document.getElementById('modal-overlay')) closeModal(); }
function modalHeader(title) {
  return `<div class="modal-header"><span class="modal-title">${title}</span><button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button></div>`;
}

// ─── V20 模块辅助 ──────────────────────────────────────────────────────────────
function getModuleOptsForProject(projectId) {
  var mods = state.modules.filter(function(m) { return m.projectId === projectId; });
  return mods.map(function(m) {
    return '<option value="' + m.id + '">' + escHtml(m.name) + '</option>';
  }).join('');
}

window.updateModuleOpts = function(projectId) {
  var sel = document.getElementById('fi-module');
  if (!sel) return;
  sel.innerHTML = '<option value="">不归类</option>' + getModuleOptsForProject(projectId);
};

// ─── V20 Multi-select assignee helpers ─────────────────────────────────────────
function buildTaskAssigneeListHTML() {
  if (!window._newTaskAssignees || !window._newTaskAssignees.length) return '<div style="font-size:12px;color:var(--text3)">暂未选择</div>';
  return window._newTaskAssignees.map(function(mid) {
    var m = state.members.find(function(x) { return x.id === mid; });
    if (!m) return '';
    return '<div class="subtask-item" style="display:flex;align-items:center;gap:8px;background:var(--surface2);padding:5px 10px;border-radius:6px;margin-bottom:5px">' +
      '<div class="member-avatar" style="background:' + memberColor(m.id) + ';width:20px;height:20px;font-size:10px">' + memberInitial(m.id) + '</div>' +
      '<div style="flex:1">' + escHtml(m.name) + '</div>' +
      '<button class="subtask-del" onclick="removeTaskAssignee(\'' + m.id + '\')"><i data-lucide="x"></i></button></div>';
  }).join('');
}
window.buildTaskAssigneeListHTML = buildTaskAssigneeListHTML;

window.addTaskAssignee = function() {
  var sel = document.getElementById('fi-assignee-sel');
  if (!sel || !sel.value) return;
  if (!window._newTaskAssignees) window._newTaskAssignees = [];
  if (!window._newTaskAssignees.includes(sel.value)) {
    window._newTaskAssignees.push(sel.value);
    sel.value = '';
    var listEl = document.getElementById('fi-assignee-list');
    if (listEl) { listEl.innerHTML = buildTaskAssigneeListHTML(); if (typeof lucide !== "undefined") lucide.createIcons(); }
  }
};

window.removeTaskAssignee = function(mid) {
  window._newTaskAssignees = (window._newTaskAssignees || []).filter(function(x) { return x !== mid; });
  var listEl = document.getElementById('fi-assignee-list');
  if (listEl) { listEl.innerHTML = buildTaskAssigneeListHTML(); if (typeof lucide !== "undefined") lucide.createIcons(); }
};

window.renderEditTaskAssigneeList = function() {
  var ids = window._editTaskAssignees || [];
  var listEl = document.getElementById('fi-assignee-list');
  if (!listEl) return;
  if (!ids.length) {
    listEl.innerHTML = '<div style="font-size:12px;color:var(--text3)">暂未选择</div>';
    return;
  }
  listEl.innerHTML = ids.map(function(mid) {
    var m = state.members.find(function(x) { return x.id === mid; });
    if (!m) return '';
    return '<div class="subtask-item" style="display:flex;align-items:center;gap:8px;background:var(--surface2);padding:5px 10px;border-radius:6px;margin-bottom:5px">' +
      '<div class="member-avatar" style="background:' + memberColor(m.id) + ';width:20px;height:20px;font-size:10px">' + memberInitial(m.id) + '</div>' +
      '<div style="flex:1">' + escHtml(m.name) + '</div>' +
      '<button class="subtask-del" onclick="removeEditTaskAssignee(\'' + m.id + '\')"><i data-lucide="x"></i></button></div>';
  }).join(''); if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.buildEditTaskAssigneeHTML = function(taskId) {
  var t = state.tasks.find(function(x) { return x.id === taskId; });
  window._editTaskAssignees = t ? ((t.assignees && t.assignees.length) ? t.assignees : (t.assignee ? [t.assignee] : [])).slice() : [];
  return ''; // 实际渲染由 renderEditTaskAssigneeList 在 modal 打开后完成
};

window.addEditTaskAssignee = function(taskId) {
  var sel = document.getElementById('fi-assignee-sel');
  if (!sel || !sel.value) return;
  if (!window._editTaskAssignees) window._editTaskAssignees = [];
  if (!window._editTaskAssignees.includes(sel.value)) {
    window._editTaskAssignees.push(sel.value);
    sel.value = '';
    window.renderEditTaskAssigneeList();
  }
};

window.removeEditTaskAssignee = function(mid) {
  window._editTaskAssignees = (window._editTaskAssignees || []).filter(function(x) { return x !== mid; });
  window.renderEditTaskAssigneeList();
};

// ─── Add Task ─────────────────────────────────────────────────────────────────
function openAddTask(preProjectId, preModuleId) {
  window._newTaskAssignees = [];
  const today=new Date().toISOString().slice(0,10);
  const preProj=preProjectId || (currentView.startsWith('project-')?currentView.slice(8):'');
  const projOpts=state.projects.map(p=>`<option value="${p.id}"${p.id===preProj?' selected':''}>${escHtml(p.name)}</option>`).join('');
  const memberOpts=state.members.map(m=>`<option value="${m.id}">${escHtml(m.name)}</option>`).join('');

  // Tag dropdown
  const tagSelectOpts = state.globalTags.map(tg=>`<option value="${tg.id}">${escHtml(tg.name)}</option>`).join('');

  openModal(`${modalHeader('新建任务')}
    <div class="modal-body">
      <div class="form-group"><label class="form-label">任务名称 <span style="color:var(--red)">*</span></label><input class="form-input" id="fi-title" placeholder="输入任务名称..." autofocus></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">所属项目 <span style="color:var(--red)">*</span></label><select class="form-select" id="fi-proj"><option value="">未分类</option>${projOpts}</select></div>
        <div class="form-group">
          <label class="form-label">负责人 <span style="color:var(--red)">*</span></label>
          <div id="fi-assignee-list" style="margin-bottom:8px;max-height:120px;overflow-y:auto">${buildTaskAssigneeListHTML()}</div>
          <div style="display:flex;gap:8px">
            <select class="form-select" id="fi-assignee-sel" style="flex:1"><option value="">选择成员...</option>${memberOpts}</select>
            <button class="btn btn-ghost btn-sm" onclick="addTaskAssignee()" style="white-space:nowrap">添加</button>
          </div>
        </div>
      </div>
      <div class="form-group"><label class="form-label">所属模块</label><select class="form-select" id="fi-module"><option value="">不归类</option>${getModuleOptsForProject(preProj)}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">开始时间</label><input class="form-input" type="date" id="fi-start-date" autocomplete="off"></div>
        <div class="form-group"><label class="form-label">截止日期</label><input class="form-input" type="date" id="fi-due" autocomplete="off"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">优先级</label><select class="form-select" id="fi-pri"><option>紧急</option><option selected>重要</option><option>普通</option></select></div>
        <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="fi-status"><option value="todo">待启动</option><option value="doing">进行中</option><option value="waiting">待反馈</option><option value="done">已完成</option></select></div>
      </div>
      ${state.globalTags.length?`<div class="form-group"><label class="form-label">标签</label><select class="form-select" id="fi-tag"><option value="">无</option>${tagSelectOpts}</select></div>`:''}
      <div class="toggle-row">
        <div><div class="toggle-label">设为里程碑</div><div class="toggle-sub">在甘特图中以菱形节点标注</div></div>
        <button class="toggle" id="fi-milestone" onclick="this.classList.toggle('on')"></button>
      </div>
    </div>
    <div class="modal-footer">
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitAddTask(this)">添加任务</button>
      </div>
    </div>`);
  window._addTagSel = [];
  requestAnimationFrame(() => {
    const startEl = document.getElementById('fi-start-date');
    if (startEl) startEl.value = '';
    var projSel = document.getElementById('fi-proj');
    if (projSel) {
      projSel.addEventListener('change', function() { updateModuleOpts(this.value); });
    }
    if (preModuleId) {
      var modSel = document.getElementById('fi-module');
      if (modSel) modSel.value = preModuleId;
    }
  });
  setTimeout(()=>{ document.getElementById('fi-title').focus(); },80);

}

// toggleAddTag removed: tags now use dropdown in add-task modal

async function submitAddTask(btn) {
  const titleEl = document.getElementById('fi-title');
  const title = titleEl ? titleEl.value.trim() : "";
  let hasError = false;
  if (!title) { if(titleEl) titleEl.style.borderColor='var(--red)'; hasError = true; }

  // 必选：所属项目
  const projEl = document.getElementById('fi-proj');
  const projectId = projEl ? projEl.value : '';
  if (!projectId) { if(projEl) projEl.style.borderColor='var(--red)'; hasError = true; }

  // V20: 多选负责人
  var assignees = window._newTaskAssignees || [];
  var assignee = assignees.length > 0 ? assignees[0] : '';
  if (!assignee) {
    var listEl = document.getElementById('fi-assignee-list');
    if (listEl) listEl.style.border = '2px dashed var(--red)';
    hasError = true;
  }

  if (hasError) return;
  setLoading(btn, true);

  // V20: 读取模块选择
  var moduleId = (document.getElementById('fi-module') || {}).value || null;

  // 增加安全检查，如果元素不存在则给默认值，防止报错
  const getVal = (id, def = "") => document.getElementById(id) ? document.getElementById(id).value : def;

  const newTask = {
    id: uid(),
    title: title,
    project_id: getVal('fi-proj'),
    assignee: assignee,
    assignees: assignees,
    due: getVal('fi-due', ''),
    priority: getVal('fi-pri', '重要'),
    status: getVal('fi-status', 'todo'),
    done: false,
    tags: [],
    subtasks: [],
    start_date: document.getElementById('fi-start-date')?.value || null,
      milestone: document.getElementById('fi-milestone')?.classList.contains('on') || false,
    created_at: new Date().toISOString().slice(0,10),
    moduleId: moduleId || null,
    module_id: moduleId || null
  };

  addTimelineEntry(newTask, '创建任务', '创建了任务');
  await syncTask(newTask);
  setLoading(btn, false);
  closeModal();
  await loadState();
  toast('任务已同步至云端', 'success');
  logAction('添加任务', `新建任务「${title}」`);
}

// ─── Edit Task ────────────────────────────────────────────────────────────────
function openEditTask(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  activeTaskTab='basic';
  const projOpts=state.projects.map(p=>`<option value="${p.id}"${p.id===t.projectId?' selected':''}>${escHtml(p.name)}</option>`).join('');
  const memberOpts=state.members.map(m=>`<option value="${m.id}">${escHtml(m.name)}</option>`).join('');
  const logsHTML = (() => {
    const allLogs = t.logs || [];
    if (!allLogs.length) return '<div style="font-size:12px;color:var(--text3);padding:16px 0;text-align:center">暂无时间线记录</div>';
    return '<div class="timeline">' + allLogs.map(l => {
      const dt = l.date ? (l.date.length > 10 ? l.date.slice(0,16).replace('T',' ') : l.date) : '';
      const name = l.user_name || '—';
      const action = l.action || (l.text ? '备注' : '—');
      const detail = l.detail || l.text || '';
      const isNote = action === '备注' || action === '跟进';
      return '<div class="timeline-item">        <div class="timeline-dot' + (isNote ? ' timeline-dot-note' : '') + '"></div>        <div class="timeline-body">          <div class="timeline-action">' + action + '</div>          ' + (detail ? '<div class="timeline-detail">' + detail + '</div>' : '') + '          <div class="timeline-meta">' + name + ' · ' + dt + '</div>        </div>      </div>';
    }).join('') + '</div>';
  })();

  // Tags
  const tagChipsHTML = state.globalTags.map(tg=>{
    const p=TAG_PALETTES[tg.paletteIdx%TAG_PALETTES.length];
    const sel=(t.tags||[]).includes(tg.id);
    return `<span class="tag-chip${sel?' selected':''}" id="edittag-${tg.id}" data-tagid="${tg.id}" onclick="toggleEditTag('${id}','${tg.id}')" style="background:${p.bg};color:${p.color};border-color:${p.border}">${escHtml(tg.name)}</span>`;
  }).join('');

  // Subtasks
  const subtaskHTML = buildSubtaskListHTML(t.subtasks||[], id);

  // Dependencies (other tasks, excluding self and done ones)
  const otherTasks = state.tasks.filter(x=>x.id!==id&&!x.done);
  const depListHTML = otherTasks.length ? otherTasks.map(x=>`<div class="dep-item">
    <input type="checkbox" ${(t.dependencies||[]).includes(x.id)?'checked':''} onchange="toggleDep('${id}','${x.id}',this.checked)">
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(x.title)}">${escHtml(x.title)}</span>
    <span class="pill pill-gray" style="font-size:10px;flex-shrink:0">${projName(x.projectId)}</span>
  </div>`).join('') : '<div style="font-size:12px;color:var(--text3);padding:10px 12px">没有其他进行中的任务</div>';

  openModal(`${modalHeader('编辑任务')}
    <div class="modal-tabs">
      <button class="modal-tab active" id="tab-basic" onclick="switchTaskTab('basic','${id}')">基本信息</button>
      <button class="modal-tab" id="tab-sub" onclick="switchTaskTab('sub','${id}')">子任务 ${t.subtasks&&t.subtasks.length?`(${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length})`:''}</button>
      <button class="modal-tab" id="tab-dep" onclick="switchTaskTab('dep','${id}')">依赖 ${t.dependencies&&t.dependencies.length?`(${t.dependencies.length})`:''}</button>
      <button class="modal-tab" id="tab-log" onclick="switchTaskTab('log','${id}')">记录 ${t.logs&&t.logs.length?`(${t.logs.length})`:''}</button>
      <button class="modal-tab" id="tab-gantt" onclick="switchTaskTab('gantt','${id}')">甘特图调整</button>
    </div>

    <div class="modal-body" id="task-tab-content">
      <div id="tab-pane-basic">
        <div class="form-group"><label class="form-label">任务名称</label><input class="form-input" id="fi-title" value="${t.title.replace(/"/g,'&quot;')}"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">所属项目 <span style="color:var(--red)">*</span></label><select class="form-select" id="fi-proj"><option value="">未分类</option>${projOpts}</select></div>
          <div class="form-group">
            <label class="form-label">负责人 <span style="color:var(--red)">*</span></label>
            <div id="fi-assignee-list" style="margin-bottom:8px;max-height:120px;overflow-y:auto">${buildEditTaskAssigneeHTML(id)}</div>
            <div style="display:flex;gap:8px">
              <select class="form-select" id="fi-assignee-sel" style="flex:1"><option value="">选择成员...</option>${memberOpts}</select>
              <button class="btn btn-ghost btn-sm" onclick="addEditTaskAssignee('${id}')" style="white-space:nowrap">添加</button>
            </div>
          </div>
        </div>
        <div class="form-group"><label class="form-label">所属模块</label><select class="form-select" id="fi-module"><option value="">不归类</option>${getModuleOptsForProject(t.projectId)}</select></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">开始时间</label><input class="form-input" type="date" id="fi-start-date" value="${t.startDate||''}"></div>
          <div class="form-group"><label class="form-label">截止日期</label><input class="form-input" type="date" id="fi-due" value="${t.due}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">优先级</label><select class="form-select" id="fi-pri"><option${t.priority==='紧急'?' selected':''}>紧急</option><option${t.priority==='重要'?' selected':''}>重要</option><option${t.priority==='普通'?' selected':''}>普通</option></select></div>
          <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="fi-status"><option value="todo"${t.status==='todo'?' selected':''}>待启动</option><option value="doing"${t.status==='doing'?' selected':''}>进行中</option><option value="waiting"${t.status==='waiting'?' selected':''}>待反馈</option><option value="done"${t.status==='done'?' selected':''}>已完成</option></select></div>
        </div>
        ${state.globalTags.length?`<div class="form-group"><label class="form-label">标签</label><div class="tag-list">${tagChipsHTML}</div></div>`:''}
        <div class="toggle-row">
          <div><div class="toggle-label">设为里程碑</div><div class="toggle-sub">在甘特图中以菱形节点标注</div></div>
          <button class="toggle${t.milestone?' on':''}" id="fi-milestone" onclick="this.classList.toggle('on')"></button>
        </div>
      </div>
      <div id="tab-pane-sub" style="display:none">
        <div class="form-label" style="margin-bottom:10px">子任务清单</div>
        <div class="subtask-list" id="subtask-list-modal">${subtaskHTML}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input class="form-input" id="new-subtask-input" placeholder="输入子任务..." onkeydown="if(event.key==='Enter')addSubtaskFromInput('${id}')">
          <button class="btn btn-ghost btn-sm" onclick="addSubtaskFromInput('${id}')">+</button>
        </div>
      </div>
      <div id="tab-pane-dep" style="display:none">
        <div class="form-label" style="margin-bottom:8px">前置依赖任务</div>
        <div class="form-hint" style="margin-bottom:10px">勾选的任务完成后，本任务才会解除"等待前置"状态</div>
        <div class="dep-list">${depListHTML}</div>
      </div>
      <div id="tab-pane-log" style="display:none">
        ${logsHTML}
        <button class="btn btn-ghost" style="width:100%;margin-top:6px;font-size:12px" onclick="closeModal();openLog('${t.id}')">+ 记录新跟进</button>
      </div>
      <div id="tab-pane-gantt" style="display:none">
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">加载中...</div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-danger" onclick="confirmDeleteTask('${t.id}')">删除任务</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitEditTask('${t.id}', this)">保存</button>
      </div>
    </div>`);
  // V20: 联动模块下拉框 + 预填模块值 + 渲染负责人列表
  requestAnimationFrame(function() {
    var projSel = document.getElementById('fi-proj');
    if (projSel) {
      projSel.addEventListener('change', function() { updateModuleOpts(this.value); });
    }
    var modSel = document.getElementById('fi-module');
    if (modSel && t.moduleId) modSel.value = t.moduleId;
    window.renderEditTaskAssigneeList();
  });
}

function switchTaskTab(tab, taskId) {
  ['basic','sub','dep','log','gantt'].forEach(t => {
    const btn=document.getElementById('tab-'+t);
    const pane=document.getElementById('tab-pane-'+t);
    if (btn) btn.classList.toggle('active', t===tab);
    if (pane) pane.style.display = t===tab?'block':'none';
  });
  activeTaskTab = tab;
  if (tab === 'gantt') loadTaskGanttHistory(taskId);
}

async function loadTaskGanttHistory(taskId) {
  const pane = document.getElementById('tab-pane-gantt');
  if (!pane) return;
  pane.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">加载中...</div>';

  try {
    const { data, error } = await sb.from('logs')
      .select('*')
      .in('action', ['甘特图调整','gantt_adjust'])
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      pane.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px">加载失败：' + error.message + '</div>';
      return;
    }

    const records = (data || []).filter(row => {
      try {
        const d = JSON.parse(row.detail || '{}');
        return d.taskId === taskId;
      } catch(e) { return false; }
    }).map(row => {
      try {
        const d = JSON.parse(row.detail || '{}');
        return {
          mode: d.mode || 'resize',
          oldDue: d.oldDue || '',
          newDue: d.newDue || '',
          operator: row.user_name || '—',
          time: new Date(row.created_at).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}),
          rawDate: row.created_at
        };
      } catch(e) { return null; }
    }).filter(Boolean);

    if (!records.length) {
      pane.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">暂无甘特图调整记录</div>';
      return;
    }

    const rows = records.map((r, i) => {
      const modeLabel = r.mode === 'move' ? '平移时间条' : '调整截止日期';
      const modeColor = r.mode === 'move' ? 'var(--amber)' : 'var(--blue)';
      return `<tr>
        <td style="padding:6px 10px;color:var(--text3);text-align:center">${i + 1}</td>
        <td style="padding:6px 10px;color:${modeColor};font-weight:500">${modeLabel}</td>
        <td style="padding:6px 10px;font-family:var(--mono);font-size:12px;color:var(--text2)">${r.oldDue || '—'}</td>
        <td style="padding:6px 10px;font-family:var(--mono);font-size:12px;color:var(--text)">${r.newDue || '—'}</td>
        <td style="padding:6px 10px;color:var(--text2)">${escHtml(r.operator)}</td>
        <td style="padding:6px 10px;color:var(--text3);font-size:11px">${r.time}</td>
      </tr>`;
    }).join('');

    pane.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--surface2)">
        <th style="padding:6px 10px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);width:32px">#</th>
        <th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">调整方式</th>
        <th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">原截止</th>
        <th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">新截止</th>
        <th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">操作人</th>
        <th style="padding:6px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">时间</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  } catch(err) {
    pane.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px">加载异常</div>';
  }
}

async function saveState(idOrType) {
    // 1. 如果传入的是某个任务的 ID，同步该任务到云端
    if (typeof idOrType === 'string' && idOrType.startsWith('i')) {
        const task = state.tasks.find(t => t.id === idOrType);
        if (task) await syncTask(task);
    } 
    // 2. 如果是通用保存，我们目前采用“本地备份+重要数据云同步”策略
    localStorage.setItem('pm_local_settings', JSON.stringify({
        members: state.members,
        globalTags: state.globalTags
    }));
    
    // 刷新页面显示
    updateBadges();
    render();
}

function toggleEditTag(taskId, tagId) {
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  if(!t.tags) t.tags=[];
  const idx=t.tags.indexOf(tagId);
  if (idx>=0) t.tags.splice(idx,1); else t.tags.push(tagId);
  saveState();
  const el=document.getElementById('edittag-'+tagId);
  if (el) el.classList.toggle('selected', t.tags.includes(tagId));
}

function toggleDep(taskId, depId, checked) {
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  const depTask = state.tasks.find(x=>x.id===depId);
  if(!t.dependencies) t.dependencies=[];
  if (checked && !t.dependencies.includes(depId)) {
    t.dependencies.push(depId);
    syncTask(t);
    if (depTask) logAction('设置前置条件', `「${t.title}」的前置条件设为「${depTask.title}」`);
  } else if (!checked) {
    t.dependencies = t.dependencies.filter(x=>x!==depId);
    syncTask(t);
    if (depTask) logAction('移除前置条件', `移除「${t.title}」的前置条件「${depTask.title}」`);
  }
}

async function submitEditTask(id, btn) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const title = document.getElementById('fi-title').value.trim();
  if (!title) return;
  setLoading(btn, true);

  // 记录旧值用于时间线对比
  const oldTitle = t.title;
  const oldProjId = t.project_id;
  const oldAssignee = t.assignee;
  const oldDue = t.due;
  const oldStart = t.startDate || '';
  const oldPriority = t.priority;
  const oldStatus = t.status;
  const oldMilestone = t.milestone;

  // 更新本地对象数据
  const newProjId = document.getElementById('fi-proj').value;
  const newAssignees = window._editTaskAssignees || [];
  const newAssignee = newAssignees.length > 0 ? newAssignees[0] : '';
  const newDue = document.getElementById('fi-due').value;
  const newStart = document.getElementById('fi-start-date')?.value || '';
  const newPriority = document.getElementById('fi-pri').value;
  const newStatus = document.getElementById('fi-status').value;
  const newMilestone = document.getElementById('fi-milestone')?.classList.contains('on') || false;
  const newModuleId = (document.getElementById('fi-module') || {}).value || null;  // V20

  t.title = title;
  t.project_id = newProjId;
  t.assignee = newAssignee;
  t.assignees = newAssignees;
  t.due = newDue;
  t.startDate = newStart || null;
  t.priority = newPriority;
  t.status = newStatus;
  t.done = newStatus === 'done';
  t.milestone = newMilestone;
  t.moduleId = newModuleId || null;      // V20
  t.module_id = t.moduleId;             // V20

  // 完成/取消完成
  if (newStatus === 'done' && oldStatus !== 'done') {
    t.completedAt = new Date().toISOString();
    t.completedBy = currentUser ? currentUser.id : '';
  } else if (newStatus !== 'done' && oldStatus === 'done') {
    t.completedAt = null;
    t.completedBy = null;
  }

  // 生成时间线事件
  const si = (s) => ({todo:'待启动',doing:'进行中',waiting:'待反馈',done:'已完成'}[s]||s);
  if (title !== oldTitle) addTimelineEntry(t, '修改标题', `从「${oldTitle}」改为「${title}」`);
  if (newProjId !== (oldProjId||'')) addTimelineEntry(t, '变更项目', `项目已变更`);
  if (newAssignee !== (oldAssignee||'')) {
    const oldName = memberName(oldAssignee)||'未分配';
    const newName = memberName(newAssignee)||'未分配';
    addTimelineEntry(t, '变更负责人', `从「${oldName}」改为「${newName}」`);
  }
  if (newDue !== (oldDue||'')) addTimelineEntry(t, '修改截止日', `从「${oldDue||'无'}」改为「${newDue}」`);
  if (newStart !== oldStart) addTimelineEntry(t, '修改开始时间', `从「${oldStart||'无'}」改为「${newStart||'无'}」`);
  if (newPriority !== oldPriority) addTimelineEntry(t, '修改优先级', `从「${oldPriority}」改为「${newPriority}」`);
  if (newStatus !== oldStatus) addTimelineEntry(t, '状态变更', `从「${si(oldStatus)}」改为「${si(newStatus)}」`);
  if (newMilestone !== oldMilestone) addTimelineEntry(t, newMilestone?'设为里程碑':'取消里程碑', '');

  await syncTask(t);
  if (typeof pushNotification === 'function' && t.assignee) {
    var _si2 = function(s) { return ({todo:'待启动',doing:'进行中',waiting:'待反馈',done:'已完成'}[s]||s); };
    var _changer = currentUser?.name || '系统';
    if (newStatus !== oldStatus) {
      pushNotification({ recipientId:t.assignee, type:'task_changed',
        title:'「' + t.title + '」状态已变更',
        body:_changer + ' 将状态从「' + _si2(oldStatus) + '」改为「' + _si2(newStatus) + '」',
        navType:'task', navId:t.id });
    }
    if (newDue !== (oldDue||'') && newDue) {
      pushNotification({ recipientId:t.assignee, type:'task_changed',
        title:'「' + t.title + '」截止日已调整',
        body:_changer + ' 将截止日从「' + (oldDue||'无') + '」改为「' + newDue + '」',
        navType:'task', navId:t.id });
    }
    if (newPriority !== oldPriority && newPriority === '紧急') {
      pushNotification({ recipientId:t.assignee, type:'task_changed',
        title:'「' + t.title + '」已标记为紧急',
        body:_changer + ' 将优先级升为「紧急」',
        navType:'task', navId:t.id });
    }
  }
  if (typeof pushNotification === 'function' && newAssignee && newAssignee !== (oldAssignee||'')) {
    pushNotification({ recipientId:newAssignee, type:'task_assigned',
      title:'你被分配了任务「' + t.title + '」',
      body:(currentUser?.name||'系统') + ' 将此任务分配给你',
      navType:'task', navId:t.id });
  }
  setLoading(btn, false);
  closeModal();
  render();
  toast('更改已同步至云端', 'success');
  logAction('编辑任务', `更新任务「${t.title}」`);
}

async function confirmDeleteTask(id) {
  showConfirm('删除任务', '确认删除这个任务？该操作无法撤销', async function() {
    const t = state.tasks.find(x => x.id === id);
    const title = t ? t.title : id;
    const success = await deleteFromCloud('tasks', id);
    if (success) {
      state.tasks = state.tasks.filter(x => x.id !== id);
      closeModal();
      _lastLoadTime = Date.now(); // 阻止实时 loadState 800ms 内二次触发
      render();
      toast('任务已永久删除', 'success');
      logAction('删除任务', `删除任务「${title}」`);
    }
  }, {danger: true, confirmLabel: '删除'});
}
// ─── Log ──────────────────────────────────────────────────────────────────────
function openLog(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  openModal(`${modalHeader('记录跟进')}
    <div class="modal-body">
      <div style="font-size:13px;color:var(--text2);padding:8px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:16px">${escHtml(t.title)}</div>
      <div class="form-group"><label class="form-label">跟进内容</label><textarea class="form-textarea" id="fi-log" placeholder="记录这次跟进的内容、结论、下一步行动..." autofocus></textarea></div>
      <div class="form-group">
        <label class="form-label">更新状态（可选）</label>
        <select class="form-select" id="fi-status">
          <option value="">状态不变</option>
          <option value="todo"${t.status==='todo'?' selected':''}>待启动</option>
          <option value="doing"${t.status==='doing'?' selected':''}>进行中</option>
          <option value="waiting"${t.status==='waiting'?' selected':''}>待反馈</option>
          <option value="done">已完成</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitLog('${id}')">记录</button>
      </div>
    </div>`);
  setTimeout(()=>document.getElementById('fi-log').focus(),80);
}

function submitLog(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  const text=document.getElementById('fi-log').value.trim();
  if (!text) { document.getElementById('fi-log').style.borderColor='var(--red)'; return; }
  const status=document.getElementById('fi-status').value;
  if(!t.logs) t.logs=[];
  t.logs.unshift({
    date: new Date().toISOString(),
    user_id: currentUser ? currentUser.id : '',
    user_name: currentUser ? currentUser.name : '',
    action: '备注',
    detail: text
  });
  if(status) {
    const oldStatus = t.status;
    t.status = status;
    t.done = status === 'done';
    if (status === 'done' && oldStatus !== 'done') {
      t.completedAt = new Date().toISOString();
      t.completedBy = currentUser ? currentUser.id : '';
    }
    const si = (s) => ({todo:'待启动',doing:'进行中',waiting:'待反馈',done:'已完成'}[s]||s);
    addTimelineEntry(t, '状态变更', `从「${si(oldStatus)}」改为「${si(status)}」（通过备注）`);
  }
  saveState(); closeModal(); render(); toast('备注已记录', 'success');
}

// ─── Projects CRUD ────────────────────────────────────────────────────────────
