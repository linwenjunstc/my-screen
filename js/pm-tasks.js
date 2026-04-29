/* ════════════════════════════════════════════════
 * pm-tasks.js  —  任务卡片 / 增删改 / 子任务 / 依赖 / 任务日志
 * ════════════════════════════════════════════════ */

function taskCardHTML(t) {
  const di=dueInfo(t), si=statusInfo(t.status), pn=projName(t.projectId);
  const priCls=t.priority==='紧急'?'pill-red':t.priority==='重要'?'pill-amber':'pill-gray';
  const showProj = currentView!=='project-'+t.projectId;
  const blocked = isBlocked(t);
  const assigneeHTML = t.assignee ? `<div class="member-avatar" style="width:20px;height:20px;font-size:10px;background:${memberColor(t.assignee)}" title="${memberName(t.assignee)}">${memberInitial(t.assignee)}</div>` : '';
  const tagPills = (t.tags||[]).map(tid=>tagHTML(tid)).join('');
  const subProg = subtaskProgress(t);
  const recurringBadge = t.recurring&&t.recurring.enabled ? '<span class="pill pill-purple" style="font-size:10px">↻ 周期</span>' : '';
  const blockedBadge = blocked ? '<span class="dep-blocked-badge">⚠ 等待前置</span>' : '';

  return `<div class="task-card${t.done?' done':''}${blocked?' dep-blocked':''}" onclick="openEditTask('${t.id}')">
    <div class="check-wrap" onclick="event.stopPropagation();toggleDone('${t.id}')">
      <div class="check-btn${t.done?' checked':''}"></div>
    </div>
    <div class="task-body">
      <div class="task-title">${t.title}</div>
      <div class="task-meta">
        ${showProj?`<span class="pill pill-project">${pn}</span>`:''}
        <span class="pill ${di.cls}">${di.text}</span>
        <span class="pill ${priCls}">${t.priority}</span>
        <span class="pill ${si.cls}">${si.lbl}</span>
        ${tagPills}${recurringBadge}${blockedBadge}
        ${subProg}
      </div>
    </div>
    <div class="task-end" onclick="event.stopPropagation()">
      ${assigneeHTML}
      ${t.logs&&t.logs.length?`<span class="log-count">${t.logs.length}条</span>`:''}
      <button class="icon-btn" onclick="openLog('${t.id}')" title="记录跟进">+</button>
    </div>
  </div>`;
}

