/* ════════════════════════════════════════════════
 * pm-members.js  —  成员管理 / 标签管理 / 角色管理 / 菜单权限
 * ════════════════════════════════════════════════ */

// ─── Members management ───────────────────────────────────────────────────────
// ─── Members management (协作版：支持密码维护) ────────────────────────────────

// 打开成员管理弹窗
function openMembersModal() {
  const _isAdminUser = isAdmin();
  openModal(`${modalHeader('成员管理')}
    <div class="modal-body">
      <div id="members-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 20px;">
        ${buildMembersListHTML()}
      </div>
      ${_isAdminUser ? `
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">添加新协作成员</label>
        <input class="form-input" id="new-member-name" placeholder="设置账号名（姓名）" style="margin-bottom: 8px;">
        <input class="form-input" id="new-member-pass" type="password" placeholder="设置登录密码">
        <div class="form-hint" style="margin: 8px 0;">成员将使用此账号名和密码登录，角色默认为普通用户。</div>
        <button class="btn btn-primary" id="members-modal-add-btn" style="width: 100%; margin-top: 5px;" onclick="submitAddMember()">+ 确认添加成员</button>
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <div></div>
      <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
    </div>`);
}

// 构造成员列表 HTML
function buildMembersListHTML() {
  if (!state.members.length) return '<div style="font-size:13px;color:var(--text3);padding:15px 0;text-align:center;">暂无协作成员</div>';
  
  return state.members.map(m => {
    const taskCnt = state.tasks.filter(t => t.assignee === m.id).length;
    const isMe = currentUser && currentUser.id === m.id; // 标记当前登录的自己
    
    return `<div class="subtask-item" style="display: flex; align-items: center; padding: 10px; background: var(--surface2); border-radius: 8px; margin-bottom: 6px;">
      <div class="member-avatar" style="background:${MEMBER_COLORS[m.colorIdx % MEMBER_COLORS.length]}; width: 32px; height: 32px; font-size: 14px;">
        ${m.name.slice(0, 1)}
      </div>
      <div style="flex: 1; margin-left: 12px;">
        <div style="font-size: 14px; font-weight: 600; color: var(--text);">
          ${escHtml(m.name)} ${isMe ? '<span style="font-size:10px; color:var(--green); font-weight:400;">(你)</span>' : ''}
        </div>
        <div style="font-size: 11px; color: var(--text3);">密码: •••••• | 负责任务: ${taskCnt}</div>
      </div>
      <button onclick="deleteMember('${m.id}')" 
              style="border:none; background:transparent; cursor:pointer; color:var(--text3); font-size:18px; padding: 0 10px;"
              title="移除成员"><i data-lucide="x"></i></button>
    </div>`;
  }).join('');
}

// 提交添加成员（包含密码同步到云端）
async function submitAddMember() {
  const nameInp = document.getElementById('new-member-name');
  const passInp = document.getElementById('new-member-pass');
  const name = nameInp.value.trim();
  const pass = passInp.value.trim();

  if (!name || !pass) {
    toast("姓名和密码不能为空");
    return;
  }

  // 查重：防止添加同名账号
  if (state.members.some(m => m.name === name)) {
    toast("该姓名已存在，请更换");
    return;
  }

  const newMember = {
    id: uid(),
    name: name,
    password: md5(pass), // MD5 哈希存储
    colorIdx: state.members.length % MEMBER_COLORS.length
  };

  // 1. 同步到 Supabase (对应 SQL 里的 color_idx)
  const addBtn = document.querySelector('#members-modal-add-btn');
  setLoading(addBtn, true);
  const { error } = await sb.from('members').upsert({
    id: newMember.id,
    name: newMember.name,
    password: newMember.password,
    color_idx: newMember.colorIdx,
    role: 'user'
  });
  setLoading(addBtn, false);

  if (error) {
    console.error(error);
    toast('成员同步失败，请检查数据库权限', 'error');
  } else {
    state.members.push(newMember);
    nameInp.value = '';
    passInp.value = '';
    const listEl = document.getElementById('members-list');
    if (listEl) listEl.innerHTML = buildMembersListHTML();
    toast('成员已成功加入云端');
    logAction('添加成员', `新增成员「${newMember.name}」`);
  }
}

// 移除成员
async function deleteMember(id) {
  const m = state.members.find(x => x.id === id);
  if (!m) return;
  
  // 安全检查：如果成员还有任务，不建议直接删除
  const taskCnt = state.tasks.filter(t => t.assignee === id).length;
  if (taskCnt > 0) {
    toast(`无法删除：${m.name} 还有 ${taskCnt} 个任务未处理`, 'warning');
    return;
  }

  showConfirm('移除成员', `确定要从协作团队中移除「${m.name}」吗？该成员将无法再登录。`, async function() {
    const { error } = await sb.from('members').delete().eq('id', id);
    if (error) {
      toast('删除失败', 'error');
    } else {
      state.members = state.members.filter(x => x.id !== id);
      const listEl = document.getElementById('members-list');
      if (listEl) listEl.innerHTML = buildMembersListHTML();
      toast('成员已移除', 'success');
      logAction('删除成员', `移除成员「${m.name}」`);
    }
  }, {danger: true, confirmLabel: '移除'});
}

function buildMembersListHTML() {
  if (!state.members.length) return '<div style="font-size:13px;color:var(--text3);padding:8px 0">暂无成员</div>';
  const _isAdminUser = isAdmin();
  return state.members.map(m=>{
    const taskCnt = state.tasks.filter(t=>t.assignee===m.id).length;
    const hasTask = taskCnt > 0;
    const isMe = currentUser && m.id === currentUser.id;
    const role = m.role || 'user';
    const roleHTML = `<span class="role-badge role-${role}" style="margin-right:4px">${ROLE_LABELS[role] || role}</span>`;
    const delBtn = !_isAdminUser ? '' : (hasTask
      ? `<button title="请先删除或转移该成员的 ${taskCnt} 个任务" style="width:20px;height:20px;border:none;background:transparent;cursor:not-allowed;color:var(--border2);font-size:14px;display:flex;align-items:center;justify-content:center;border-radius:3px;flex-shrink:0" disabled>×</button>`
      : `<button onclick="deleteMember('${m.id}')" title="删除成员" style="width:20px;height:20px;border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:14px;display:flex;align-items:center;justify-content:center;border-radius:3px;flex-shrink:0;transition:color .15s" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text3)'"><i data-lucide="x"></i></button>`);
    return `<div class="subtask-item" style="${hasTask?'border-left:2px solid var(--border2);':''}">
      <div class="member-avatar" style="background:${MEMBER_COLORS[m.colorIdx%MEMBER_COLORS.length]}">${m.name.slice(0,1)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${escHtml(m.name)}
          ${isMe ? '<span style="font-size:10px;color:var(--green)">(你)</span>' : ''}
        </div>
        <div style="margin-top:3px;display:flex;align-items:center;gap:4px">
          ${roleHTML}
          <span style="font-size:11px;color:var(--text3)">${taskCnt} 个任务</span>
        </div>
      </div>
      ${delBtn}
    </div>`;
  }).join('');
}

