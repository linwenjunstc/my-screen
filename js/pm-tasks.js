/* ════════════════════════════════════════════════
 * pm-tasks.js  —  任务卡片 / 增删改 / 子任务 / 依赖 / 任务日志
 * ════════════════════════════════════════════════ */

function taskCardHTML(t) {
  const di=dueInfo(t), si=statusInfo(t.status), pn=projName(t.projectId);
  const priCls=t.priority==='紧急'?'pill-red':t.priority==='重要'?'pill-amber':'pill-gray';
  const showProj = currentView!=='project-'+t.projectId;
  const showMod = t.moduleId && currentView !== 'project-' + t.projectId;
  const waitingDeps = isWaitingDeps(t);
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
  const waitingDepsBadge = waitingDeps ? '<span class="dep-blocked-badge"><i data-lucide=\"alert-triangle\" style=\"width:10px;height:10px;margin-right:1px\"></i>等待前置</span>' : '';

	return `<div class="task-card stagger-in${t.done?' done':''}${waitingDeps?' dep-blocked':''}" data-task-id="${t.id}" onclick="openEditTask('${t.id}')">

    <div class="check-wrap" onclick="event.stopPropagation();if(!${t.done})celebrateCompletion(event.clientX,event.clientY);toggleDone('${t.id}')">
      <div class="check-btn${t.done?' checked':''}"></div>
    </div>
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      ${t.description?`<div class="task-desc-preview">${escHtml(t.description.slice(0,60))}${t.description.length>60?'…':''}</div>`:''}
      <div class="task-meta">
        ${showProj?`<span class="pill pill-project">${pn}</span>`:''}
        ${showMod?`<span class="pill pill-module">${escHtml(moduleName(t.moduleId))}</span>`:''}
        <span class="pill ${di.cls}">${di.text}</span>
	        ${t.startDate?`<span class="pill pill-start">${t.startDate}</span>`:''}
        <span class="pill ${priCls}">${escHtml(t.priority)}</span>
        <span class="pill ${si.cls}">${si.lbl}</span>
        ${tagPills}${milestoneBadge}${waitingDepsBadge}
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

// ─── 阻塞原因输入：自定义二级浮层 ──────────────────────────────────
window._blockReasonResolve = null;  // Promise 回调

window.requestBlockReason = function(currentReason) {
  return new Promise(function(resolve) {
    window._blockReasonResolve = resolve;
    var ov = document.getElementById('block-reason-overlay');
    var input = document.getElementById('block-reason-input');
    var btn = document.getElementById('block-reason-confirm');
    if (!ov || !input || !btn) { resolve(null); return; }
    input.value = currentReason || '';
    btn.disabled = (input.value.trim().length < 5);
    input.oninput = function() {
      btn.disabled = (input.value.trim().length < 5);
    };
    input.onkeydown = function(e) {
      if (e.key === 'Escape') cancelBlockReason();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !btn.disabled) confirmBlockReason();
    };
    ov.classList.add('open');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(function() { input.focus(); }, 50);
  });
};

window.confirmBlockReason = function() {
  var input = document.getElementById('block-reason-input');
  var reason = input.value.trim();
  if (reason.length < 5) return;
  document.getElementById('block-reason-overlay').classList.remove('open');
  if (window._blockReasonResolve) {
    window._blockReasonResolve(reason);
    window._blockReasonResolve = null;
  }
};

window.cancelBlockReason = function() {
  document.getElementById('block-reason-overlay').classList.remove('open');
  if (window._blockReasonResolve) {
    window._blockReasonResolve(null);  // null = 取消
    window._blockReasonResolve = null;
  }
};

window.onBlockReasonOverlayClick = function(e) {
  if (e.target === document.getElementById('block-reason-overlay')) cancelBlockReason();
};

// 任务状态选择器的 onchange（替代 Part 1 的 prompt 版本）
window.onTaskStatusChange = async function(selectEl) {
  if (!selectEl) return;
  if (selectEl.value !== 'blocked') return;
  // 暂存 prev 值，万一取消用得上
  var prev = selectEl.getAttribute('data-prev') || 'todo';
  var reason = await requestBlockReason('');
  if (reason == null) {
    // 用户取消 → 状态回退
    selectEl.value = prev;
    selectEl.removeAttribute('data-blocked-reason');
    return;
  }
  selectEl.setAttribute('data-blocked-reason', reason);
};

// ─── Toggle done ──────────────────────────────────────────────────────────────
async function toggleDone(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    try {
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
      if (t.done && !wasDone) {
        pushTaskNotification(t, { type:'task_done',
          title:'「' + t.title + '」已完成',
          body:(currentUser?.name||'系统') + ' 标记此任务为已完成',
          navType:'task', navId:t.id });
      }
      _lastLoadTime = Date.now();
      render();
      if (t.done) logAction('完成任务', `标记「${t.title}」为已完成`);
    } catch(e) {
      console.error('[toggleDone]', e);
      t.done = !t.done;
      t.status = t.done ? 'done' : 'todo';
      render();
      toast('操作失败: ' + (e.message || '未知错误'), 'error');
    }
  }
}

// ─── Subtask toggle ───────────────────────────────────────────────────────────
async function toggleSubtask(taskId, subtaskId) {
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  const s=t.subtasks.find(x=>x.id===subtaskId); if(!s) return;
  const willDone = !s.done;
  s.done = willDone;
  await syncTask(t);
  _lastLoadTime = Date.now();
  renderModalSubtasks(taskId);
  if (willDone) logAction('完成子任务', `「${t.title}」→ 子任务「${s.title}」已完成`);
}

function renderModalSubtasks(taskId) {
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  const el=document.getElementById('subtask-list-modal'); if(!el) return;
  el.innerHTML = buildSubtaskListHTML(t.subtasks||[], taskId);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function buildSubtaskListHTML(subtasks, taskId) {
  if (!subtasks.length) return '<div style="font-size:12px;color:var(--text3);padding:8px 0">暂无子任务，在下方输入框添加</div>';
  return subtasks.map(s=>`<div class="subtask-item">
    <div class="subtask-check${s.done?' done':''}" onclick="toggleSubtask('${taskId}','${s.id}')"></div>
    <div class="subtask-text${s.done?' done':''}">${escHtml(s.title)}</div>
    <button class="subtask-del" onclick="deleteSubtask('${taskId}','${s.id}')"><i data-lucide="x"></i></button>
  </div>`).join('');
}

async function addSubtaskFromInput(taskId) {
  const inp=document.getElementById('new-subtask-input'); if(!inp) return;
  const title=inp.value.trim(); if(!title) return;
  const t=state.tasks.find(x=>x.id===taskId); if(!t) return;
  if(!t.subtasks) t.subtasks=[];
  t.subtasks.push({id:uid(),title,done:false});
  inp.value='';
  await syncTask(t);
  renderModalSubtasks(taskId);
  logAction('添加子任务', `为「${t.title}」添加子任务「${title}」`);
}

async function deleteSubtask(taskId, subtaskId) {
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  const s = t.subtasks.find(x=>x.id===subtaskId);
  t.subtasks = t.subtasks.filter(x=>x.id!==subtaskId);
  await syncTask(t);
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
        <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="fi-status" data-prev="todo" onchange="onTaskStatusChange(this)"><option value="todo">待启动</option><option value="doing">进行中</option><option value="blocked">🚧 阻塞中</option><option value="waiting">待反馈</option><option value="done">已完成</option></select></div>
      </div>
      ${state.globalTags.length?`<div class="form-group"><label class="form-label">标签</label><select class="form-select" id="fi-tag"><option value="">无</option>${tagSelectOpts}</select></div>`:''}
      <div class="form-group">
        <label class="form-label">描述</label>
        <textarea class="form-input form-textarea" id="fi-desc" rows="3" placeholder="任务背景、验收标准、参考链接..." style="resize:vertical;min-height:72px"></textarea>
      </div>
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
  var tagVal = (document.getElementById('fi-tag') || {}).value || '';

  // ★ blocked 状态：必填原因
  var newStatus = getVal('fi-status', 'todo');
  var newBlockedReason = null, newBlockedAt = null, newBlockedBy = null;
  if (newStatus === 'blocked') {
    var statusSelect = document.getElementById('fi-status');
    var reason = (statusSelect && statusSelect.getAttribute('data-blocked-reason')) || '';
    if (!reason || reason.length < 5) {
      alert('选择「阻塞中」必须填写原因');
      setLoading(btn, false);
      return;
    }
    newBlockedReason = reason;
    newBlockedAt = new Date().toISOString();
    newBlockedBy = currentUser ? currentUser.id : '';
  }

  const newTask = {
    id: uid(),
    title: title,
    project_id: getVal('fi-proj'),
    assignee: assignee,
    assignees: assignees,
    due: getVal('fi-due', ''),
    priority: getVal('fi-pri', '重要'),
    status: newStatus,
    blocked_reason: newBlockedReason,
    blocked_at: newBlockedAt,
    blocked_by: newBlockedBy,
    done: false,
    tags: tagVal ? [tagVal] : [],
    subtasks: [],
    start_date: document.getElementById('fi-start-date')?.value || null,
      milestone: document.getElementById('fi-milestone')?.classList.contains('on') || false,
    description: (document.getElementById('fi-desc')?.value || '').trim(),
    created_at: (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })(),
    moduleId: moduleId || null,
    module_id: moduleId || null
  };

  addTimelineEntry(newTask, '创建任务', '创建了任务');
  try {
    await syncTask(newTask);
    _lastLoadTime = Date.now();
    setLoading(btn, false);
    closeModal();
    window._newTaskAssignees = [];
    await loadState(true);
    toast('任务已同步至云端', 'success');
    logAction('添加任务', `新建任务「${title}」`);
  } catch(e) {
    console.error('[submitAddTask]', e);
    setLoading(btn, false);
    toast('保存失败: ' + (e.message || '未知错误'), 'error');
  }
}

// ─── Edit Task ────────────────────────────────────────────────────────────────
function openEditTask(id) {
  window._editTaskAssignees = [];
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
          <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="fi-status" data-prev="${t.status||'todo'}" onchange="onTaskStatusChange(this)"><option value="todo"${t.status==='todo'?' selected':''}>待启动</option><option value="doing"${t.status==='doing'?' selected':''}>进行中</option><option value="blocked"${t.status==='blocked'?' selected':''}>🚧 阻塞中</option><option value="waiting"${t.status==='waiting'?' selected':''}>待反馈</option><option value="done"${t.status==='done'?' selected':''}>已完成</option></select></div>
        </div>
        ${state.globalTags.length?`<div class="form-group"><label class="form-label">标签</label><div class="tag-list">${tagChipsHTML}</div></div>`:''}
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-input form-textarea" id="fi-desc" rows="3" style="resize:vertical;min-height:72px">${escHtml(t.description || '')}</textarea>
        </div>
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

async function toggleDep(taskId, depId, checked) {
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  const depTask = state.tasks.find(x=>x.id===depId);
  if(!t.dependencies) t.dependencies=[];
  if (checked && !t.dependencies.includes(depId)) {
    t.dependencies.push(depId);
    await syncTask(t);
    if (depTask) logAction('设置前置条件', `「${t.title}」的前置条件设为「${depTask.title}」`);
  } else if (!checked) {
    t.dependencies = t.dependencies.filter(x=>x!==depId);
    await syncTask(t);
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

  // ★ blocked 状态进入/退出处理
  if (newStatus === 'blocked' && oldStatus !== 'blocked') {
    var statusSelect = document.getElementById('fi-status');
    var reason = (statusSelect && statusSelect.getAttribute('data-blocked-reason')) || '';
    if (!reason || reason.length < 5) {
      alert('请重新选择「阻塞中」并填写原因');
      t.status = oldStatus;  // 回退
      setLoading(btn, false);
      return;
    }
    t.blocked_reason = reason;
    t.blocked_at = new Date().toISOString();
    t.blocked_by = currentUser ? currentUser.id : '';
    logAction('标记阻塞', '任务「' + t.title + '」标记为阻塞 · 原因：' + reason);
    addTimelineEntry(t, '标记阻塞', '原因：' + reason);
  } else if (oldStatus === 'blocked' && newStatus !== 'blocked') {
    var oldReason = t.blocked_reason || '';
    t.blocked_reason = null;
    t.blocked_at = null;
    t.blocked_by = null;
    logAction('解除阻塞', '任务「' + t.title + '」解除阻塞 · 原原因：' + oldReason);
    addTimelineEntry(t, '解除阻塞', '原原因：' + oldReason);
  }

  // 生成时间线事件
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
  if (newStatus !== oldStatus && !(newStatus === 'blocked' && oldStatus !== 'blocked') && !(oldStatus === 'blocked' && newStatus !== 'blocked')) {
    addTimelineEntry(t, '状态变更', '从「' + (STATUS_LABELS[oldStatus] || oldStatus) + '」改为「' + (STATUS_LABELS[newStatus] || newStatus) + '」');
  }
  if (newMilestone !== oldMilestone) addTimelineEntry(t, newMilestone?'设为里程碑':'取消里程碑', '');
  var newDesc = (document.getElementById('fi-desc')?.value || '').trim();
  if (newDesc !== (t.description || '')) addTimelineEntry(t, '修改描述', '');
  t.description = newDesc;

  try {
    await syncTask(t);
    _lastLoadTime = Date.now();
    {
      var _si2 = function(s) { return (STATUS_LABELS[s]||s); };
      var _changer = currentUser?.name || '系统';
      if (newStatus !== oldStatus) {
        pushTaskNotification(t, { type:'task_changed',
          title:'「' + t.title + '」状态已变更',
          body:_changer + ' 将状态从「' + _si2(oldStatus) + '」改为「' + _si2(newStatus) + '」',
          navType:'task', navId:t.id });
      }
      if (newDue !== (oldDue||'') && newDue) {
        pushTaskNotification(t, { type:'task_changed',
          title:'「' + t.title + '」截止日已调整',
          body:_changer + ' 将截止日从「' + (oldDue||'无') + '」改为「' + newDue + '」',
          navType:'task', navId:t.id });
      }
      if (newPriority !== oldPriority && newPriority === '紧急') {
        pushTaskNotification(t, { type:'task_changed',
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
    window._editTaskAssignees = [];
    render();
    toast('更改已同步至云端', 'success');
    logAction('编辑任务', `更新任务「${t.title}」`);
  } catch(e) {
    console.error('[submitEditTask]', e);
    setLoading(btn, false);
    toast('保存失败: ' + (e.message || '未知错误'), 'error');
  }
}

async function confirmDeleteTask(id) {
  showConfirm('删除任务', '确认删除这个任务？该操作无法撤销', async function() {
    try {
    const t = state.tasks.find(x => x.id === id);
    const title = t ? t.title : id;
    const success = await deleteFromCloud('tasks', id);
    if (success) {
      state.tasks = state.tasks.filter(x => x.id !== id);
      closeModal();
      _lastLoadTime = Date.now();
      render();
      toast('任务已永久删除', 'success');
      logAction('删除任务', `删除任务「${title}」`);
    }
    } catch(e) {
      console.error('[confirmDeleteTask]', e);
      toast('删除失败: ' + (e.message || '未知错误'), 'error');
    }
  }, {danger: true, confirmLabel: '删除'});
}
// ─── Log ──────────────────────────────────────────────────────────────────────
function openLog(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  openModal(`${modalHeader('记录跟进')}
    <div class="modal-body">
      <div style="font-size:13px;color:var(--text2);padding:8px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:16px">${escHtml(t.title)}</div>
      <div class="form-group" style="position:relative"><label class="form-label">跟进内容</label><textarea class="form-textarea" id="fi-log" placeholder="记录这次跟进的内容、结论、下一步行动... 输入 @ 提及成员" autofocus oninput="onLogInputChange('${id}')" onkeydown="onLogInputKeydown(event,'${id}')"></textarea><div id="mention-dropdown" class="mention-dropdown" style="display:none"></div></div>
      <div class="form-group">
        <label class="form-label">更新状态（可选）</label>
        <select class="form-select" id="fi-status" data-prev="${t.status||'todo'}" onchange="onTaskStatusChange(this)">
          <option value="">状态不变</option>
          <option value="todo"${t.status==='todo'?' selected':''}>待启动</option>
          <option value="doing"${t.status==='doing'?' selected':''}>进行中</option>
          <option value="blocked"${t.status==='blocked'?' selected':''}>🚧 阻塞中</option>
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

async function submitLog(id) {
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
  if (status && status !== t.status) {
    var oldStatus = t.status;
    t.status = status;
    t.done = status === 'done';

    if (status === 'done' && oldStatus !== 'done') {
      t.completedAt = new Date().toISOString();
      t.completedBy = currentUser ? currentUser.id : '';
    }

    // ★ blocked 状态进入：必填原因
    if (status === 'blocked' && oldStatus !== 'blocked') {
      var statusSelect = document.getElementById('fi-status');
      var reason = (statusSelect && statusSelect.getAttribute('data-blocked-reason')) || '';
      if (!reason || reason.length < 5) {
        alert('请重新选择「阻塞中」并填写原因');
        t.status = oldStatus;  // 回退
        return;
      }
      t.blocked_reason = reason;
      t.blocked_at = new Date().toISOString();
      t.blocked_by = currentUser ? currentUser.id : '';
      logAction('标记阻塞', '任务「' + t.title + '」标记为阻塞 · 原因：' + reason);
      addTimelineEntry(t, '标记阻塞', '原因：' + reason);
    }
    // ★ blocked 状态退出：清空字段
    else if (oldStatus === 'blocked' && status !== 'blocked') {
      var oldReason = t.blocked_reason || '';
      t.blocked_reason = null;
      t.blocked_at = null;
      t.blocked_by = null;
      logAction('解除阻塞', '任务「' + t.title + '」解除阻塞 · 原原因：' + oldReason);
      addTimelineEntry(t, '解除阻塞', '原原因：' + oldReason);
    }

    addTimelineEntry(t, '状态变更', '从「' + (STATUS_LABELS[oldStatus] || oldStatus) + '」改为「' + (STATUS_LABELS[status] || status) + '」（通过备注）');
  }
	// @提及通知
	var mentionedIds = [];
	var mentions = text.match(/@(\S+)/g);
	if (mentions && state.members) {
	  mentions.forEach(function(m) {
	    var name = m.slice(1);
	    var member = state.members.find(function(x) { return x.name === name; });
	    if (member && mentionedIds.indexOf(member.id) === -1) {
	      mentionedIds.push(member.id);
	      if (typeof pushNotification === 'function') {
	        pushNotification({
	          recipientId: member.id,
	          type: 'task_mentioned',
	          title: '有人在备注中提到了你',
	          body: (currentUser ? currentUser.name : '') + ' 在任务「' + t.title + '」的跟进中 @ 了你',
	          navType: 'task',
	          navId: t.id
	        });
	      }
	    }
	  });
	}
	try {
	  await saveState(id);
	  _lastLoadTime = Date.now();
	  closeModal();
	  render();
	  toast('备注已记录', 'success');
	} catch(e) {
	  console.error('[submitLog]', e);
	  toast('保存失败: ' + (e.message || '未知错误'), 'error');
	}
}

// ── @提及 ──

function getCaretCoordinates(textarea, pos) {
  var mirror = document.getElementById('mention-mirror');
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.id = 'mention-mirror';
    mirror.style.cssText = 'position:fixed;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;pointer-events:none;z-index:-1;';
    document.body.appendChild(mirror);
  }
  var style = window.getComputedStyle(textarea);
  mirror.style.width = textarea.clientWidth + 'px';
  mirror.style.font = style.font;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.wordSpacing = style.wordSpacing;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.display = 'block';
  var textBefore = textarea.value.substring(0, pos);
  mirror.textContent = textBefore;
  var span = document.createElement('span');
  span.textContent = '.';
  mirror.appendChild(span);
  var taRect = textarea.getBoundingClientRect();
  var mirrorRect = mirror.getBoundingClientRect();
  var spanRect = span.getBoundingClientRect();
  mirror.style.display = 'none';
  return {
    left: taRect.left + (spanRect.left - mirrorRect.left) - textarea.scrollLeft,
    top: taRect.top + (spanRect.top - mirrorRect.top) - textarea.scrollTop,
    bottom: taRect.top + (spanRect.top - mirrorRect.top) + (parseInt(style.lineHeight) || 16) - textarea.scrollTop
  };
}

