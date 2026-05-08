// ═══════════════════════════════════════════════════════════════════════════
// pm-settings.js — Settings Hub 设置中心
// ═══════════════════════════════════════════════════════════════════════════

window.activeSettingsPage = null;
window.settingsDirty = false;
window._settingsCache = {};

// ─── 设置项定义 ───
window.SETTINGS_PAGES = [
  // ─── 个人 ───
  { group: '个人', key: 'profile',       label: '个人资料',     icon: 'user',          render: 'renderProfilePage' },
  { group: '个人', key: 'security',      label: '密码与安全',   icon: 'lock',          render: 'renderSecurityPage' },
  { group: '个人', key: 'appearance',    label: '外观与主题',   icon: 'palette',       render: 'renderAppearancePage' },
  { group: '个人', key: 'notifications', label: '通知偏好',     icon: 'bell',          render: 'renderNotifPrefsPage' },

  // ─── 团队（仅 admin/super_admin 可见） ───
  { group: '团队', key: 'members',  label: '成员管理',   icon: 'users',         render: 'renderMembersPage',  adminOnly: true },
  { group: '团队', key: 'roles',    label: '角色与权限', icon: 'shield-check',  render: 'renderRolesPage',    adminOnly: true },
  { group: '团队', key: 'tags',     label: '标签管理',   icon: 'tags',          render: 'renderTagsPage',     adminOnly: true },

  // ─── 工作区 ───
  { group: '工作区', key: 'basic_info',   label: '基础信息',   icon: 'building-2',  render: 'renderBasicInfoPage' },
  { group: '工作区', key: 'integrations',  label: '集成与 API', icon: 'plug',        render: 'renderIntegrationsPage', superAdminOnly: true },

  // ─── 系统 ───
  { group: '系统', key: 'logs',     label: '操作日志', icon: 'history',  render: 'renderLogsPage',   adminOnly: true },
  { group: '系统', key: 'export',   label: '数据导出', icon: 'download', render: 'renderExportPage', adminOnly: true },
  { group: '系统', key: 'about',    label: '关于',     icon: 'info',     render: 'renderAboutPage' }
];

// ─── 初始化 ───
window.initSettingsHub = function() {
  buildSettingsNav();
  var pmContent = document.getElementById('pm-content');
  var finContent = document.getElementById('finance-content');
  var settingsContent = document.getElementById('settings-content');
  if (pmContent) pmContent.style.display = 'none';
  if (finContent) finContent.style.display = 'none';
  if (settingsContent) settingsContent.style.display = 'flex';

  var hashKey = (location.hash.match(/^#\/settings\/(\w+)/) || [])[1];
  var defaultKey = hashKey && getSettingsPage(hashKey) ? hashKey : 'profile';
  openSettingsPage(defaultKey);
  if (window.lucide) window.lucide.createIcons();
};

// ─── 构建左侧导航 ───
function buildSettingsNav() {
  var nav = document.getElementById('settings-nav');
  if (!nav) return;
  var role = (currentUser && currentUser.role) || 'user';
  var isAdminFlag = role === 'admin' || role === 'super_admin';
  var isSuperFlag = role === 'super_admin';

  var groups = {};
  var _navEffPerms = typeof getEffectiveMenuPerms === 'function' ? getEffectiveMenuPerms() : [];
  window.SETTINGS_PAGES.forEach(function(p) {
    if (p.adminOnly && !isAdminFlag && !_navEffPerms.includes(p.key)) return;
    if (p.superAdminOnly && !isSuperFlag) return;
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  });

  var html = '';
  Object.keys(groups).forEach(function(g) {
    html += '<div class="settings-nav-group-label">' + escHtml(g) + '</div>';
    groups[g].forEach(function(p) {
      html += '<button class="settings-nav-item" data-page-key="' + p.key + '" onclick="openSettingsPage(\'' + p.key + '\')">' +
        '<i data-lucide="' + p.icon + '" class="settings-nav-icon"></i>' +
        '<span>' + escHtml(p.label) + '</span>' +
        '</button>';
    });
  });
  nav.innerHTML = html;
}

function getSettingsPage(key) {
  return window.SETTINGS_PAGES.find(function(p) { return p.key === key; });
}

// ─── 打开指定设置页 ───
window.openSettingsPage = function(key) {
  var page = getSettingsPage(key);
  if (!page) return;

  var role = (currentUser && currentUser.role) || 'user';
  var _openEffPerms = typeof getEffectiveMenuPerms === 'function' ? getEffectiveMenuPerms() : [];
  if (page.adminOnly && role !== 'admin' && role !== 'super_admin' && !_openEffPerms.includes(page.key)) {
    if (typeof toast === 'function') toast('需要管理员权限', 'warning');
    return;
  }
  if (page.superAdminOnly && role !== 'super_admin') {
    if (typeof toast === 'function') toast('需要超级管理员权限', 'warning');
    return;
  }

  if (window.settingsDirty && key !== window.activeSettingsPage) {
    showDirtyGuard(function() { clearSettingsDirty(); openSettingsPage(key); });
    return;
  }

  window.activeSettingsPage = key;

  document.querySelectorAll('.settings-nav-item').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-page-key') === key);
  });

  var bcEl = document.getElementById('settings-bc-current');
  if (bcEl) bcEl.textContent = page.label;
  var actions = document.getElementById('settings-actions');
  if (actions) actions.innerHTML = '';

  var wrap = document.getElementById('settings-page-wrap');
  if (wrap) {
    wrap.innerHTML = '<div class="settings-page-loading">加载中...</div>';
    setTimeout(function() {
      if (typeof window[page.render] === 'function') {
        try {
          window[page.render](wrap);
        } catch(e) {
          console.error('[Settings] render error:', e);
          wrap.innerHTML = '<div class="settings-error">加载失败：' + escHtml(String(e)) + '</div>';
        }
      } else {
        wrap.innerHTML = '<div class="settings-empty-page">该页面尚未实现</div>';
      }
      if (window.lucide) window.lucide.createIcons();
    }, 50);
  }

  if (location.hash !== '#/settings/' + key) {
    history.replaceState(null, '', '#/settings/' + key);
  }
};

// ─── 脏数据检测 ───
window.checkSettingsDirty = function() {
  if (!window.settingsDirty) return true;
  showDirtyGuard(null); // 仅闪烁提示，不绑定回调
  return false;
};

// 替代 confirm() 的 inline dirty 提示
window.showDirtyGuard = function(onConfirm) {
  if (!window.settingsDirty) { if (onConfirm) onConfirm(); return; }
  var bar = document.getElementById('settings-dirty-bar');
  if (bar) {
    bar.classList.add('flash');
    setTimeout(function() { bar.classList.remove('flash'); }, 600);
    if (onConfirm) window._dirtyGuardCallback = onConfirm;
  }
};

window.discardSettingsChanges = function() {
  clearSettingsDirty();
  var cb = window._dirtyGuardCallback;
  window._dirtyGuardCallback = null;
  if (cb) cb();
};

window.saveCurrentSettingsPage = function() {
  // 触发当前页面的保存逻辑
  var key = window.activeSettingsPage;
  if (key === 'roles' && window._editingMemberId !== null) {
    saveRolesPanel();
  } else if (key === 'profile' && typeof saveProfile === 'function') {
    saveProfile();
  } else if (key === 'password' && typeof savePassword === 'function') {
    savePassword();
  }
  // 保存完成后清除 dirty 并执行回调
  clearSettingsDirty();
  var cb = window._dirtyGuardCallback;
  window._dirtyGuardCallback = null;
  if (cb) setTimeout(function() { cb(); }, 200);
};

window.markSettingsDirty = function() {
  window.settingsDirty = true;
  var bar = document.getElementById('settings-dirty-bar');
  if (bar) bar.style.display = 'flex';
  var actions = document.getElementById('settings-actions');
  if (actions && !document.getElementById('settings-dirty-indicator')) {
    actions.innerHTML = '<span id="settings-dirty-indicator" class="settings-dirty-tag">● 未保存</span>' + actions.innerHTML;
  }
  if (window.lucide) window.lucide.createIcons();
};

window.clearSettingsDirty = function() {
  window.settingsDirty = false;
  var bar = document.getElementById('settings-dirty-bar');
  if (bar) bar.style.display = 'none';
  var ind = document.getElementById('settings-dirty-indicator');
  if (ind) ind.remove();
};

// ─── 搜索 ───
window.onSettingsSearch = function(q) {
  q = (q || '').trim().toLowerCase();
  document.querySelectorAll('.settings-nav-item').forEach(function(item) {
    var label = (item.querySelector('span') || {}).textContent || '';
    item.style.display = !q || label.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
  });
  document.querySelectorAll('.settings-nav-group-label').forEach(function(g) {
    var next = g.nextElementSibling;
    var hasVisible = false;
    while (next && next.classList.contains('settings-nav-item')) {
      if (next.style.display !== 'none') { hasVisible = true; break; }
      next = next.nextElementSibling;
    }
    g.style.display = hasVisible ? '' : 'none';
  });
};