async function submitAddTag(btn) {
  const inp = document.getElementById('new-tag-name');
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) return;
  setLoading(btn, true);
  const newTag = { id: uid(), name, paletteIdx: state.globalTags.length % TAG_PALETTES.length };
  await syncTag(newTag);
  state.globalTags.push(newTag);
  setLoading(btn, false);
  inp.value = '';
  document.getElementById('tags-list').innerHTML = buildTagsListHTML();
  toast('标签已添加');
  logAction('添加标签', `新建标签「${name}」`);
}

// ─── Tags management ──────────────────────────────────────────────────────────

function openTagsModal() {
  openModal(`${modalHeader('标签管理')}
    <div class="modal-body">
      <div id="tags-list" style="max-height:320px;overflow-y:auto;margin-bottom:16px">
        ${buildTagsListHTML()}
      </div>
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">新建标签</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="new-tag-name" placeholder="输入标签名称" onkeydown="if(event.key==='Enter')submitAddTag()">
          <button class="btn btn-primary" onclick="submitAddTag(this)" style="white-space:nowrap;flex-shrink:0">+ 添加</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <div></div>
      <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
    </div>`);
}

function buildTagsListHTML() {
  if (!state.globalTags.length) return '<div style="font-size:13px;color:var(--text3);padding:8px 0">暂无标签，请在下方添加</div>';
  return state.globalTags.map(tg => {
    const p = TAG_PALETTES[tg.paletteIdx % TAG_PALETTES.length];
    const usedCount = state.tasks.filter(t => t.tags && t.tags.includes(tg.id)).length;
    return `<div id="tag-row-${tg.id}" class="subtask-item" style="gap:10px">
      <span style="width:10px;height:10px;border-radius:50%;background:${p.dot};flex-shrink:0;margin-top:2px"></span>
      <div style="flex:1;min-width:0">
        <div id="tag-label-${tg.id}" style="font-size:13px;font-weight:500">${escHtml(tg.name)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">使用中：${usedCount} 个任务</div>
      </div>
      <button onclick="startEditTag('${tg.id}')" title="重命名" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:13px;padding:4px 6px;border-radius:4px;transition:color .15s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text3)'">✎</button>
      <button onclick="deleteTag('${tg.id}')" title="删除标签" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:14px;padding:4px 6px;border-radius:4px;transition:color .15s" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text3)'"><i data-lucide="x"></i></button>
    </div>`;
  }).join('');
}