function onLogInputChange(taskId) {
  var textarea = document.getElementById('fi-log');
  if (!textarea) return;
  var val = textarea.value;
  var pos = textarea.selectionStart;
  var atPos = -1;
  for (var i = pos - 1; i >= 0; i--) {
    if (val[i] === '@') { atPos = i; break; }
    if (val[i] === ' ' || val[i] === '\n') break;
  }
  var dd = document.getElementById('mention-dropdown');
  if (atPos === -1) { if (dd) dd.style.display = 'none'; return; }
  var query = val.slice(atPos + 1, pos).toLowerCase();
  var members = (state.members || []).filter(function(m) {
    return m.name.toLowerCase().indexOf(query) !== -1 || (m.id && m.id.toString().toLowerCase().indexOf(query) !== -1);
  });
  if (!members.length) { if (dd) dd.style.display = 'none'; return; }
  if (!dd) return;
  window._mentionList = members;
  window._mentionTaskId = taskId;
  window._mentionStartPos = atPos;
  dd.style.display = 'block';
  dd.innerHTML = members.map(function(m, i) {
    return '<div class="mention-item' + (i === 0 ? ' mention-active' : '') + '" data-idx="' + i + '" onmousedown="event.preventDefault();selectMention(' + i + ')">' +
      '<div class="member-avatar" style="background:' + (memberColor ? memberColor(m.id) : '#ccc') + '">' + (memberInitial ? memberInitial(m.id) : (m.name||'').charAt(0)) + '</div>' +
      '<span>' + escHtml(m.name) + '</span>' +
    '</div>';
  }).join('');
  var caret = getCaretCoordinates(textarea, atPos);
  var ddWidth = Math.min(220, Math.max(180, textarea.clientWidth));
  var ddLeft = Math.min(caret.left, window.innerWidth - ddWidth - 12);
  var ddTop = caret.bottom + 4;
  var estHeight = Math.min(members.length, 6) * 34 + 4;
  if (ddTop + estHeight > window.innerHeight - 40) {
    ddTop = caret.top - estHeight - 8;
  }
  dd.style.position = 'fixed';
  dd.style.left = Math.max(4, ddLeft) + 'px';
  dd.style.top = Math.max(4, ddTop) + 'px';
  dd.style.width = ddWidth + 'px';
  dd.style.maxHeight = Math.min(estHeight + 10, 300) + 'px';
  dd.style.zIndex = '99999';
}