// ─── hash 路由监听 ───
window.addEventListener('hashchange', function() {
  if (typeof activeModule !== 'undefined' && activeModule !== 'settings') return;
  var key = (location.hash.match(/^#\/settings\/(\w+)/) || [])[1];
  if (key && key !== window.activeSettingsPage) openSettingsPage(key);
});

// ═══════════════════════════════════════════════════════════════
// 4.1 个人 - 个人资料
// ═══════════════════════════════════════════════════════════════
window.renderProfilePage = function(wrap) {
  var me = currentUser || {};
  var role = me.role || 'user';
  var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };
  var MEMBER_COLORS = window._MEMBER_COLORS || ['#3b82f6'];
  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">个人资料</div>' +
      '<div class="settings-page-desc">你的账号信息和外观设置</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-row">' +
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<div class="member-avatar" style="width:56px;height:56px;font-size:22px;background:' + (MEMBER_COLORS[(me.colorIdx || 0) % MEMBER_COLORS.length] || 'var(--accent)') + '">' + escHtml((me.name||'?').slice(0,1)) + '</div>' +
          '<div>' +
            '<div style="font-size:16px;font-weight:600;color:var(--text)">' + escHtml(me.name || '—') + '</div>' +
            '<div style="font-size:12px;color:var(--text3);margin-top:2px">' +
              '<span class="role-badge role-' + role + '">' + (ROLE_LABELS[role] || role) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">头像颜色</div>' +
      '<div class="settings-section-desc">从下方调色板选一个</div>' +
      '<div id="profile-color-picker" style="display:flex;flex-wrap:wrap;gap:8px">' +
        MEMBER_COLORS.map(function(col, i) {
          var sel = i === (me.colorIdx || 0);
          return '<div onclick="updateProfileColor(' + i + ')" style="width:32px;height:32px;border-radius:50%;background:' + col + ';cursor:pointer;border:3px solid ' + (sel ? 'var(--text)' : 'transparent') + ';transition:border .15s" title="颜色 ' + i + '"></div>';
        }).join('') +
      '</div>' +
    '</div>';
};

window.updateProfileColor = async function(idx) {
  if (!currentUser) return;
  var { error } = await sb.from('members').update({ color_idx: idx }).eq('id', currentUser.id);
  if (error) { if (typeof toast === 'function') toast('保存失败', 'error'); return; }
  currentUser.colorIdx = idx;
  localStorage.setItem('pm_session', JSON.stringify(currentUser));
  if (typeof updateUserInfoUI === 'function') updateUserInfoUI();
  renderProfilePage(document.getElementById('settings-page-wrap'));
  if (window.lucide) window.lucide.createIcons();
  if (typeof toast === 'function') toast('头像颜色已更新', 'success');
};

// ═══════════════════════════════════════════════════════════════
// 4.2 个人 - 密码与安全
// ═══════════════════════════════════════════════════════════════
window.renderSecurityPage = function(wrap) {
  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">密码与安全</div>' +
      '<div class="settings-page-desc">定期修改密码以保持账户安全</div>' +
    '</div>' +
    '<div class="settings-section" style="max-width:480px">' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">当前密码</label>' +
        '<input type="password" class="settings-form-input" id="sec-old-pwd" oninput="markSettingsDirty()">' +
      '</div>' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">新密码</label>' +
        '<input type="password" class="settings-form-input" id="sec-new-pwd" oninput="markSettingsDirty()">' +
        '<div style="font-size:11px;color:var(--text3);margin-top:4px">至少 6 位</div>' +
      '</div>' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">确认新密码</label>' +
        '<input type="password" class="settings-form-input" id="sec-new-pwd2" oninput="markSettingsDirty()">' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn btn-primary" onclick="submitChangePassword()">更新密码</button>' +
      '</div>' +
    '</div>';
};

window.submitChangePassword = async function() {
  var oldPwd = document.getElementById('sec-old-pwd').value;
  var newPwd = document.getElementById('sec-new-pwd').value;
  var newPwd2 = document.getElementById('sec-new-pwd2').value;
  if (!oldPwd || !newPwd) { if (typeof toast === 'function') toast('请填写完整', 'warning'); return; }
  if (newPwd.length < 6) { if (typeof toast === 'function') toast('新密码至少 6 位', 'warning'); return; }
  if (newPwd !== newPwd2) { if (typeof toast === 'function') toast('两次输入不一致', 'warning'); return; }

  var { data, error } = await sb.from('members').select('password').eq('id', currentUser.id).single();
  if (error) { if (typeof toast === 'function') toast('校验失败', 'error'); return; }
  if (data.password !== md5(oldPwd)) { if (typeof toast === 'function') toast('当前密码错误', 'error'); return; }

  var resp = await sb.from('members').update({ password: md5(newPwd) }).eq('id', currentUser.id);
  if (resp.error) { if (typeof toast === 'function') toast('更新失败：' + resp.error.message, 'error'); return; }
  clearSettingsDirty();
  if (typeof toast === 'function') toast('✓ 密码已更新', 'success');
  document.getElementById('sec-old-pwd').value = '';
  document.getElementById('sec-new-pwd').value = '';
  document.getElementById('sec-new-pwd2').value = '';
  if (typeof logAction === 'function') logAction('修改密码', '本人通过设置中心修改密码');
};

// ═══════════════════════════════════════════════════════════════
// 4.3 个人 - 外观与主题
// ═══════════════════════════════════════════════════════════════
window.renderAppearancePage = function(wrap) {
  var curTheme = localStorage.getItem('pm_theme') || 'light';
  var compact = localStorage.getItem('pm_compact') === '1';
  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">外观与主题</div>' +
      '<div class="settings-page-desc">自定义你的工作界面外观</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">主题模式</div>' +
      '<div class="theme-cards">' +
        '<div class="theme-card ' + (curTheme === 'light' ? 'active' : '') + '" onclick="applyTheme(\'light\')">' +
          '<div class="theme-card-preview light"></div>' +
          '<div class="theme-card-meta"><span>浅色</span>' +
            (curTheme === 'light' ? '<i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--accent)"></i>' : '') +
          '</div>' +
        '</div>' +
        '<div class="theme-card ' + (curTheme === 'dark' ? 'active' : '') + '" onclick="applyTheme(\'dark\')">' +
          '<div class="theme-card-preview dark"></div>' +
          '<div class="theme-card-meta"><span>深色</span>' +
            (curTheme === 'dark' ? '<i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--accent)"></i>' : '') +
          '</div>' +
        '</div>' +
        '<div class="theme-card ' + (curTheme === 'auto' ? 'active' : '') + '" onclick="applyTheme(\'auto\')">' +
          '<div class="theme-card-preview auto"></div>' +
          '<div class="theme-card-meta"><span>跟随系统</span>' +
            (curTheme === 'auto' ? '<i data-lucide="check-circle-2" style="width:14px;height:14px;color:var(--accent)"></i>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-row">' +
        '<div class="settings-row-info">' +
          '<div class="settings-row-label">紧凑布局</div>' +
          '<div class="settings-row-desc">减小卡片间距，提高单屏信息密度</div>' +
        '</div>' +
        '<div class="settings-switch ' + (compact ? 'on' : '') + '" onclick="toggleCompactMode()"></div>' +
      '</div>' +
    '</div>';
};

window.applyTheme = function(theme) {
  localStorage.setItem('pm_theme', theme);
  if (theme === 'auto') {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  renderAppearancePage(document.getElementById('settings-page-wrap'));
  if (window.lucide) window.lucide.createIcons();
};

window.toggleCompactMode = function() {
  var cur = localStorage.getItem('pm_compact') === '1';
  localStorage.setItem('pm_compact', cur ? '0' : '1');
  document.body.classList.toggle('compact-mode', !cur);
  renderAppearancePage(document.getElementById('settings-page-wrap'));
};

// ═══════════════════════════════════════════════════════════════
// 4.4 个人 - 通知偏好
// ═══════════════════════════════════════════════════════════════
window.renderNotifPrefsPage = function(wrap) {
  var prefs = JSON.parse(localStorage.getItem('pm_notif_prefs') || '{}');
  var PREFS = [
    { key: 'task_overdue',  label: '任务逾期提醒',   desc: '截止日已过的未完成任务', default: true },
    { key: 'task_urgent',   label: '3天内到期提醒',  desc: '距截止日3天内的任务',    default: true },
    { key: 'fin_receipt',   label: '收款到期提醒',   desc: 'Finance 收款计划即将到期', default: true },
    { key: 'cloud_push',    label: '协作推送通知',   desc: '任务指派、权限变更等云端通知', default: true },
  ];

  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">通知偏好</div>' +
      '<div class="settings-page-desc">控制哪些事件会出现在铃铛通知中</div>' +
    '</div>' +
    '<div class="settings-section-card" style="max-width:640px">' +
      '<div class="ssc-header"><div class="ssc-title">通知类型</div></div>' +
      '<div class="ssc-body">' +
        PREFS.map(function(p) {
          var isOn = prefs[p.key] !== undefined ? prefs[p.key] : p.default;
          return '<div class="settings-row">' +
            '<div class="settings-row-label">' +
              '<div>' + escHtml(p.label) + '</div>' +
              '<div class="settings-row-desc">' + escHtml(p.desc) + '</div>' +
            '</div>' +
            '<label class="toggle-switch">' +
              '<input type="checkbox" ' + (isOn ? 'checked' : '') +
                     ' onchange="saveNotifPref(\'' + p.key + '\', this.checked)">' +
              '<span class="toggle-slider"></span>' +
            '</label>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
};

window.saveNotifPref = function(key, val) {
  var prefs = JSON.parse(localStorage.getItem('pm_notif_prefs') || '{}');
  prefs[key] = val;
  localStorage.setItem('pm_notif_prefs', JSON.stringify(prefs));
  if (typeof refreshNotifs === 'function') refreshNotifs();
  if (typeof toast === 'function') toast('已更新通知偏好', 'success');
};

// ═══════════════════════════════════════════════════════════════
// 4.5 团队 - 成员管理
// ═══════════════════════════════════════════════════════════════
window._membersPageState = { searchQ: '', filterRole: 'all' };

window.renderMembersPage = function(wrap) {
  var s = window._membersPageState;
  var role = (currentUser && currentUser.role) || 'user';
  var canAdd = role === 'admin' || role === 'super_admin';
  var MEMBER_COLORS = window._MEMBER_COLORS || ['#3b82f6'];
  var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };

  wrap.innerHTML =
    '<div class="settings-page-header" style="display:flex;justify-content:space-between;align-items:flex-start">' +
      '<div>' +
        '<div class="settings-page-title">成员管理</div>' +
        '<div class="settings-page-desc">管理工作区的所有成员</div>' +
      '</div>' +
      (canAdd ? '<button class="btn btn-primary" onclick="openAddMemberDialog()"><i data-lucide="user-plus" style="width:14px;height:14px"></i>添加成员</button>' : '') +
    '</div>' +
    (canAdd ? '<div id="add-member-form" style="display:none;margin-bottom:12px;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);gap:8px;align-items:center;flex-wrap:wrap">' +
      '<input class="settings-form-input" id="new-member-name" placeholder="输入姓名" style="width:160px;height:34px">' +
      '<input class="settings-form-input" id="new-member-pass" type="password" placeholder="设置登录密码" style="width:160px;height:34px">' +
      '<button class="btn btn-primary btn-sm" id="add-member-submit-btn" onclick="submitAddMemberInline()">确认添加</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="hideAddMemberForm()">取消</button>' +
      '<span style="font-size:11px;color:var(--text3)">默认角色为普通用户，后续可在角色与权限中调整</span>' +
    '</div>' : '') +
    '<div class="settings-section" style="padding:14px 16px;margin-bottom:12px">' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<input type="text" class="settings-form-input" placeholder="搜索成员姓名..." value="' + escHtml(s.searchQ) + '" oninput="onMembersSearch(this.value)" style="width:240px;height:34px">' +
        '<div style="display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:2px;gap:1px">' +
          ['all','super_admin','admin','user'].map(function(r) {
            var lbl = r === 'all' ? '全部' : (ROLE_LABELS[r] || r);
            var act = s.filterRole === r;
            return '<button onclick="onMembersFilterRole(\'' + r + '\')" style="padding:5px 12px;border-radius:4px;border:none;background:' + (act ? 'var(--surface)' : 'transparent') + ';color:' + (act ? 'var(--accent)' : 'var(--text2)') + ';font-size:12px;font-weight:500;cursor:pointer;font-family:var(--font);' + (act ? 'box-shadow:var(--shadow-xs)' : '') + '">' + lbl + '</button>';
          }).join('') +
        '</div>' +
        '<span style="margin-left:auto;font-size:12px;color:var(--text3)" id="members-count">共 ' + state.members.length + ' 名成员</span>' +
      '</div>' +
    '</div>' +
    '<div class="settings-section" style="padding:0">' +
      '<div id="members-page-list">' + buildMembersListHTML(MEMBER_COLORS, ROLE_LABELS) + '</div>' +
    '</div>';
  if (window.lucide) window.lucide.createIcons();
};

function buildMembersListHTML(MEMBER_COLORS, ROLE_LABELS) {
  var s = window._membersPageState;
  var role = (currentUser && currentUser.role) || 'user';
  var isAdmin = role === 'admin' || role === 'super_admin';
  var filtered = state.members.filter(function(m) {
    if (s.filterRole !== 'all' && (m.role || 'user') !== s.filterRole) return false;
    if (s.searchQ && (m.name || '').toLowerCase().indexOf(s.searchQ.toLowerCase()) === -1) return false;
    return true;
  });
  if (filtered.length === 0) {
    return '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">未找到符合条件的成员</div>';
  }
  return filtered.map(function(m) {
    var isMe = currentUser && m.id === currentUser.id;
    var mRole = m.role || 'user';
    return '<div class="settings-row" style="padding:14px 20px;border-top:1px solid var(--border-subtle)">' +
      '<div class="member-avatar" style="width:36px;height:36px;font-size:14px;background:' + (MEMBER_COLORS[(m.colorIdx || 0) % MEMBER_COLORS.length] || 'var(--accent)') + ';flex-shrink:0">' + escHtml((m.name || '?').slice(0,1)) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' +
          '<span style="font-size:13px;font-weight:500">' + escHtml(m.name) + '</span>' +
          (isMe ? '<span style="font-size:10px;color:var(--green);font-weight:500">(你)</span>' : '') +
          '<span class="role-badge role-' + mRole + '" style="font-size:10px">' + (ROLE_LABELS[mRole] || mRole) + '</span>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text3)">ID: ' + escHtml(m.id) + '</div>' +
      '</div>' +
      (isAdmin && !isMe ? (
        '<div style="display:flex;gap:6px">' +
          '<button class="btn btn-ghost btn-sm" onclick="editMemberFromPage(\'' + m.id + '\')"><i data-lucide="pencil" style="width:12px;height:12px"></i>编辑</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="adminResetPassword(\'' + m.id + '\',\'' + escHtml(m.name) + '\')" style="color:var(--amber)"><i data-lucide="key" style="width:12px;height:12px"></i>重置密码</button>' +
        '</div>'
      ) : '') +
    '</div>';
  }).join('');
}

window.onMembersSearch = function(v) {
  window._membersPageState.searchQ = v;
  var el = document.getElementById('members-page-list');
  if (el) {
    var MEMBER_COLORS = window._MEMBER_COLORS || ['#3b82f6'];
    var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };
    el.innerHTML = buildMembersListHTML(MEMBER_COLORS, ROLE_LABELS);
  }
  if (window.lucide) window.lucide.createIcons();
};
window.onMembersFilterRole = function(r) {
  window._membersPageState.filterRole = r;
  renderMembersPage(document.getElementById('settings-page-wrap'));
};

// 新建成员 - 内联表单
window.openAddMemberDialog = function() {
  var form = document.getElementById('add-member-form');
  if (form) { form.style.display = 'flex'; }
  var inp = document.getElementById('new-member-name');
  if (inp) { inp.value = ''; setTimeout(function() { inp.focus(); }, 50); }
};

window.hideAddMemberForm = function() {
  var form = document.getElementById('add-member-form');
  if (form) { form.style.display = 'none'; }
};

window.submitAddMemberInline = async function() {
  var nameInp = document.getElementById('new-member-name');
  var passInp = document.getElementById('new-member-pass');
  if (!nameInp || !passInp) return;
  var name = nameInp.value.trim();
  var pass = passInp.value.trim();
  if (!name || !pass) { toast('姓名和密码不能为空', 'warning'); return; }
  if (state.members.some(function(m) { return m.name === name; })) { toast('该姓名已存在，请更换', 'warning'); return; }
  var MEMBER_COLORS = window._MEMBER_COLORS || ['#3b82f6'];
  var newMember = { id: uid(), name: name, password: md5(pass), colorIdx: state.members.length % MEMBER_COLORS.length };
  try {
    var addBtn = document.getElementById('add-member-submit-btn');
    if (typeof setLoading === 'function') setLoading(addBtn, true);
    var result = await sb.from('members').upsert({
      id: newMember.id, name: newMember.name, password: newMember.password,
      color_idx: newMember.colorIdx, role: 'user'
    });
    if (typeof setLoading === 'function') setLoading(addBtn, false);
    if (result.error) { toast('成员同步失败，请检查数据库权限', 'error'); return; }
    state.members.push(newMember);
    if (typeof _lastLoadTime !== 'undefined') _lastLoadTime = Date.now();
    nameInp.value = '';
    passInp.value = '';
    // 刷新成员列表
    var listEl = document.getElementById('members-page-list');
    var MEMBER_COLORS2 = window._MEMBER_COLORS || ['#3b82f6'];
    var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };
    if (listEl) { listEl.innerHTML = buildMembersListHTML(MEMBER_COLORS2, ROLE_LABELS); }
    // 更新计数
    var countEl = document.getElementById('members-count');
    if (countEl) { countEl.textContent = '共 ' + state.members.length + ' 名成员'; }
    if (window.lucide) window.lucide.createIcons();
    toast('成员已成功加入云端', 'success');
    if (typeof logAction === 'function') logAction('添加成员', '新增成员「' + newMember.name + '」');
  } catch(err) {
    toast('添加失败：' + (err.message || '未知错误'), 'error');
  }
};

// 编辑成员
window.editMemberFromPage = function(memberId) {
  var m = state.members.find(function(x) { return x.id === memberId; });
  if (!m) return;
  var newName = prompt('编辑成员姓名：', m.name);
  if (!newName || !newName.trim() || newName.trim() === m.name) return;
  newName = newName.trim();
  if (state.members.some(function(x) { return x.id !== memberId && x.name === newName; })) { toast('该姓名已存在', 'warning'); return; }
  m.name = newName;
  sb.from('members').update({ name: newName }).eq('id', memberId).then(function(res) {
    if (res.error) { toast('更新失败：' + res.error.message, 'error'); return; }
    if (typeof _lastLoadTime !== 'undefined') _lastLoadTime = Date.now();
    var listEl = document.getElementById('members-page-list');
    var MEMBER_COLORS = window._MEMBER_COLORS || ['#3b82f6'];
    var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };
    if (listEl) { listEl.innerHTML = buildMembersListHTML(MEMBER_COLORS, ROLE_LABELS); }
    if (window.lucide) window.lucide.createIcons();
    toast('成员姓名已更新', 'success');
    if (typeof logAction === 'function') logAction('编辑成员', '编辑成员「' + newName + '」');
  }).catch(function(err) {
    toast('更新失败：' + (err.message || '未知错误'), 'error');
  });
};

// ═══════════════════════════════════════════════════════════════
// 4.6 团队 - 角色与权限（含侧滑面板）
// ═══════════════════════════════════════════════════════════════
window._editingMemberId = null;

window.renderRolesPage = function(wrap) {
  var myLevel = typeof getRoleLevel === 'function' ? getRoleLevel((currentUser && currentUser.role) || 'user') : 1;

  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">角色与权限</div>' +
      '<div class="settings-page-desc">配置成员的角色和可见菜单</div>' +
    '</div>' +
    '<div class="settings-section-card" style="font-size:12px;line-height:1.7">' +
      '<div class="ssc-body" style="padding:14px 20px">' +
        '<strong>权限层级：</strong>超级管理员 > 管理员 > 普通用户。只能修改比自己级别低的成员。' +
      '</div>' +
    '</div>' +
    '<div class="settings-section-card" style="padding:0;position:relative;overflow:hidden">' +
      '<div id="roles-page-list">' + buildRolesListHTML() + '</div>' +
      '<div class="settings-side-panel" id="roles-side-panel">' +
        '<div class="settings-side-panel-header">' +
          '<div class="settings-side-panel-title" id="roles-panel-title">菜单权限</div>' +
          '<button class="btn btn-ghost btn-sm" onclick="closeRolesPanel()">关闭</button>' +
        '</div>' +
        '<div class="settings-side-panel-body" id="roles-panel-body">—</div>' +
        '<div class="settings-side-panel-footer" id="roles-panel-footer">' +
          '<div style="display:flex;gap:6px">' +
            '<button class="btn btn-ghost btn-sm" onclick="setAllRolePerms(true)">全选</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="setAllRolePerms(false)">清空</button>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-ghost" onclick="closeRolesPanel()">取消</button>' +
            '<button class="btn btn-primary" onclick="saveRolesPanel()">保存</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
};

function buildPermSummaryBadges(m) {
  // 超级管理员始终拥有全部权限
  var isSA = m.role === 'super_admin';
  var perms = isSA ? null : (m.menuPerms || []);
  var PERM_GROUPS = [
    { key: 'pm',      label: '项目管理', color: 'blue',   keys: ['today','tasks','charts','gantt','projects','add_task'] },
    { key: 'finance', label: '资金计划', color: 'teal',   keys: ['fin_t1','fin_receipt','fin_payment','fin_t4','fin_t5','fin_t6','fin_dashboard'] },
    { key: 'base',    label: '基础库',   color: 'purple', keys: ['base_contracts','base_customers','base_suppliers','basic_info'] },
    { key: 'ai',      label: 'AI 助手',  color: 'amber',  keys: ['ai_assistant'] },
    { key: 'admin',   label: '系统管理', color: 'red',    keys: ['members','tags','logs','system_config'] },
  ];
  // super_admin 显示全部，无权限显示空
  if (isSA) {
    return '<span class="perm-summary-badges">' + PERM_GROUPS.map(function(g) {
      return '<span class="perm-summary-badge perm-badge-' + g.color + '">' + g.label + '</span>';
    }).join('') + '</span>';
  }
  var activeGroups = PERM_GROUPS.filter(function(g) {
    return g.keys.some(function(k) { return perms.indexOf(k) !== -1; });
  });
  if (!activeGroups.length) {
    return '<span style="font-size:11px;color:var(--text3);font-style:italic">暂无权限</span>';
  }
  return '<span class="perm-summary-badges">' + activeGroups.map(function(g) {
    return '<span class="perm-summary-badge perm-badge-' + g.color + '">' + g.label + '</span>';
  }).join('') + '</span>';
}

function buildRolesListHTML() {
  var myLevel = typeof getRoleLevel === 'function' ? getRoleLevel((currentUser && currentUser.role) || 'user') : 1;
  var MEMBER_COLORS = window._MEMBER_COLORS || ['#3b82f6'];
  var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };
  return state.members.map(function(m) {
    var isMe = currentUser && m.id === currentUser.id;
    var role = m.role || 'user';
    var canEdit = !isMe && myLevel > (typeof getRoleLevel === 'function' ? getRoleLevel(role) : 1);
    return '<div class="settings-row" style="padding:14px 20px;border-top:1px solid var(--border-subtle);align-items:flex-start">' +
      '<div class="member-avatar" style="width:32px;height:32px;font-size:13px;background:' + (MEMBER_COLORS[(m.colorIdx || 0) % MEMBER_COLORS.length] || 'var(--accent)') + ';flex-shrink:0;margin-top:2px">' + escHtml((m.name || '?').slice(0,1)) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
          '<span style="font-size:13px;font-weight:500">' + escHtml(m.name) + '</span>' +
          (isMe ? '<span style="font-size:10px;color:var(--green)">(你)</span>' : '') +
          '<span class="role-badge role-' + role + '">' + (ROLE_LABELS[role] || role) + '</span>' +
        '</div>' +
        buildPermSummaryBadges(m) +
      '</div>' +
      (canEdit ? (
        '<button class="btn btn-ghost btn-sm" onclick="openRolesPanel(\'' + m.id + '\')" style="flex-shrink:0;margin-top:2px">' +
          '<i data-lucide="settings" style="width:12px;height:12px"></i>编辑权限' +
        '</button>'
      ) : '<span style="font-size:11px;color:var(--text3);flex-shrink:0;margin-top:2px">' + (isMe ? '当前账号' : '无权操作') + '</span>') +
    '</div>';
  }).join('');
}

