/* ════════════════════════════════════════════════
 * pm-projects.js  —  项目 CRUD
 * ════════════════════════════════════════════════ */

function openAddProject() {
  // 与编辑项目保持一致：动态维护 _newProjMembers 数组
  window._newProjMembers = [];
  window._newProjColor   = 0;

  function buildNewProjMemberListHTML() {
    if (!window._newProjMembers.length) return '<div style="font-size:12px;color:var(--text3)">暂无成员</div>';
    return window._newProjMembers.map(mid => {
      const m = state.members.find(x => x.id === mid);
      if (!m) return '';
      return `<div class="subtask-item" style="display:flex;align-items:center;gap:8px;background:var(--surface2);padding:5px 10px;border-radius:6px;margin-bottom:5px">
        <div class="member-avatar" style="background:${memberColor(m.id)};width:20px;height:20px;font-size:10px">${memberInitial(m.id)}</div>
        <div style="flex:1">${escHtml(m.name)}</div>
        <button class="subtask-del" onclick="removeNewProjMember('${m.id}')"><i data-lucide="x"></i></button>
      </div>`;
    }).join('');
  }
  window._buildNewProjMemberListHTML = buildNewProjMemberListHTML;

  const availOptions = state.members.map(m => `<option value="${m.id}">${escHtml(m.name)}</option>`).join('');

  openModal(`${modalHeader('新建项目')}
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">项目名称 <span style="color:var(--red)">*</span></label>
        <input class="form-input" id="fi-pname" placeholder="输入项目名称...">
      </div>
      <div class="form-group">
        <label class="form-label">颜色标识</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${PROJ_COLORS.map((col,i)=>`<div onclick="selectProjColor(${i},'new')" id="pcolor-${i}" style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${i===0?'var(--text)':'transparent'};transition:border .15s"></div>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">项目状态</label>
          <select class="form-select" id="fi-proj-status">
            <option value="active">进行中</option>
            <option value="on_hold">已暂停</option>
            <option value="completed">已完成</option>
            <option value="archived">已归档</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">截止日期</label>
          <input class="form-input" type="date" id="fi-proj-deadline">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">项目成员 <span style="color:var(--red)">*</span></label>
        <div id="new-proj-member-list" style="margin-bottom:10px">${buildNewProjMemberListHTML()}</div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="new-proj-member-sel" style="flex:1">
            <option value="">选择成员...</option>
            ${availOptions}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="addNewProjMember()" style="white-space:nowrap">添加</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="submitAddProject(this)">创建</button>
      </div>
    </div>`);
  setTimeout(() => document.getElementById('fi-pname').focus(), 80);
}

function addNewProjMember() {
  const sel = document.getElementById('new-proj-member-sel');
  if (!sel || !sel.value) return;
  if (!window._newProjMembers.includes(sel.value)) {
    window._newProjMembers.push(sel.value);
    sel.value = '';
    const listEl = document.getElementById('new-proj-member-list');
    if (listEl && window._buildNewProjMemberListHTML) {
      listEl.innerHTML = window._buildNewProjMemberListHTML();
    }
  }
}

function removeNewProjMember(mid) {
  window._newProjMembers = (window._newProjMembers || []).filter(x => x !== mid);
  const listEl = document.getElementById('new-proj-member-list');
  if (listEl && window._buildNewProjMemberListHTML) {
    listEl.innerHTML = window._buildNewProjMemberListHTML();
  }
}

function selectProjColor(idx, mode) {
  const prefix = mode === 'edit' ? 'epcolor-' : 'pcolor-';
  PROJ_COLORS.forEach((_,i) => {
    const el = document.getElementById(prefix + i);
    if (el) el.style.border = i === idx ? '3px solid var(--text)' : '3px solid transparent';
  });
  if (mode === 'edit') window._editProjColor = idx;
  else window._newProjColor = idx;
}

async function submitAddProject(btn) {
  const name = document.getElementById('fi-pname').value.trim();
  let hasError = false;
  if (!name) { document.getElementById('fi-pname').style.borderColor='var(--red)'; hasError = true; }

  const members = window._newProjMembers || [];
  if (!members.length) {
    const listEl = document.getElementById('new-proj-member-list');
    if (listEl) listEl.style.border = '2px dashed var(--red)';
    hasError = true;
  }

  if (hasError) return;
  setLoading(btn, true);
  const p = {
    id: uid(), name,
    members: window._newProjMembers || [],
    colorIdx: window._newProjColor || 0,
    status:   document.getElementById('fi-proj-status')?.value  || 'active',
    deadline: document.getElementById('fi-proj-deadline')?.value || null
  };
  await syncProject(p);
  state.projects.push(p);
  setLoading(btn, false);
  closeModal();
  switchView('project-' + p.id);
  toast('项目已创建并同步', 'success');
  logAction('添加项目', `新建项目「${name}」`);
}

function openEditProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;

  // 1. 获取已加入的成员 HTML
  const joinedMembersHTML = (p.members || []).map(mid => {
    const m = state.members.find(x => x.id === mid);
    if (!m) return '';
    return `<div class="subtask-item" style="display:flex; align-items:center; gap:8px; background:var(--surface2); padding:5px 10px; border-radius:6px; margin-bottom:5px;">
      <div class="member-avatar" style="background:${memberColor(m.id)}; width:20px; height:20px; font-size:10px;">${memberInitial(m.id)}</div>
      <div style="flex:1">${escHtml(m.name)}</div>
      <button class="subtask-del" onclick="removeMemberFromProject('${id}','${m.id}')"><i data-lucide="x"></i></button>
    </div>`;
  }).join('');

  // 2. 获取还未加入的成员（用于下拉框）
  const availableMembers = state.members.filter(m => !(p.members || []).includes(m.id));
  const memberOptions = availableMembers.map(m => `<option value="${m.id}">${escHtml(m.name)}</option>`).join('');

  // 3. 构建弹窗 HTML
  const curColorIdx = p.colorIdx || 0;
  window._editProjColor = curColorIdx;
  const allMemberOptions = state.members.map(m =>
    `<option value="${m.id}">${escHtml(m.name)}</option>`
  ).join('');

  openModal(`${modalHeader('编辑项目')}
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">项目名称 <span style="color:var(--red)">*</span></label>
        <input class="form-input" id="fi-pname" value="${p.name}">
      </div>
      <div class="form-group">
        <label class="form-label">颜色标识</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${PROJ_COLORS.map((col,i)=>`<div onclick="selectProjColor(${i},'edit')" id="epcolor-${i}" style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${i===curColorIdx?'var(--text)':'transparent'};transition:border .15s" title="${col}"></div>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">项目状态</label>
          <select class="form-select" id="fi-proj-status">
            <option value="active"${p.status==='active'?' selected':''}>进行中</option>
            <option value="on_hold"${p.status==='on_hold'?' selected':''}>已暂停</option>
            <option value="completed"${p.status==='completed'?' selected':''}>已完成</option>
            <option value="archived"${p.status==='archived'?' selected':''}>已归档</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">截止日期</label>
          <input class="form-input" type="date" id="fi-proj-deadline" value="${p.deadline||''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">项目成员 <span style="color:var(--red)">*</span></label>
        <div id="proj-member-list" style="margin-bottom:10px">${joinedMembersHTML || '<div style="font-size:12px;color:var(--text3)">暂无成员</div>'}</div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="proj-add-member-sel" style="flex:1">
            <option value="">添加成员...</option>
            ${memberOptions}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="addMemberToProject('${id}')" style="white-space:nowrap">添加</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="confirmDeleteProject('${p.id}')">删除项目</button>
      <button class="btn btn-primary" onclick="submitEditProject('${p.id}')">保存修改</button>
    </div>`);
}

// 添加项目成员
// 添加项目成员
async function addMemberToProject(projId) {
  const sel = document.getElementById('proj-add-member-sel'); 
  if (!sel || !sel.value) return;
  const p = state.projects.find(x => x.id === projId); 
  if (!p) return;
  
  if (!p.members) p.members = [];
  if (!p.members.includes(sel.value)) {
    p.members.push(sel.value);
    // 【关键】调用云端同步函数
    await syncProject(p); 
    // 重新打开弹窗以刷新显示
    openEditProject(projId); 
    toast('成员已加入项目并同步', 'success');
  }
}

// 移除项目成员
async function removeMemberFromProject(projId, memberId) {
  const p = state.projects.find(x => x.id === projId);
  if (!p) return;

  p.members = p.members.filter(x => x !== memberId);
  // 【关键】同步修改到云端
  await syncProject(p);
  _lastLoadTime = Date.now();
  // 刷新弹窗内成员列表，不重新 openModal
  var listEl = document.getElementById('proj-member-list');
  if (listEl) {
    var joinedHTML = (p.members || []).map(function(mid) {
      var m = state.members.find(function(x) { return x.id === mid; });
      if (!m) return '';
      return '<div class="subtask-item" style="display:flex; align-items:center; gap:8px; background:var(--surface2); padding:5px 10px; border-radius:6px; margin-bottom:5px;">' +
        '<div class="member-avatar" style="background:' + memberColor(m.id) + '; width:20px; height:20px; font-size:10px;">' + memberInitial(m.id) + '</div>' +
        '<div style="flex:1">' + escHtml(m.name) + '</div>' +
        '<button class="subtask-del" onclick="removeMemberFromProject(\'' + projId + '\',\'' + m.id + '\')"><i data-lucide="x"></i></button>' +
        '</div>';
    }).join('');
    listEl.innerHTML = joinedHTML || '<div style="font-size:12px;color:var(--text3)">暂无成员</div>';
    if (window.lucide) lucide.createIcons();
    // 更新下拉框中的可选成员
    var availMembers = state.members.filter(function(m) { return !(p.members || []).includes(m.id); });
    var sel = document.getElementById('proj-add-member-sel');
    if (sel) {
      sel.innerHTML = '<option value="">添加成员...</option>' +
        availMembers.map(function(m) { return '<option value="' + m.id + '">' + escHtml(m.name) + '</option>'; }).join('');
    }
  }
  toast('成员已移除', 'success');
}


// 提交项目编辑
async function submitEditProject(id) {
  const p = state.projects.find(x => x.id === id); 
  if (!p) return;
  const name = document.getElementById('fi-pname').value.trim(); 
  if (!name) return;

  p.name = name;
  p.colorIdx = window._editProjColor !== undefined ? window._editProjColor : (p.colorIdx || 0);
  p.status   = document.getElementById('fi-proj-status')?.value  || 'active';
  p.deadline = document.getElementById('fi-proj-deadline')?.value || null;
  await syncProject(p);
  closeModal();
  _lastLoadTime = Date.now();
  render();
  toast('项目更新成功', 'success');
  logAction('编辑项目', `更新项目「${name}」`);
}

async function confirmDeleteProject(id) {
  var p = state.projects.find(function(x) { return x.id === id; });
  if (!p) return;
  var pName = p.name;
  var taskCount = state.tasks.filter(function(t) { return t.project_id === id; }).length;
  if (taskCount > 0) {
    toast('该项目下还有 ' + taskCount + ' 个任务，请先将任务移出后再删除项目', 'warning');
    return;
  }
  showConfirm('删除项目', '确认删除项目「' + pName + '」？', async function() {
    var success = await deleteFromCloud('projects', id);
    if (success) {
      state.projects = state.projects.filter(function(p) { return p.id !== id; });
      closeModal();
      _lastLoadTime = Date.now();
      switchView('today');
      toast('项目已删除', 'success');
      logAction('删除项目', '删除项目「' + pName + '」');
    }
  }, {danger: true, confirmLabel: '删除'});
}


// ─── V20 模块管理 ─────────────────────────────────────────────────────
window.openAddModule = function(projectId) {
  if (!isAdmin() && !getEffectiveMenuPerms().includes('add_task')) {
    toast('权限不足', 'error'); return;
  }
  openModal(modalHeader('新建模块') +
    '<div class="modal-body">' +
      '<div class="form-group">' +
        '<label class="form-label">模块名称 <span style="color:var(--red)">*</span></label>' +
        '<input class="form-input" id="mod-name" placeholder="例如：设计阶段、开发阶段...">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">模块描述（可选）</label>' +
        '<textarea class="form-input" id="mod-desc" rows="2" placeholder="简要描述本模块的工作内容"></textarea>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<div></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
        '<button class="btn btn-primary" onclick="submitAddModule(this,\'' + projectId + '\')">创建</button>' +
      '</div>' +
    '</div>'
  );
  setTimeout(function() { var el = document.getElementById('mod-name'); if (el) el.focus(); }, 80);
};

window.submitAddModule = async function(btn, projectId) {
  var name = (document.getElementById('mod-name').value || '').trim();
  if (!name) { document.getElementById('mod-name').style.borderColor = 'var(--red)'; return; }
  var desc = (document.getElementById('mod-desc') || {}).value || '';
  var existing = state.modules.filter(function(m) { return m.projectId === projectId; });
  var maxOrder = existing.reduce(function(acc, m) { return Math.max(acc, m.sortOrder || 0); }, -1);
  var mod = {
    id: uid(), projectId: projectId, project_id: projectId,
    name: name, description: desc, sortOrder: maxOrder + 1, sort_order: maxOrder + 1
  };
  setLoading(btn, true);
  var ok = await syncModule(mod);
  if (!ok) { setLoading(btn, false); return; }
  state.modules.push(mod);
  setLoading(btn, false);
  closeModal();
  render();
  toast('模块已创建', 'success');
  var proj = state.projects.find(function(p) { return p.id === projectId; });
  logAction('添加模块', '新建模块「' + name + '」，项目「' + (proj ? proj.name : projectId) + '」');
};

window.openEditModule = function(moduleId) {
  var mod = state.modules.find(function(m) { return m.id === moduleId; });
  if (!mod) return;
  var canDelete = isAdmin();
  var taskCount = state.tasks.filter(function(t) { return t.moduleId === moduleId; }).length;
  openModal(modalHeader('编辑模块') +
    '<div class="modal-body">' +
      '<div class="form-group">' +
        '<label class="form-label">模块名称 <span style="color:var(--red)">*</span></label>' +
        '<input class="form-input" id="mod-name" value="' + escHtml(mod.name) + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">模块描述</label>' +
        '<textarea class="form-input" id="mod-desc" rows="2">' + escHtml(mod.description || '') + '</textarea>' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      (canDelete ? '<button class="btn btn-danger" onclick="confirmDeleteModule(\'' + moduleId + '\')">删除模块</button>' : '<div></div>') +
      '<button class="btn btn-primary" onclick="submitEditModule(\'' + moduleId + '\')">保存修改</button>' +
    '</div>'
  );
};

window.submitEditModule = async function(moduleId) {
  var mod = state.modules.find(function(m) { return m.id === moduleId; });
  if (!mod) return;
  var name = (document.getElementById('mod-name').value || '').trim();
  if (!name) { document.getElementById('mod-name').style.borderColor = 'var(--red)'; return; }
  mod.name = name;
  mod.description = (document.getElementById('mod-desc') || {}).value || '';
  var ok = await syncModule(mod);
  if (!ok) return;
  closeModal(); render();
  toast('模块已更新', 'success');
  logAction('编辑模块', '更新模块「' + name + '」');
};

window.confirmDeleteModule = async function(moduleId) {
  var mod = state.modules.find(function(m) { return m.id === moduleId; });
  if (!mod) return;
  var taskCount = state.tasks.filter(function(t) { return t.moduleId === moduleId; }).length;
  if (taskCount > 0) {
    toast('该模块下还有 ' + taskCount + ' 个任务，请先将任务移出后再删除模块', 'warning');
    return;
  }
  showConfirm('删除模块', '确认删除模块「' + mod.name + '」？', async function() {
    var success = await deleteFromCloud('modules', moduleId);
    if (success) {
      state.modules = state.modules.filter(function(m) { return m.id !== moduleId; });
      closeModal(); render();
      toast('模块已删除', 'success');
      logAction('删除模块', '删除模块「' + mod.name + '」');
    }
  }, { danger: true, confirmLabel: '删除' });
};