function startEditTag(id) {
  const tg = state.globalTags.find(x => x.id === id);
  if (!tg) return;
  const labelEl = document.getElementById('tag-label-' + id);
  if (!labelEl) return;
  labelEl.innerHTML = `<input id="tag-edit-inp-${id}" value="${tg.name}" style="width:100%;padding:3px 6px;border:1px solid var(--border-glow);border-radius:4px;font-size:13px;outline:none;background:var(--surface2)" onkeydown="if(event.key==='Enter')confirmEditTag('${id}');if(event.key==='Escape')cancelEditTag('${id}','${tg.name}')">
  <div style="display:flex;gap:6px;margin-top:5px">
    <button onclick="confirmEditTag('${id}')" class="btn btn-primary" style="font-size:11px;padding:3px 10px">确认</button>
    <button onclick="cancelEditTag('${id}','${tg.name}')" class="btn btn-ghost" style="font-size:11px;padding:3px 8px">取消</button>
  </div>`;
  setTimeout(() => {
    const inp = document.getElementById('tag-edit-inp-' + id);
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

function cancelEditTag(id, origName) {
  const labelEl = document.getElementById('tag-label-' + id);
  if (labelEl) labelEl.innerHTML = origName;
}

async function confirmEditTag(id) {
  const inp = document.getElementById('tag-edit-inp-' + id);
  if (!inp) return;
  const newName = inp.value.trim();
  if (!newName) return;
  const tg = state.globalTags.find(x => x.id === id);
  if (!tg) return;
  tg.name = newName;
  await syncTag(tg);
  document.getElementById('tags-list').innerHTML = buildTagsListHTML();
  toast('标签已更新');
  logAction('编辑标签', `标签重命名为「${newName}」`);
}

async function deleteTag(id) {
  const tg = state.globalTags.find(x => x.id === id);
  if (!tg) return;
  const usedCount = state.tasks.filter(t => t.tags && t.tags.includes(id)).length;
  const msg = usedCount > 0
    ? `标签「${tg.name}」被 ${usedCount} 个任务使用，删除后这些任务将失去该标签。确认删除？`
    : `确认删除标签「${tg.name}」？`;
  showConfirm('删除标签', msg, async function() {
    const { error } = await sb.from('tags').delete().eq('id', id);
    if (error) { toast('删除失败', 'error'); return; }
    state.globalTags = state.globalTags.filter(t => t.id !== id);
    state.tasks.forEach(t => { if (t.tags) t.tags = t.tags.filter(x => x !== id); });
    document.getElementById('tags-list').innerHTML = buildTagsListHTML();
    toast('标签已删除', 'success');
    logAction('删除标签', `删除标签「${tg.name}」`);
  }, {danger: true, confirmLabel: '删除'});
}

// ─── Role Management (Admin only) ────────────────────────────────────────────

function openRoleManageModal() {
  if (!isAdmin()) { toast('无权限'); return; }
  openModal(`${modalHeader('角色权限管理')}
    <div class="modal-body" style="padding-bottom:0">
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);line-height:1.6">
        <strong>权限层级：</strong>超级管理员 &gt; 管理员 &gt; 普通用户<br>
        只能修改比自己级别低的成员角色，并为其配置可见菜单。
      </div>
      <div id="role-manage-list">${buildRoleManageListHTML()}</div>
    </div>
    <div class="modal-footer">
      <div></div>
      <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
    </div>`);
}

function buildRoleManageListHTML() {
  const myLevel = getRoleLevel(currentUser?.role || 'user');
  return state.members.map(m => {
    const isMe = currentUser && m.id === currentUser.id;
    const role = m.role || 'user';
    const targetLevel = getRoleLevel(role);
    const canEdit = !isMe && myLevel > targetLevel;

    // 可以升级到哪些角色
    const roleOptions = Object.entries(ROLE_LEVELS)
      .filter(([r]) => getRoleLevel(r) < myLevel)  // 只能设置比自己低的
      .sort((a, b) => b[1] - a[1])
      .map(([r]) => `<option value="${r}" ${role===r?'selected':''}>${ROLE_LABELS[r]}</option>`)
      .join('');

    return `<div class="subtask-item" style="align-items:flex-start;gap:10px;padding:10px">
      <div class="member-avatar" style="width:32px;height:32px;font-size:13px;background:${MEMBER_COLORS[m.colorIdx % MEMBER_COLORS.length]};flex-shrink:0;margin-top:2px">${m.name.slice(0,1)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:13px;font-weight:500">${escHtml(m.name)}</span>
          ${isMe ? '<span style="font-size:10px;color:var(--green)">(你)</span>' : ''}
          <span class="role-badge role-${role}">${ROLE_LABELS[role] || role}</span>
        </div>
        ${canEdit ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
          <select class="form-select" id="role-sel-${m.id}" style="font-size:12px;padding:4px 8px;height:28px;width:120px">
            ${roleOptions}
          </select>
          <button onclick="applyRoleChange('${m.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;height:28px;padding:0 10px">应用角色</button>
          <button onclick="openMenuPermsModal('${m.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;height:28px;padding:0 10px;color:var(--blue);border-color:var(--blue-border)"><i data-lucide="settings" style="width:12px;height:12px;margin-right:3px"></i>菜单权限</button>
          <button onclick="adminResetPassword('${m.id}','${m.name}')" class="btn btn-ghost btn-sm" style="font-size:11px;height:28px;padding:0 10px;color:var(--amber);border-color:var(--amber-border)"><i data-lucide="key" style="width:12px;height:12px;margin-right:3px"></i>重置密码</button>
        </div>` : `<div style="font-size:11px;color:var(--text3);margin-top:4px">
          ${isMe ? '当前登录账号' : '无权限修改此成员'}</div>`}
      </div>
    </div>`;
  }).join('');
}

async function applyRoleChange(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  const sel = document.getElementById('role-sel-' + memberId);
  if (!sel) return;
  const newRole = sel.value;
  if (newRole === m.role) return;

  // 权限检查
  if (!canManageRole(currentUser.role, newRole)) {
    toast('无权限设置此角色', 'warning'); return;
  }

  const { error } = await sb.from('members').update({ role: newRole }).eq('id', memberId);
  if (error) { toast('更新失败：' + error.message, 'error'); return; }
  m.role = newRole;
  document.getElementById('role-manage-list').innerHTML = buildRoleManageListHTML();
  toast(`✓ 已将「${m.name}」设为${ROLE_LABELS[newRole]}`, 'success');
  logAction('修改角色', `将「${m.name}」设为${ROLE_LABELS[newRole]}`);
}

// ─── Menu Permission Modal ────────────────────────────────────────────────────
function openMenuPermsModal(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  if (!canManageRole(currentUser.role, m.role || 'user')) {
    toast('无权限修改此成员的菜单'); return;
  }

  // 当前成员的有效权限（用于预选 checkbox）
  // 如果正在编辑同一成员，使用未保存的编辑状态；否则从成员数据读取
  // null/undefined = 从未配置，使用角色默认值；[] = 显式清空，尊重空数组
  const currentPerms = (window._editingPerms && window._editingPerms.memberId === memberId)
    ? [...window._editingPerms.perms]
    : (m.menuPerms != null ? m.menuPerms : getDefaultMenuPerms(m.role || 'user'));

  // 过滤出该成员可配置的菜单项
  const targetIsAdmin = getRoleLevel(m.role || 'user') >= 2;
  const configurableMenus = MENU_DEFS.filter(md => {
    if (md.adminOnly && !targetIsAdmin) return false;
    return true;
  });

  // 按分组整理
  var GROUPS = [
    { key: 'pm',      label: '项目管理',   desc: '任务看板、甘特图、数据统计等' },
    { key: 'finance', label: '资金计划',   desc: '月度资金计划、收付款管理' },
    { key: 'base',    label: '基础库配置', desc: '基础信息、合同库、客户库、供应商库' },
    { key: 'ai',      label: 'AI 助手',    desc: 'AI 任务助手对话面板' },
    { key: 'admin',   label: '系统管理',   desc: '成员、标签、角色、系统配置' },
  ];

  // 仅超级管理员可配置 AI 助手权限，其他角色看不到此分组
  if (!currentUser || currentUser.role !== 'super_admin') {
    GROUPS = GROUPS.filter(function(g) { return g.key !== 'ai'; });
  }

  var groupsHTML = '';
  GROUPS.forEach(function(g) {
    var groupItems = configurableMenus.filter(function(md) { return md.group === g.key; });
    if (!groupItems.length) return;
    var itemsHTML = groupItems.map(function(md) {
      var isChecked = currentPerms.includes(md.key);
      return '<label class="perm-item ' + (isChecked ? 'checked' : '') + '" onclick="togglePermItem(this,\'' + md.key + '\')">' +
        '<div class="perm-check ' + (isChecked ? 'on' : '') + '" id="pcheck-' + md.key + '"></div>' +
        '<span>' + md.icon + ' ' + md.label + '</span>' +
      '</label>';
    }).join('');
    groupsHTML +=
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">' + g.label + '</div>' +
        '<div style="font-size:10px;color:var(--text3);margin-bottom:8px">' + g.desc + '</div>' +
        '<div class="perm-grid">' + itemsHTML + '</div>' +
      '</div>';
  });

  openModal(`${modalHeader(`配置菜单权限 · ${escHtml(m.name)}`)}
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px;padding:8px 12px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border)">
        为 <strong>${escHtml(m.name)}</strong>（${ROLE_LABELS[m.role || 'user']}）配置可见的菜单项。无任何分组权限时对应模块 TAB 将自动隐藏。
      </div>
      ${groupsHTML}
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="selectAllMenuPerms('${memberId}', true)">全部勾选</button>
        <button class="btn btn-ghost btn-sm" onclick="selectAllMenuPerms('${memberId}', false)">全部取消</button>
      </div>
    </div>
    <div class="modal-footer">
      <div style="font-size:11px;color:var(--text3)" id="perm-tip">勾选后点击保存生效</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="openRoleManageModal()">返回</button>
        <button class="btn btn-primary" onclick="saveMenuPerms('${memberId}', this)">保存权限</button>
      </div>
    </div>`);

  // 存储当前编辑的权限状态
  window._editingPerms = { memberId, perms: [...currentPerms] };
}

function togglePermItem(labelEl, key) {
  if (!window._editingPerms) return;
  const perms = window._editingPerms.perms;
  const idx = perms.indexOf(key);
  const checkEl = labelEl.querySelector('.perm-check');
  if (idx >= 0) {
    perms.splice(idx, 1);
    labelEl.classList.remove('checked');
    checkEl.classList.remove('on');
  } else {
    perms.push(key);
    labelEl.classList.add('checked');
    checkEl.classList.add('on');
  }
}

function resetMenuPermsToDefault(memberId) {
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  window._editingPerms.perms = getDefaultMenuPerms(m.role || 'user');
  openMenuPermsModal(memberId);
}

function selectAllMenuPerms(memberId, selectAll) {
  if (!window._editingPerms) return;
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;
  const targetIsAdmin = getRoleLevel(m.role || 'user') >= 2;
  const available = MENU_DEFS
    .filter(function(md) {
      if (md.adminOnly && !targetIsAdmin) return false;
      // 仅超级管理员可配置 AI 助手权限
      if (md.group === 'ai' && currentUser && currentUser.role !== 'super_admin') return false;
      return true;
    })
    .map(function(md) { return md.key; });
  window._editingPerms.perms = selectAll ? [...available] : [];
  openMenuPermsModal(memberId);
}

async function saveMenuPerms(memberId, btn) {
  if (!window._editingPerms || window._editingPerms.memberId !== memberId) return;
  const m = state.members.find(x => x.id === memberId);
  if (!m) return;

  const finalPerms = [...window._editingPerms.perms];

  setLoading(btn, true);
  const { error } = await sb.from('members').update({ menu_perms: finalPerms }).eq('id', memberId);
  setLoading(btn, false);

  if (error) { toast('保存失败：' + error.message, 'error'); return; }

  m.menuPerms = finalPerms;
  // 如果改的是自己，立即生效
  if (currentUser && currentUser.id === memberId) {
    currentUser.menuPerms = finalPerms;
    localStorage.setItem('pm_session', JSON.stringify(currentUser));
    applyMenuPerms();
  }

  toast(`✓ 已更新「${m.name}」的菜单权限`, 'success');
  logAction('配置菜单权限', `为「${m.name}」配置了 ${finalPerms.length} 项菜单权限`);
  openRoleManageModal();
}

async function adminResetPassword(memberId, memberName) {
  const DEFAULT_PWD = '123456';
  showConfirm('重置密码', `即将把「${memberName}」的登录密码重置为：${DEFAULT_PWD}\n\n请提醒该用户登录后及时修改密码。`, async function() {
    const { error } = await sb.from('members').update({ password: md5(DEFAULT_PWD) }).eq('id', memberId);
    if (error) { toast('重置失败：' + error.message, 'error'); return; }
    if (currentUser && currentUser.id === memberId) {
      currentUser.password = md5(DEFAULT_PWD);
    }
    toast(`「${memberName}」的密码已重置为 ${DEFAULT_PWD}`, 'success');
    logAction('重置密码', `管理员重置了「${memberName}」的密码`);
  }, {confirmLabel: '确认重置'});
}