window.openRolesPanel = function(memberId) {
  var m = state.members.find(function(x) { return x.id === memberId; });
  if (!m) return;
  window._editingMemberId = memberId;

  var myLevel = typeof getRoleLevel === 'function' ? getRoleLevel((currentUser && currentUser.role) || 'user') : 1;
  var ROLE_LEVELS = window._ROLE_LEVELS || { super_admin: 3, admin: 2, user: 1 };
  var ROLE_LABELS = window._ROLE_LABELS || { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };
  var roleOptions = Object.entries(ROLE_LEVELS)
    .filter(function(e) { return typeof getRoleLevel === 'function' ? getRoleLevel(e[0]) < myLevel : e[1] < myLevel; })
    .sort(function(a, b) { return b[1] - a[1]; })
    .map(function(e) { return '<option value="' + e[0] + '" ' + ((m.role||'user') === e[0] ? 'selected' : '') + '>' + ROLE_LABELS[e[0]] + '</option>'; })
    .join('');

  document.getElementById('roles-panel-title').textContent = '编辑「' + m.name + '」的权限';
  document.getElementById('roles-panel-body').innerHTML =
    '<div class="settings-form-group">' +
      '<label class="settings-form-label">角色</label>' +
      '<select class="settings-form-select" id="rp-role" onchange="markSettingsDirty()">' + roleOptions + '</select>' +
    '</div>' +
    '<div class="settings-form-group">' +
      '<label class="settings-form-label">可见菜单</label>' +
      '<div id="rp-menu-list" style="max-height:420px;overflow-y:auto">' +
        buildMenuPermsGrouped(m) +
      '</div>' +
    '</div>';
  document.getElementById('roles-side-panel').classList.add('open');

  // 设置 indeterminate 状态
  requestAnimationFrame(function() {
    document.querySelectorAll('.rp-group-cb').forEach(function(cb) {
      var groupKey = cb.getAttribute('data-group');
      var MENU_DEFS = window._MENU_DEFS || [];
      var groupItems = MENU_DEFS.filter(function(md) { return md.group === groupKey; });
      var checkedCount = groupItems.filter(function(md) {
        var el = document.querySelector('.rp-menu-cb[data-key="' + md.key + '"]');
        return el && el.checked;
      }).length;
      if (checkedCount > 0 && checkedCount < groupItems.length) {
        cb.indeterminate = true;
      }
    });
  });
};