function onLogInputKeydown(event, taskId) {
  var dd = document.getElementById('mention-dropdown');
  if (!dd || dd.style.display === 'none') return;
  var items = dd.querySelectorAll('.mention-item');
  if (!items.length) return;
  var activeIdx = -1;
  items.forEach(function(item, i) {
    if (item.classList.contains('mention-active')) activeIdx = i;
  });
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIdx = (activeIdx + 1) % items.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIdx = (activeIdx - 1 + items.length) % items.length;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (activeIdx >= 0) { selectMention(activeIdx); return; }
  } else if (event.key === 'Escape') {
    dd.style.display = 'none';
    return;
  } else { return; }
  items.forEach(function(item, i) {
    item.classList.toggle('mention-active', i === activeIdx);
  });
  var activeItem = items[activeIdx];
  if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
}

function selectMention(idx) {
  var m = window._mentionList && window._mentionList[idx];
  if (!m) return;
  var textarea = document.getElementById('fi-log');
  if (!textarea) return;
  var val = textarea.value;
  var startPos = window._mentionStartPos;
  if (typeof startPos === 'undefined' || startPos === -1) return;
  var before = val.slice(0, startPos);
  var endPos = textarea.selectionStart;
  var after = val.slice(endPos);
  textarea.value = before + '@' + m.name + ' ' + after;
  var newPos = startPos + m.name.length + 2;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  var dd = document.getElementById('mention-dropdown');
  if (dd) dd.style.display = 'none';
  window._mentionStartPos = -1;
}// ─── Projects CRUD ────────────────────────────────────────────────────────────