// ─── Toggle done ──────────────────────────────────────────────────────────────
// 修改后的样子
async function toggleDone(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    t.done = !t.done;
    t.status = t.done ? 'done' : 'todo';
    await syncTask(t);
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
    <div class="subtask-text${s.done?' done':''}">${s.title}</div>
    <button class="subtask-del" onclick="deleteSubtask('${taskId}','${s.id}')">×</button>
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
function openModal(html) {
  document.getElementById('modal-box').innerHTML=html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function onOverlayClick(e) { if(e.target===document.getElementById('modal-overlay')) closeModal(); }
function modalHeader(title) {
  return `<div class="modal-header"><span class="modal-title">${title}</span><button class="modal-close" onclick="closeModal()">×</button></div>`;
}

// ─── Add Task ─────────────────────────────────────────────────────────────────
function openAddTask() {
  const today=new Date().toISOString().slice(0,10);
  const preProj=currentView.startsWith('project-')?currentView.slice(8):'';
  const projOpts=state.projects.map(p=>`<option value="${p.id}"${p.id===preProj?' selected':''}>${p.name}</option>`).join('');
  const memberOpts=state.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');

  // Tag dropdown
  const tagSelectOpts = state.globalTags.map(tg=>`<option value="${tg.id}">${tg.name}</option>`).join('');

  openModal(`${modalHeader('新建任务')}
    <div class="modal-body">
      <div class="form-group"><label class="form-label">任务名称</label><input class="form-input" id="fi-title" placeholder="输入任务名称..." autofocus></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">所属项目</label><select class="form-select" id="fi-proj"><option value="">未分类</option>${projOpts}</select></div>
        <div class="form-group"><label class="form-label">负责人</label><select class="form-select" id="fi-assignee"><option value="">未分配</option>${memberOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">截止日期</label><input class="form-input" type="date" id="fi-due" value="${today}"></div>
        <div class="form-group"><label class="form-label">优先级</label><select class="form-select" id="fi-pri"><option>紧急</option><option selected>重要</option><option>普通</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="fi-status"><option value="todo">待启动</option><option value="doing">进行中</option><option value="waiting">待反馈</option><option value="done">已完成</option></select></div>
      </div>
      ${state.globalTags.length?`<div class="form-group"><label class="form-label">标签</label><select class="form-select" id="fi-tag"><option value="">无</option>${tagSelectOpts}</select></div>`:''}
      <div class="toggle-row">
        <div><div class="toggle-label">周期性任务</div><div class="toggle-sub">每周一自动生成新实例</div></div>
        <button class="toggle" id="fi-recurring" onclick="this.classList.toggle('on')"></button>
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
  setTimeout(()=>document.getElementById('fi-title').focus(),80);
}

// toggleAddTag removed: tags now use dropdown in add-task modal

async function submitAddTask(btn) {
  const titleEl = document.getElementById('fi-title');
  const title = titleEl ? titleEl.value.trim() : "";
  if (!title) { if(titleEl) titleEl.style.borderColor='var(--red)'; return; }
  setLoading(btn, true);
  
  // 增加安全检查，如果元素不存在则给默认值，防止报错
  const getVal = (id, def = "") => document.getElementById(id) ? document.getElementById(id).value : def;

  const newTask = {
    id: uid(),
    title: title,
    project_id: getVal('fi-proj'),
    assignee: getVal('fi-assignee', ''),
    due: getVal('fi-due', new Date().toISOString().slice(0,10)),
    priority: getVal('fi-pri', '重要'),
    status: getVal('fi-status', 'todo'),
    done: false,
    tags: [],
    subtasks: [],
    created_at: new Date().toISOString().slice(0,10)
  };

  await syncTask(newTask);
  setLoading(btn, false);
  closeModal();
  await loadState();
  toast('任务已同步至云端');
  logAction('添加任务', `新建任务「${title}」`);
}

// ─── Edit Task ────────────────────────────────────────────────────────────────
function openEditTask(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  activeTaskTab='basic';
  const projOpts=state.projects.map(p=>`<option value="${p.id}"${p.id===t.projectId?' selected':''}>${p.name}</option>`).join('');
  const memberOpts=state.members.map(m=>`<option value="${m.id}"${m.id===t.assignee?' selected':''}>${m.name}</option>`).join('');
  const logsHTML = t.logs&&t.logs.length
    ? t.logs.map(l=>`<div class="log-item"><div class="log-date">${l.date}</div><div class="log-text">${l.text}</div></div>`).join('')
    : '<div style="font-size:12px;color:var(--text3);padding:8px 0">暂无跟进记录</div>';

  // Tags
  const tagChipsHTML = state.globalTags.map(tg=>{
    const p=TAG_PALETTES[tg.paletteIdx%TAG_PALETTES.length];
    const sel=(t.tags||[]).includes(tg.id);
    return `<span class="tag-chip${sel?' selected':''}" id="edittag-${tg.id}" data-tagid="${tg.id}" onclick="toggleEditTag('${id}','${tg.id}')" style="background:${p.bg};color:${p.color};border-color:${p.border}">${tg.name}</span>`;
  }).join('');

  // Subtasks
  const subtaskHTML = buildSubtaskListHTML(t.subtasks||[], id);

  // Dependencies (other tasks, excluding self and done ones)
  const otherTasks = state.tasks.filter(x=>x.id!==id&&!x.done);
  const depListHTML = otherTasks.length ? otherTasks.map(x=>`<div class="dep-item">
    <input type="checkbox" ${(t.dependencies||[]).includes(x.id)?'checked':''} onchange="toggleDep('${id}','${x.id}',this.checked)">
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x.title}">${x.title}</span>
    <span class="pill pill-gray" style="font-size:10px;flex-shrink:0">${projName(x.projectId)}</span>
  </div>`).join('') : '<div style="font-size:12px;color:var(--text3);padding:10px 12px">没有其他进行中的任务</div>';

  const recurringOn = t.recurring&&t.recurring.enabled;

  openModal(`${modalHeader('编辑任务')}
    <div class="modal-tabs">
      <button class="modal-tab active" id="tab-basic" onclick="switchTaskTab('basic','${id}')">基本信息</button>
      <button class="modal-tab" id="tab-sub" onclick="switchTaskTab('sub','${id}')">子任务 ${t.subtasks&&t.subtasks.length?`(${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length})`:''}</button>
      <button class="modal-tab" id="tab-dep" onclick="switchTaskTab('dep','${id}')">依赖 ${t.dependencies&&t.dependencies.length?`(${t.dependencies.length})`:''}</button>
      <button class="modal-tab" id="tab-log" onclick="switchTaskTab('log','${id}')">记录 ${t.logs&&t.logs.length?`(${t.logs.length})`:''}</button>
    </div>

    <div class="modal-body" id="task-tab-content">
      <div id="tab-pane-basic">
        <div class="form-group"><label class="form-label">任务名称</label><input class="form-input" id="fi-title" value="${t.title.replace(/"/g,'&quot;')}"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">所属项目</label><select class="form-select" id="fi-proj"><option value="">未分类</option>${projOpts}</select></div>
          <div class="form-group"><label class="form-label">负责人</label><select class="form-select" id="fi-assignee"><option value="">未分配</option>${memberOpts}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">截止日期</label><input class="form-input" type="date" id="fi-due" value="${t.due}"></div>
          <div class="form-group"><label class="form-label">优先级</label><select class="form-select" id="fi-pri"><option${t.priority==='紧急'?' selected':''}>紧急</option><option${t.priority==='重要'?' selected':''}>重要</option><option${t.priority==='普通'?' selected':''}>普通</option></select></div>
        </div>
        <div class="form-group"><label class="form-label">状态</label><select class="form-select" id="fi-status"><option value="todo"${t.status==='todo'?' selected':''}>待启动</option><option value="doing"${t.status==='doing'?' selected':''}>进行中</option><option value="waiting"${t.status==='waiting'?' selected':''}>待反馈</option><option value="done"${t.status==='done'?' selected':''}>已完成</option></select></div>
        ${state.globalTags.length?`<div class="form-group"><label class="form-label">标签</label><div class="tag-list">${tagChipsHTML}</div></div>`:''}
        <div class="toggle-row">
          <div><div class="toggle-label">周期性任务</div><div class="toggle-sub">每周一自动生成新实例</div></div>
          <button class="toggle${recurringOn?' on':''}" id="fi-recurring" onclick="this.classList.toggle('on')"></button>
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
    </div>

    <div class="modal-footer">
      <button class="btn btn-danger" onclick="confirmDeleteTask('${t.id}')">删除任务</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitEditTask('${t.id}', this)">保存</button>
      </div>
    </div>`);
}

function switchTaskTab(tab, taskId) {
  ['basic','sub','dep','log'].forEach(t => {
    const btn=document.getElementById('tab-'+t);
    const pane=document.getElementById('tab-pane-'+t);
    if (btn) btn.classList.toggle('active', t===tab);
    if (pane) pane.style.display = t===tab?'block':'none';
  });
  activeTaskTab = tab;
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

  // 更新本地对象数据
  t.title = title;
  t.project_id = document.getElementById('fi-proj').value;
  t.assignee = document.getElementById('fi-assignee').value;
  t.due = document.getElementById('fi-due').value;
  t.priority = document.getElementById('fi-pri').value;
  t.status = document.getElementById('fi-status').value;
  t.done = t.status === 'done';

  await syncTask(t);
  setLoading(btn, false);
  closeModal();
  render();
  toast('更改已同步至云端');
  logAction('编辑任务', `更新任务「${t.title}」`);
}

async function confirmDeleteTask(id) {
  if (!confirm('确认删除这个任务？该操作无法撤销')) return;
  const t = state.tasks.find(x => x.id === id);
  const title = t ? t.title : id;
  const success = await deleteFromCloud('tasks', id);
  if (success) {
    state.tasks = state.tasks.filter(x => x.id !== id);
    closeModal();
    render();
    toast('任务已永久删除');
    logAction('删除任务', `删除任务「${title}」`);
  }
}
// ─── Log ──────────────────────────────────────────────────────────────────────
function openLog(id) {
  const t=state.tasks.find(x=>x.id===id); if(!t) return;
  openModal(`${modalHeader('记录跟进')}
    <div class="modal-body">
      <div style="font-size:13px;color:var(--text2);padding:8px 12px;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:16px">${t.title}</div>
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
  t.logs.unshift({date:new Date().toISOString().slice(0,10),text});
  if(status) { t.status=status; t.done=status==='done'; }
  saveState(); closeModal(); render(); toast('跟进已记录');
}

// ─── Projects CRUD ────────────────────────────────────────────────────────────