function buildMenuPermsGrouped(m) {
  var MENU_DEFS = window._MENU_DEFS || [];
  if (!MENU_DEFS.length) return '<div style="color:var(--text3);padding:12px">菜单定义未加载</div>';

  var curPerms = m.menuPerms;
  if (!curPerms || typeof curPerms.length === 'undefined') {
    curPerms = typeof getDefaultMenuPerms === 'function' ? getDefaultMenuPerms(m.role || 'user') : [];
  }

  var GROUPS = [
    { key: 'pm',      label: '项目管理', desc: '任务看板、甘特图、数据统计等' },
    { key: 'finance', label: '资金计划', desc: '月度计划、收付款台账、资金看板' },
    { key: 'base',    label: '基础库',   desc: '合同库、客户库、供应商库、基础信息' },
    { key: 'ai',      label: 'AI 助手',  desc: 'AI 对话面板（仅超级管理员可授权）' },
    { key: 'admin',   label: '系统管理', desc: '成员、标签、日志、系统配置' },
  ];

  // 非 super_admin 不可配置 AI 权限
  if (!currentUser || currentUser.role !== 'super_admin') {
    GROUPS = GROUPS.filter(function(g) { return g.key !== 'ai'; });
  }

  return GROUPS.map(function(g) {
    var items = MENU_DEFS.filter(function(md) { return md.group === g.key; });
    if (!items.length) return '';

    var allChecked = items.every(function(md) { return curPerms.indexOf(md.key) !== -1; });
    var someChecked = items.some(function(md) { return curPerms.indexOf(md.key) !== -1; });

    var itemsHTML = items.map(function(md) {
      var checked = curPerms.indexOf(md.key) !== -1;
      return '<label class="rp-menu-item">' +
        '<input type="checkbox" class="rp-menu-cb" data-key="' + md.key + '" ' +
               (checked ? 'checked' : '') + ' onchange="markSettingsDirty()">' +
        '<span class="rp-menu-item-label">' + escHtml(md.label) + '</span>' +
      '</label>';
    }).join('');

    return '<div class="rp-group">' +
      '<div class="rp-group-header">' +
        '<label class="rp-group-toggle">' +
          '<input type="checkbox" class="rp-group-cb" data-group="' + g.key + '" ' +
                 (allChecked ? 'checked' : (someChecked ? '' : '')) +
                 ' onchange="togglePermGroup(this, \'' + g.key + '\')">' +
          '<span class="rp-group-label">' + escHtml(g.label) + '</span>' +
        '</label>' +
        '<span class="rp-group-desc">' + escHtml(g.desc) + '</span>' +
      '</div>' +
      '<div class="rp-group-items">' + itemsHTML + '</div>' +
    '</div>';
  }).join('');
}

