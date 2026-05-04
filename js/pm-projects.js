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
        <label class="form-label">项目名称</label>
        <input class="form-input" id="fi-pname" placeholder="输入项目名称...">
      </div>
      <div class="form-group">
        <label class="form-label">颜色标识</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${PROJ_COLORS.map((col,i)=>`<div onclick="selectProjColor(${i},'new')" id="pcolor-${i}" style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${i===0?'var(--text)':'transparent'};transition:border .15s"></div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">项目成员</label>
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
  if (!name) return;
  setLoading(btn, true);
  const p = {
    id: uid(), name,
    members: window._newProjMembers || [],
    colorIdx: window._newProjColor || 0
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
        <label class="form-label">项目名称</label>
        <input class="form-input" id="fi-pname" value="${p.name}">
      </div>
      <div class="form-group">
        <label class="form-label">颜色标识</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${PROJ_COLORS.map((col,i)=>`<div onclick="selectProjColor(${i},'edit')" id="epcolor-${i}" style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;border:3px solid ${i===curColorIdx?'var(--text)':'transparent'};transition:border .15s" title="${col}"></div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">项目成员</label>
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
  openEditProject(projId); 
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
  await syncProject(p);
  closeModal();
  render();
  toast('项目更新成功', 'success');
  logAction('编辑项目', `更新项目「${name}」`);
}

async function confirmDeleteProject(id) {
  showConfirm('删除项目', '删除项目后，所属任务将变为未分类。确认删除？', async function() {
    const success = await deleteFromCloud('projects', id);
    if (success) {
      state.tasks.forEach(t => { if (t.project_id === id) t.project_id = ''; });
      state.projects = state.projects.filter(p => p.id !== id);
      const pName = state.projects.find(x => x.id === id)?.name || id;
      closeModal();
      switchView('today');
      toast('项目已删除', 'success');
      logAction('删除项目', `删除项目「${pName}」`);
    }
  }, {danger: true, confirmLabel: '删除'});
}