window.closeRolesPanel = function() {
  var doClose = function() {
    document.getElementById('roles-side-panel').classList.remove('open');
    window._editingMemberId = null;
  };
  if (window.settingsDirty) {
    showDirtyGuard(function() { clearSettingsDirty(); doClose(); });
    return;
  }
  doClose();
};

window.togglePermGroup = function(groupCb, groupKey) {
  var checked = groupCb.checked;
  groupCb.indeterminate = false;
  var cbs = document.querySelectorAll('.rp-menu-cb[data-key]');
  var MENU_DEFS = window._MENU_DEFS || [];
  var groupKeys = MENU_DEFS.filter(function(md) { return md.group === groupKey; }).map(function(md) { return md.key; });
  cbs.forEach(function(cb) {
    if (groupKeys.indexOf(cb.getAttribute('data-key')) !== -1) {
      cb.checked = checked;
    }
  });
  markSettingsDirty();
};

window.setAllRolePerms = function(checked) {
  document.querySelectorAll('.rp-menu-cb, .rp-group-cb').forEach(function(cb) {
    cb.checked = checked;
    cb.indeterminate = false;
  });
  markSettingsDirty();
};

window.saveRolesPanel = async function() {
  var memberId = window._editingMemberId;
  if (!memberId) return;
  var m = state.members.find(function(x) { return x.id === memberId; });
  if (!m) return;

  var newRole = document.getElementById('rp-role').value;
  var newPerms = Array.from(document.querySelectorAll('.rp-menu-cb:checked')).map(function(cb) { return cb.getAttribute('data-key'); });

  var updates = {};
  if (newRole !== m.role) updates.role = newRole;
  updates.menu_perms = newPerms;

  var resp = await sb.from('members').update(updates).eq('id', memberId);
  if (resp.error) { if (typeof toast === 'function') toast('保存失败：' + resp.error.message, 'error'); return; }

  m.role = newRole;
  m.menuPerms = newPerms;

  if (currentUser && currentUser.id === memberId) {
    currentUser.role = newRole;
    currentUser.menuPerms = newPerms;
    localStorage.setItem('pm_session', JSON.stringify(currentUser));
    if (typeof applyMenuPerms === 'function') applyMenuPerms();
  }

  if (typeof pushNotification === 'function' && currentUser && currentUser.id !== memberId) {
    pushNotification({
      recipientId: memberId, type: 'perm_changed',
      title: '你的菜单权限已变更',
      body: (currentUser && currentUser.name || '管理员') + ' 重新配置了你的系统访问权限',
      navType: 'member', navId: memberId
    });
  }

  if (typeof logAction === 'function') logAction('修改权限', '修改了「' + m.name + '」的角色/菜单权限');
  if (typeof toast === 'function') toast('✓ 已更新「' + m.name + '」的权限', 'success');
  clearSettingsDirty();
  closeRolesPanel();
  document.getElementById('roles-page-list').innerHTML = buildRolesListHTML();
  if (window.lucide) window.lucide.createIcons();
};

// ═══════════════════════════════════════════════════════════════
// 4.7 团队 - 标签管理
// ═══════════════════════════════════════════════════════════════
window.renderTagsPage = function(wrap) {
  var isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
  wrap.innerHTML =
    '<div class="settings-page-header" style="display:flex;justify-content:space-between;align-items:flex-start">' +
      '<div>' +
        '<div class="settings-page-title">标签管理</div>' +
        '<div class="settings-page-desc">创建和管理任务标签</div>' +
      '</div>' +
      (isAdmin ? '<button class="btn btn-primary" onclick="showAddTagForm()"><i data-lucide="plus" style="width:14px;height:14px"></i>新建标签</button>' : '') +
    '</div>' +
    '<div id="add-tag-form" style="display:none;margin-bottom:8px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);gap:8px;align-items:center">' +
      '<input class="settings-form-input" id="new-tag-name" placeholder="输入标签名称" onkeydown="if(event.key===\'Enter\')submitAddTagInline()" style="flex:1;height:34px">' +
      '<button class="btn btn-primary btn-sm" onclick="submitAddTagInline()">添加</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="hideAddTagForm()">取消</button>' +
    '</div>' +
    '<div class="settings-section" style="padding:0">' +
      '<div id="tags-page-list">' + buildTagsListHTML() + '</div>' +
    '</div>';
  // 初始隐藏添加表单
  document.getElementById('add-tag-form').style.display = 'none';
  if (window.lucide) window.lucide.createIcons();
};

function buildTagsListHTML() {
  var tags = state.globalTags || state.tags || [];
  var isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin');
  if (tags.length === 0) {
    return '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">暂无标签，点击上方按钮创建</div>';
  }
  var TAG_COLORS = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#f97316'];
  return tags.map(function(tg) {
    var color = TAG_COLORS[(tg.paletteIdx || 0) % TAG_COLORS.length];
    return '<div class="settings-row" style="padding:12px 20px;border-top:1px solid var(--border-subtle)">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
        '<span style="font-size:13px;font-weight:500">' + escHtml(tg.name) + '</span>' +
      '</div>' +
      (isAdmin ? '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-ghost btn-sm" onclick="editTagFromSettings(\'' + tg.id + '\')"><i data-lucide="pencil" style="width:12px;height:12px"></i>编辑</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="deleteTagFromSettings(\'' + tg.id + '\')" style="color:var(--red)"><i data-lucide="trash-2" style="width:12px;height:12px"></i>删除</button>' +
      '</div>' : '') +
    '</div>';
  }).join('');
}

window.showAddTagForm = function() {
  var form = document.getElementById('add-tag-form');
  if (form) { form.style.display = 'flex'; }
  var inp = document.getElementById('new-tag-name');
  if (inp) { inp.value = ''; setTimeout(function() { inp.focus(); }, 50); }
};

window.hideAddTagForm = function() {
  var form = document.getElementById('add-tag-form');
  if (form) { form.style.display = 'none'; }
};

window.submitAddTagInline = async function() {
  var inp = document.getElementById('new-tag-name');
  if (!inp) return;
  var name = inp.value.trim();
  if (!name) { toast('请输入标签名称', 'warning'); return; }
  try {
    var newTag = { id: uid(), name: name, paletteIdx: (state.globalTags || []).length % 8 };
    await syncTag(newTag);
    state.globalTags.push(newTag);
    inp.value = '';
    // 刷新标签列表
    var listEl = document.getElementById('tags-page-list');
    if (listEl) { listEl.innerHTML = buildTagsListHTML(); }
    if (window.lucide) window.lucide.createIcons();
    toast('标签已添加', 'success');
    logAction('添加标签', '新建标签「' + name + '」');
  } catch(err) {
    toast('添加失败：' + (err.message || '未知错误'), 'error');
  }
};

window.editTagFromSettings = function(tagId) {
  var tags = state.globalTags || state.tags || [];
  var tg = tags.find(function(t) { return t.id === tagId; });
  if (!tg) return;
  var newName = prompt('编辑标签名称：', tg.name);
  if (!newName || !newName.trim() || newName.trim() === tg.name) return;
  newName = newName.trim();
  tg.name = newName;
  syncTag(tg).then(function() {
    var listEl = document.getElementById('tags-page-list');
    if (listEl) { listEl.innerHTML = buildTagsListHTML(); }
    if (window.lucide) window.lucide.createIcons();
    toast('标签已更新', 'success');
    logAction('编辑标签', '重命名标签为「' + newName + '」');
  }).catch(function(err) {
    toast('更新失败：' + (err.message || '未知错误'), 'error');
  });
};

window.deleteTagFromSettings = function(tagId) {
  var tags = state.globalTags || state.tags || [];
  var tg = tags.find(function(t) { return t.id === tagId; });
  if (!tg) return;
  var usedCount = (state.tasks || []).filter(function(t) { return t.tags && t.tags.indexOf(tagId) !== -1; }).length;
  var msg = usedCount > 0
    ? '标签「' + tg.name + '」被 ' + usedCount + ' 个任务使用，删除后这些任务将失去该标签。确认删除？'
    : '确认删除标签「' + tg.name + '」？';
  if (typeof showConfirm === 'function') {
    showConfirm('删除标签', msg, async function() {
      var errResult = await sb.from('tags').delete().eq('id', tagId);
      if (errResult.error) { toast('删除失败', 'error'); return; }
      state.globalTags = tags.filter(function(t) { return t.id !== tagId; });
      (state.tasks || []).forEach(function(t) { if (t.tags) t.tags = t.tags.filter(function(x) { return x !== tagId; }); });
      var listEl = document.getElementById('tags-page-list');
      if (listEl) { listEl.innerHTML = buildTagsListHTML(); }
      if (window.lucide) window.lucide.createIcons();
      toast('标签已删除', 'success');
      logAction('删除标签', '删除标签「' + tg.name + '」');
    }, {danger: true, confirmLabel: '删除'});
  }
};

// ═══════════════════════════════════════════════════════════════
// 4.8 工作区 - 组织信息
// ═══════════════════════════════════════════════════════════════
window.renderBasicInfoPage = async function(wrap) {
  wrap.innerHTML = '<div class="settings-page-loading">加载中...</div>';
  var org = {};
  try {
    var { data } = await sb.from('finance_config').select('*').eq('id', 'default').maybeSingle();
    if (data) {
      org.company = data.company_name || '';
      org.dept = data.dept_name || '';
      org.base_gross_margin = data.base_gross_margin;
    }
  } catch(e) {}

  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">基础信息</div>' +
      '<div class="settings-page-desc">公司和事业部信息会显示在侧边栏</div>' +
    '</div>' +
    '<div class="settings-section" style="max-width:560px">' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">公司名称</label>' +
        '<input type="text" class="settings-form-input" id="org-company" value="' + escHtml(org.company || '') + '" oninput="markSettingsDirty()">' +
      '</div>' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">事业部名称</label>' +
        '<input type="text" class="settings-form-input" id="org-dept" value="' + escHtml(org.dept || '') + '" oninput="markSettingsDirty()">' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn btn-primary" onclick="saveOrganization()">保存</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-section" style="max-width:560px;margin-top:24px">' +
      '<div class="settings-section-title">资金计划</div>' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">基准毛利率</label>' +
        '<div class="settings-row-desc" style="margin-bottom:8px">用于反算合同额：含税价 × 目标毛利率 ÷ 基准毛利率</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<input class="settings-form-input" id="org-base-margin" type="number" ' +
                 'step="0.01" min="0" max="1" ' +
                 'placeholder="如 0.25" ' +
                 'value="' + (org.base_gross_margin != null ? org.base_gross_margin : '') + '" ' +
                 'style="width:90px;text-align:right" ' +
                 'oninput="markSettingsDirty()">' +
          '<span style="font-size:12px;color:var(--text3)">（小数，如 0.25 = 25%）</span>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn btn-primary btn-sm" onclick="saveBaseMarginSettings()">保存毛利率</button>' +
      '</div>' +
    '</div>';
};

window.saveOrganization = async function() {
  var company = document.getElementById('org-company').value.trim();
  var dept    = document.getElementById('org-dept').value.trim();
  var { error } = await sb.from('finance_config').upsert({ id: 'default', company_name: company, dept_name: dept });
  if (error) { if (typeof toast === 'function') toast('保存失败', 'error'); return; }
  if (typeof finState !== 'undefined') {
    finState.config.company_name = company;
    finState.config.dept_name = dept;
  }
  if (typeof toast === 'function') toast('基础信息已保存', 'success');
  clearSettingsDirty();
  var subEl = document.getElementById('sb-dept-name');
  if (subEl) subEl.textContent = dept || '资金计划模块';
  if (typeof finLogAction === 'function') finLogAction('编辑基础信息', '更新公司/事业部名称');
};

window.saveBaseMarginSettings = async function() {
  var marginEl = document.getElementById('org-base-margin');
  var marginVal = marginEl ? marginEl.value : '';
  var margin = marginVal !== '' ? +marginVal : null;
  var { error } = await sb.from('finance_config').upsert({
    id: 'default',
    base_gross_margin: margin
  });
  if (error) { if (typeof toast === 'function') toast('保存失败：' + error.message, 'error'); return; }
  if (typeof finState !== 'undefined') {
    if (!finState.config) finState.config = {};
    finState.config.base_gross_margin = margin;
  }
  clearSettingsDirty();
  if (typeof toast === 'function') toast('✓ 基准毛利率已保存', 'success');
};

// ═══════════════════════════════════════════════════════════════
// 4.9 工作区 - 集成与 API
// ═══════════════════════════════════════════════════════════════
window.renderIntegrationsPage = function(wrap) {
  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">集成与 API</div>' +
      '<div class="settings-page-desc">配置外部服务的访问凭证</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-section-title">' +
        '<span><i data-lucide="sparkles" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:6px;color:var(--accent)"></i>DeepSeek AI</span>' +
        '<span id="ai-key-status-tag" style="font-size:11px;color:var(--text3)">未配置</span>' +
      '</div>' +
      '<div class="settings-section-desc">配置 API Key 后，AI 助手可使用 DeepSeek V4 模型</div>' +
      '<div class="settings-form-group">' +
        '<label class="settings-form-label">API Key</label>' +
        '<div style="display:flex;gap:8px">' +
          '<input type="password" class="settings-form-input" id="int-deepseek-key" placeholder="sk-..." style="flex:1" oninput="markSettingsDirty()">' +
          '<button class="btn btn-ghost btn-sm" onclick="testDeepseekKey()">测试连接</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-top:4px">使用 AES-GCM 加密后存储</div>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn btn-primary" onclick="saveDeepseekKey()">保存</button>' +
      '</div>' +
    '</div>';
  loadDeepseekKeyStatus();
  if (window.lucide) window.lucide.createIcons();
};

async function loadDeepseekKeyStatus() {
  try {
    var { data } = await sb.from('app_settings').select('value').eq('key', 'deepseek_api_key').maybeSingle();
    var tag = document.getElementById('ai-key-status-tag');
    if (data && data.value) {
      if (tag) { tag.textContent = '✓ 已配置'; tag.style.color = 'var(--green)'; }
      var input = document.getElementById('int-deepseek-key');
      if (input) input.placeholder = '已保存，输入新值可覆盖';
    } else {
      if (tag) { tag.textContent = '未配置'; tag.style.color = 'var(--text3)'; }
    }
  } catch(e) {}
}

window.saveDeepseekKey = async function() {
  var key = document.getElementById('int-deepseek-key').value.trim();
  if (!key) { if (typeof toast === 'function') toast('请输入 API Key', 'warning'); return; }
  if (typeof window._saveAiApiKey === 'function') {
    await window._saveAiApiKey(key);
  } else {
    var { error } = await sb.from('app_settings').upsert({ key: 'deepseek_api_key', value: key }, { onConflict: 'key' });
    if (error) { if (typeof toast === 'function') toast('保存失败', 'error'); return; }
  }
  if (typeof toast === 'function') toast('✓ API Key 已保存', 'success');
  clearSettingsDirty();
  document.getElementById('int-deepseek-key').value = '';
  loadDeepseekKeyStatus();
};

window.testDeepseekKey = async function() {
  var key = document.getElementById('int-deepseek-key').value.trim();
  if (!key) { if (typeof toast === 'function') toast('请先输入 Key', 'warning'); return; }
  if (typeof toast === 'function') toast('正在测试连接...', 'info');
  try {
    var resp = await fetch('https://api.deepseek.com/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (resp.ok) {
      if (typeof toast === 'function') toast('✓ 连接成功，Key 有效', 'success');
    } else {
      if (typeof toast === 'function') toast('连接失败：' + resp.status + ' ' + (resp.statusText || ''), 'error');
    }
  } catch(e) {
    if (typeof toast === 'function') toast('连接失败：' + e.message, 'error');
  }
};

// ═══════════════════════════════════════════════════════════════
// 4.10 系统 - 操作日志
// ═══════════════════════════════════════════════════════════════
window._logsCache = [];
window._logsFilterType = '';
window._logsFilterDateFrom = '';
window._logsFilterDateTo = '';
window._logsCollapsed = {}; // { typeKey: true/false }

// 操作类型分类定义（与 pm-logs.js LOG_CATS 对齐）
var LOG_CATS_DEF = {
  task:    { label: '任务',   icon: 'list-checks',        color: '#3b82f6', keys: ['添加任务','编辑任务','完成任务','删除任务','添加子任务','完成子任务','删除子任务','设置前置条件','移除前置条件','AI创建任务','AI更新任务'] },
  project: { label: '项目',   icon: 'folder-kanban',      color: '#8b5cf6', keys: ['添加项目','编辑项目','删除项目','添加模块','编辑模块','删除模块','添加标签','编辑标签','删除标签'] },
  gantt:   { label: '甘特图', icon: 'chart-no-axes-gantt', color: '#e67e22', keys: ['甘特图调整','gantt_adjust'] },
  finance: { label: '资金',   icon: 'landmark',           color: '#0ea5e9', keys: ['新增收款记录','更新收款记录','删除收款记录','新增付款明细','更新付款明细','删除付款明细','新增实际收款','更新实际收款','删除实际收款','新增实际支付','更新实际支付','删除实际支付','新增对上合同','更新对上合同','删除对上合同','新增对下合同','更新对下合同','删除对下合同','新增客户','更新客户','删除客户','新增供应商','更新供应商','删除供应商','导出资金报表','编辑月度计划','编辑完成情况','编辑基础信息','更新合同状态','保存收款偏差分析','保存付款偏差分析','导入客户库','导出客户库'] },
  member:  { label: '成员',   icon: 'users',              color: '#ec4899', keys: ['添加成员','删除成员','修改角色','修改密码','重置密码','配置菜单权限','修改权限','AI修改成员权限'] },
  login:   { label: '登录',   icon: 'log-in',              color: '#6b7280', keys: ['用户登录'] }
};

// 构建 action → catKey 快速查找表
var _LOG_ACTION_MAP = {};
Object.keys(LOG_CATS_DEF).forEach(function(catKey) {
  var cat = LOG_CATS_DEF[catKey];
  cat.keys.forEach(function(k) { _LOG_ACTION_MAP[k] = catKey; });
});

function classifyLogType(action) {
  action = (action || '').trim();
  if (!action) return '__empty__';
  // 精确匹配
  if (_LOG_ACTION_MAP[action]) return _LOG_ACTION_MAP[action];
  // 模糊匹配：检查是否包含分类关键字
  if (action.indexOf('任务') !== -1 || action.indexOf('子任务') !== -1 || action.indexOf('前置') !== -1) return 'task';
  if (action.indexOf('项目') !== -1 || action.indexOf('模块') !== -1 || action.indexOf('标签') !== -1) return 'project';
  if (action.indexOf('甘特') !== -1 || action.indexOf('gantt') !== -1) return 'gantt';
  if (action.indexOf('收款') !== -1 || action.indexOf('付款') !== -1 || action.indexOf('合同') !== -1 || action.indexOf('客户') !== -1 || action.indexOf('供应商') !== -1 || action.indexOf('资金') !== -1 || action.indexOf('月度') !== -1 || action.indexOf('完成情况') !== -1 || action.indexOf('基础信息') !== -1 || action.indexOf('偏差') !== -1 || action.indexOf('实际') !== -1) return 'finance';
  if (action.indexOf('成员') !== -1 || action.indexOf('角色') !== -1 || action.indexOf('密码') !== -1 || action.indexOf('权限') !== -1 || action.indexOf('菜单') !== -1) return 'member';
  if (action.indexOf('登录') !== -1) return 'login';
  // 未知类型：直接用 action 本身作为 key，这样至少能看到原始值
  return '__raw__|' + action;
}

function getLogCatInfo(action) {
  var key = classifyLogType(action);
  if (LOG_CATS_DEF[key]) return LOG_CATS_DEF[key];
  // 原始 action 值作为标签（去掉 __raw__| 前缀）
  if (key.indexOf('__raw__|') === 0) {
    return { label: key.slice(8), icon: 'scroll-text', color: '#9ca3af', _raw: true };
  }
  return { label: '其他', icon: 'scroll-text', color: '#9ca3af' };
}

window.renderLogsPage = async function(wrap) {
  wrap.innerHTML = '<div class="settings-page-header" style="display:flex;justify-content:space-between;align-items:flex-start">' +
    '<div>' +
      '<div class="settings-page-title">操作日志</div>' +
      '<div class="settings-page-desc">查看关键操作记录</div>' +
    '</div>' +
    '<button class="btn btn-ghost btn-sm" onclick="loadLogsPage()">' +
      '<i data-lucide="refresh-cw" style="width:12px;height:12px"></i>刷新' +
    '</button>' +
  '</div>' +
  '<div class="settings-section" style="padding:14px 16px;margin-bottom:12px">' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<input type="text" class="settings-form-input" placeholder="搜索详情..." id="log-search" style="width:200px;height:34px">' +
      '<select class="settings-form-select" id="log-type-filter" style="width:130px">' +
        '<option value="">全部类型</option>' +
      '</select>' +
      '<select class="settings-form-select" id="log-user-filter" style="width:140px">' +
        '<option value="">全部用户</option>' +
        state.members.map(function(m) { return '<option value="' + m.id + '">' + escHtml(m.name) + '</option>'; }).join('') +
      '</select>' +
      '<input type="date" class="settings-form-input" id="log-date-from" style="width:130px;height:34px" title="开始日期">' +
      '<span style="color:var(--text3);font-size:12px">至</span>' +
      '<input type="date" class="settings-form-input" id="log-date-to" style="width:130px;height:34px" title="结束日期">' +
      '<button class="btn btn-primary btn-sm" onclick="onLogsQuery()" style="margin-left:auto">查询</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="resetLogsFilters()">重置</button>' +
    '</div>' +
  '</div>' +
  '<div id="logs-page-list" style="font-size:12.5px"><div style="padding:40px;text-align:center;color:var(--text3)">加载中...</div></div>';

  await loadLogsPage();
  if (window.lucide) window.lucide.createIcons();
};

window.loadLogsPage = async function() {
  var listEl = document.getElementById('logs-page-list');
  if (!listEl) return;
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  var { data, error } = await sb.from('logs')
    .select('*').gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false }).limit(500);
  if (error) { listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--red)">加载失败：' + escHtml(error.message) + '</div>'; return; }
  window._logsCache = data || [];
  populateLogTypeFilter();
  renderLogsTable();
};

function populateLogTypeFilter() {
  var sel = document.getElementById('log-type-filter');
  if (!sel) return;
  var typeKeys = {};
  (window._logsCache || []).forEach(function(r) {
    var key = classifyLogType(r.action);
    if (!typeKeys[key]) {
      typeKeys[key] = getLogCatInfo(r.action);
    }
  });
  var curVal = sel.value;
  sel.innerHTML = '<option value="">全部类型</option>';
  // 按预定义顺序排列：任务 → 项目 → 甘特图 → 资金 → 成员 → 登录 → 其他
  var catOrder = ['task','project','gantt','finance','member','login','__other__'];
  catOrder.forEach(function(k) {
    if (!typeKeys[k]) return;
    var info = typeKeys[k];
    var selAttr = curVal === k ? ' selected' : '';
    sel.innerHTML += '<option value="' + k + '"' + selAttr + '>' + info.label + '</option>';
  });
  sel.value = curVal;
}

function renderLogsTable() {
  var listEl = document.getElementById('logs-page-list');
  if (!listEl) return;

  var q = (document.getElementById('log-search') && document.getElementById('log-search').value || '').toLowerCase();
  var uf = (document.getElementById('log-user-filter') && document.getElementById('log-user-filter').value || '');
  var tf = (document.getElementById('log-type-filter') && document.getElementById('log-type-filter').value || '');
  var df = (document.getElementById('log-date-from') && document.getElementById('log-date-from').value || '');
  var dt = (document.getElementById('log-date-to') && document.getElementById('log-date-to').value || '');

  var rows = (window._logsCache || []).filter(function(r) {
    if (uf && r.user_id !== uf) return false;
    if (tf && classifyLogType(r.action) !== tf) return false;
    if (q && (r.action + ' ' + (r.detail || '')).toLowerCase().indexOf(q) === -1) return false;
    if (df || dt) {
      var rowDate = (r.created_at || '').slice(0, 10);
      if (df && rowDate < df) return false;
      if (dt && rowDate > dt) return false;
    }
    return true;
  });

  if (rows.length === 0) {
    listEl.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text3);font-size:13px">' +
      '<div style="font-size:40px;margin-bottom:12px;opacity:.3">&#x1F4CB;</div>无匹配的日志</div>';
    return;
  }

  var html = '<div style="padding:10px 16px;font-size:12px;color:var(--text3);border-bottom:1px solid var(--border)">共 <strong style="color:var(--text)">' + rows.length + '</strong> 条记录</div>';
  html += '<div class="logs-table-wrap"><table class="logs-flat-table">' +
    '<thead><tr>' +
      '<th style="width:160px">时间</th>' +
      '<th style="width:100px">用户</th>' +
      '<th style="width:100px">操作</th>' +
      '<th>详情</th>' +
    '</tr></thead>' +
    '<tbody>';

  rows.forEach(function(r) {
    var m = state.members.find(function(x) { return x.id === r.user_id; });
    var ts = new Date(r.created_at);
    var dateStr = ts.getFullYear() + '-' +
      String(ts.getMonth() + 1).padStart(2, '0') + '-' +
      String(ts.getDate()).padStart(2, '0') + ' ' +
      String(ts.getHours()).padStart(2, '0') + ':' +
      String(ts.getMinutes()).padStart(2, '0') + ':' +
      String(ts.getSeconds()).padStart(2, '0');
    var info = getLogCatInfo(r.action);
    html += '<tr>' +
      '<td><span style="font-family:var(--mono);font-size:11px;color:var(--text3)">' + dateStr + '</span></td>' +
      '<td><span style="font-weight:500">' + (m ? escHtml(m.name) : escHtml(r.user_id || '—')) + '</span></td>' +
      '<td><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:var(--radius-full);background:' + info.color + '15;color:' + info.color + '">' +
        '<i data-lucide="' + info.icon + '" style="width:11px;height:11px"></i>' + escHtml(info.label) +
      '</span></td>' +
      '<td style="color:var(--text2)">' + escHtml(r.detail || r.action || '—') + '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div>';
  listEl.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

window.onLogsQuery = function() {
  renderLogsTable();
};

window.resetLogsFilters = function() {
  var els = ['log-search', 'log-type-filter', 'log-user-filter', 'log-date-from', 'log-date-to'];
  els.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderLogsTable();
};

// ═══════════════════════════════════════════════════════════════
// 4.11 系统 - 数据导出
// ═══════════════════════════════════════════════════════════════
window.renderExportPage = function(wrap) {
  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">数据导出</div>' +
      '<div class="settings-page-desc">导出工作区数据用于备份</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-row">' +
        '<div class="settings-row-info">' +
          '<div class="settings-row-label">导出全部 PM 数据</div>' +
          '<div class="settings-row-desc">包含所有项目、任务、模块、成员和标签的 JSON 备份</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" onclick="exportAllPMData()"><i data-lucide="download" style="width:12px;height:12px"></i>导出 JSON</button>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row-info">' +
          '<div class="settings-row-label">导出资金计划数据</div>' +
          '<div class="settings-row-desc">包含所有月度计划、收付款记录的 Excel 报表</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" onclick="exportAllFinanceData()"><i data-lucide="download" style="width:12px;height:12px"></i>导出 Excel</button>' +
      '</div>' +
    '</div>';
  if (window.lucide) window.lucide.createIcons();
};

window.exportAllPMData = function() {
  var dump = {
    exportAt: new Date().toISOString(),
    version: 'V23',
    members:  state.members,
    projects: state.projects,
    tasks:    state.tasks,
    modules:  state.modules || [],
    tags:     state.globalTags || state.tags || []
  };
  var blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'pm-board-export-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  if (typeof toast === 'function') toast('✓ 导出完成', 'success');
};

window.exportAllFinanceData = function() {
  if (typeof exportAllToExcel === 'function') {
    exportAllToExcel();
  } else {
    if (typeof toast === 'function') toast('Finance 模块未初始化，请先访问资金计划页面', 'warning');
  }
};

// ═══════════════════════════════════════════════════════════════
// 4.12 系统 - 关于
// ═══════════════════════════════════════════════════════════════
window.renderAboutPage = function(wrap) {
  wrap.innerHTML =
    '<div class="settings-page-header">' +
      '<div class="settings-page-title">关于 PM Board</div>' +
      '<div class="settings-page-desc">系统信息与版本</div>' +
    '</div>' +
    '<div class="settings-section">' +
      '<div class="settings-row">' +
        '<div class="settings-row-info"><div class="settings-row-label">版本</div></div>' +
        '<div style="font-family:var(--mono);font-size:13px;color:var(--text2)">V23.0</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row-info"><div class="settings-row-label">技术栈</div></div>' +
        '<div style="font-size:12px;color:var(--text3)">Vanilla JS + Supabase</div>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div class="settings-row-info"><div class="settings-row-label">浏览器</div></div>' +
        '<div style="font-size:12px;color:var(--text3);font-family:var(--mono)">' + escHtml(navigator.userAgent.split(') ')[0] + ')') + '</div>' +
      '</div>' +
    '</div>';
};

// ═══════════════════════════════════════════════════════════════
// §5 ⌘K 命令面板
// ═══════════════════════════════════════════════════════════════
(function setupCommandPalette() {
  document.addEventListener('keydown', function(e) {
    var meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    // 在 input/textarea 中不拦截（允许正常复制粘贴等）
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      openCommandPalette();
    } else if (e.key === ',') {
      e.preventDefault();
      if (typeof switchModule === 'function') switchModule('settings');
    }
  });
})();

window.openCommandPalette = function() {
  if (document.getElementById('cmd-palette')) return;
  var html =
    '<div id="cmd-palette-backdrop" onclick="closeCommandPalette()" ' +
      'style="position:fixed;inset:0;background:rgba(15,23,42,.4);z-index:9998;animation:fadeIn .15s"></div>' +
    '<div id="cmd-palette" ' +
      'style="position:fixed;top:80px;left:50%;transform:translateX(-50%);width:560px;max-width:90vw;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);z-index:9999;animation:cmdPalSlide .2s">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border)">' +
        '<i data-lucide="search" style="width:16px;height:16px;color:var(--text3);flex-shrink:0"></i>' +
        '<input type="text" id="cmd-input" placeholder="跳转设置 / 搜索操作..." autofocus ' +
          'style="flex:1;border:none;outline:none;background:transparent;font-size:14px;color:var(--text);font-family:var(--font)">' +
        '<span style="font-size:10px;color:var(--text3);background:var(--surface2);padding:2px 6px;border-radius:4px;font-family:var(--mono)">ESC</span>' +
      '</div>' +
      '<div id="cmd-list" style="max-height:360px;overflow-y:auto;padding:6px"></div>' +
    '</div>' +
    '<style>@keyframes cmdPalSlide{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}</style>';
  document.body.insertAdjacentHTML('beforeend', html);
  if (window.lucide) window.lucide.createIcons();

  var input = document.getElementById('cmd-input');
  input.addEventListener('input', function() { renderCommandList(input.value); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeCommandPalette(); }
    else if (e.key === 'Enter') {
      var first = document.querySelector('.cmd-item');
      if (first) first.click();
    }
  });
  renderCommandList('');
};

function renderCommandList(q) {
  q = (q || '').trim().toLowerCase();
  var listEl = document.getElementById('cmd-list');
  if (!listEl) return;

  var role = (currentUser && currentUser.role) || 'user';
  var isAdmin = role === 'admin' || role === 'super_admin';
  var isSuper = role === 'super_admin';

  var commands = [];
  var _cmdEffPerms = typeof getEffectiveMenuPerms === 'function' ? getEffectiveMenuPerms() : [];
  window.SETTINGS_PAGES.forEach(function(p) {
    if (p.adminOnly && !isAdmin && !_cmdEffPerms.includes(p.key)) return;
    if (p.superAdminOnly && !isSuper) return;
    commands.push({
      icon: p.icon, label: p.label, hint: '设置 / ' + p.group,
      action: "switchModule('settings');setTimeout(function(){openSettingsPage('" + p.key + "')},50)"
    });
  });
  commands.push({ icon: 'plus',          label: '新建任务',     hint: '操作', action: "openAddTask()" });
  commands.push({ icon: 'folder-plus',   label: '新建项目',     hint: '操作', action: "openAddProject()" });
  commands.push({ icon: 'list-todo',     label: '跳转 项目管理', hint: '导航', action: "switchModule('pm')" });
  commands.push({ icon: 'landmark',      label: '跳转 资金计划', hint: '导航', action: "switchModule('finance')" });
  commands.push({ icon: 'palette',       label: '切换主题',     hint: '操作', action: "toggleTheme()" });
  commands.push({ icon: 'log-out',       label: '退出登录',     hint: '操作', action: "handleLogout()" });

  var filtered = commands.filter(function(c) {
    if (!q) return true;
    return (c.label + ' ' + c.hint).toLowerCase().indexOf(q) !== -1;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px">无匹配结果</div>';
    return;
  }

  listEl.innerHTML = filtered.map(function(c) {
    return '<div class="cmd-item" onclick="closeCommandPalette();' + c.action + '" ' +
      'style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius-sm);cursor:pointer;transition:background .12s" ' +
      'onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'transparent\'">' +
      '<i data-lucide="' + c.icon + '" style="width:16px;height:16px;color:var(--text2);flex-shrink:0"></i>' +
      '<span style="font-size:13px;color:var(--text);flex:1">' + escHtml(c.label) + '</span>' +
      '<span style="font-size:11px;color:var(--text3)">' + escHtml(c.hint) + '</span>' +
    '</div>';
  }).join('');
  if (window.lucide) window.lucide.createIcons();
}

window.closeCommandPalette = function() {
  var p = document.getElementById('cmd-palette');
  var b = document.getElementById('cmd-palette-backdrop');
  if (p) p.remove();
  if (b) b.remove();
};

// ═══════════════════════════════════════════════════════════════
// §2.4 兼容层：旧入口跳转到 Hub
// ═══════════════════════════════════════════════════════════════
(function setupLegacySettingsAliases() {
  function jumpTo(pageKey) {
    return function() {
      if (typeof switchModule === 'function') switchModule('settings');
      setTimeout(function() {
        if (typeof openSettingsPage === 'function') openSettingsPage(pageKey);
      }, 50);
    };
  }

  if (typeof window.openMembersModal === 'function')
    window._origOpenMembersModal = window.openMembersModal;
  if (typeof window.openTagsModal === 'function')
    window._origOpenTagsModal = window.openTagsModal;
  if (typeof window.openRoleManageModal === 'function')
    window._origOpenRoleManageModal = window.openRoleManageModal;
  if (typeof window.openLogsModal === 'function')
    window._origOpenLogsModal = window.openLogsModal;
  if (typeof window.openChangePasswordModal === 'function')
    window._origOpenChangePasswordModal = window.openChangePasswordModal;
  if (typeof window.openSystemConfigModal === 'function')
    window._origOpenSystemConfigModal = window.openSystemConfigModal;

  window.openMembersModal        = jumpTo('members');
  window.openTagsModal           = jumpTo('tags');
  window.openRoleManageModal     = jumpTo('roles');
  window.openLogsModal           = jumpTo('logs');
  window.openChangePasswordModal = jumpTo('security');
  window.openSystemConfigModal   = jumpTo('profile');
})();
