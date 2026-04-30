/* ════════════════════════════════════════════════
 * pm-core.js  —  常量/状态/初始化/数据同步/工具函数/角色/菜单权限/路由
 * ════════════════════════════════════════════════ */

;(function patchPostMessage() {
  const orig = window.postMessage.bind(window);
  window.postMessage = function(data, targetOrigin, transfer) {
    try { orig(data, targetOrigin, transfer); }
    catch(e) { if (e.name !== 'DataCloneError') throw e; }
  };
})();

// ═══════════════════════════════════════════════════════════════
// ⚠ 数据库准备：在 Supabase 中执行以下 SQL 以支持角色功能
//   ALTER TABLE members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
//   -- 然后将某个成员设为管理员：
//   UPDATE members SET role = 'admin' WHERE name = '你的名字';
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'pm_tracker_v4';
const SESSION_MAX = 8 * 3600 * 1000; // Session 最长 8 小时

// ─── Loading helper ───────────────────────────────────────────
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn._origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>处理中...`;
  } else {
    btn.disabled = false;
    if (btn._origHTML !== undefined) btn.innerHTML = btn._origHTML;
  }
}

let currentView = 'today';
let searchQuery = '';
let filterProject = 'all';
let filterStatus = 'all';
let filterAssignee = 'all';
let activeTaskTab = 'basic'; // for edit modal tabs
let editSubtasks = []; // temp store for edit modal
let editTags = []; // temp selected tags in edit modal
let editDeps = []; // temp deps in edit modal
let currentUser = null;

// 1. 填入你的地址和钥匙
const SUPABASE_URL = 'https://rfjrkcclhvuldenpdlye.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_a29IWCUpjugzMqx6VGnNhw_bpU9Grpi'; 

// 2. 初始化 Supabase 客户端
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: {
      getItem:    () => null,
      setItem:    () => {},
      removeItem: () => {}
    }
  }
});

// 3. state 保持不变，但我们现在不从本地存取了
let state = { 
    projects: [], 
    tasks: [], 
    members: [], 
    globalTags: [], 
    burndownLog: {},           // 必须加上，否则图表报错
    recurringLastGenerated: '' // 必须加上，否则周期任务报错
};

const MEMBER_COLORS = ['#2e7dd1','#27ae60','#d4842a','#e74c3c','#8b4de8','#e04080','#0ea57c','#c06020'];
const TAG_PALETTES = [
  {bg:'#edf4fc',color:'#2e7dd1',border:'#a8c9f0'},
  {bg:'#edf8f2',color:'#27ae60',border:'#a3ddba'},
  {bg:'#fef9f2',color:'#d4842a',border:'#edd0a0'},
  {bg:'#fef6f6',color:'#e74c3c',border:'#f7c8c5'},
  {bg:'#f6f0fc',color:'#8b4de8',border:'#d0b8f5'},
  {bg:'#fef4f8',color:'#e04080',border:'#f5b8d4'},
  {bg:'#edf8f4',color:'#0ea57c',border:'#90d8c2'},
  {bg:'#fefaf4',color:'#c06020',border:'#f5c898'},
];
const PROJ_COLORS = ['#2e7dd1','#27ae60','#d4842a','#e74c3c','#8b4de8','#0ea57c','#e04080','#c06020','#a8a59e'];

// ─── Storage ──────────────────────────────────────────────────────────────────


// 【读取】从云端获取最新数据
let _loadingState = false;
let _lastLoadTime = 0;
async function loadState() {
  if (_loadingState) return;
  if (Date.now() - _lastLoadTime < 800) return;
  _loadingState = true;
  try {
    const [tasksRes, projsRes, memsRes, tagsRes] = await Promise.all([
      sb.from('tasks').select('*'),
      sb.from('projects').select('*'),
      sb.from('members').select('*'),
      sb.from('tags').select('*')
    ]);

    if (tasksRes.error || projsRes.error) throw "读取失败";

    // 【关键修改】将数据库的下划线字段映射回代码需要的驼峰字段
    state.tasks = (tasksRes.data || []).map(t => ({
        ...t,
        projectId: t.project_id, // 映射项目ID
        createdAt: t.created_at,
        startDate: t.start_date,
        completedAt: t.completed_at,
        completedBy: t.completed_by  // 映射创建时间
    }));
    
    state.projects = (projsRes.data || []).map(p => ({
        id: p.id, name: p.name,
        colorIdx: p.color_idx || 0,
        members: p.members || []
    }));
    
    state.members = (memsRes.data || []).map(m => ({
        id: m.id,
        name: m.name,
        colorIdx: m.color_idx,
        role: m.role || 'user',
        password: m.password,
        menuPerms: m.menu_perms || null   // null = 使用角色默认权限
    }));

    state.globalTags = (tagsRes.data || []).map(tg => ({
        id: tg.id,
        name: tg.name,
        paletteIdx: tg.palette_idx // 映射标签调色盘索引
    }));
    
    // 如果云端没有标签，初始化默认标签
    if (!state.globalTags.length) {
        state.globalTags = [
            {id:'tag1',name:'设计',paletteIdx:0},{id:'tag2',name:'开发',paletteIdx:1},
            {id:'tag3',name:'运营',paletteIdx:2},{id:'tag4',name:'测试',paletteIdx:3},
        ];
    }
    
    // 角色过滤：普通用户只看自己相关的任务和项目
    if (currentUser && !isAdmin()) {
      state.tasks = state.tasks.filter(t => t.assignee === currentUser.id);
      // 只展示：(a) 自己是成员 (b) 自己是负责人 (c) 有自己的任务
      const visiblePids = new Set(state.tasks.map(t => t.projectId).filter(Boolean));
      state.projects = state.projects.filter(p =>
(p.members || []).includes(currentUser.id) ||
        visiblePids.has(p.id)
      );
    }

    updateBadges();
    if (!window._ganttSaving) render();
  } catch (err) {
    console.error(err);
    toast("获取数据失败");
  } finally {
    _loadingState = false;
    _lastLoadTime = Date.now();
  }
}

// 【保存】将单个任务的修改推送到云端
async function syncTask(t) {
  // 准备发送到数据库的数据，确保字段名是下划线形式
  const dbData = {
    ...t,
    project_id: t.projectId || t.project_id,
    created_at: t.createdAt || t.created_at,
    start_date: t.startDate || t.start_date,
    completed_at: t.completedAt || t.completed_at,
    completed_by: t.completedBy || t.completed_by
  };
  // 移除 JS 内部使用的驼峰属性，保持数据库整洁
  delete dbData.projectId;
  delete dbData.createdAt;
  delete dbData.startDate;
  delete dbData.completedAt;
  delete dbData.completedBy;

  const { error } = await sb.from('tasks').upsert(dbData);
  if (error) {
      console.error(error);
      toast("任务保存失败");
  }
}


async function handleCustomLogin() {
    const name = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-err');

    // 在数据库 members 表中查找匹配的账号和密码
    const { data: member, error } = await sb
        .from('members')
        .select('*')
        .eq('name', name)
        .eq('password', pass)
        .single();

    if (error || !member) {
        errEl.textContent = "账号或密码错误，或您尚未被添加为成员";
        return;
    }

    // 登录成功，记录状态并隐藏登录框
    currentUser = member;
    localStorage.setItem('pm_login_session', JSON.stringify(member));
    document.getElementById('login-screen').classList.add('hidden');
    initBoard(); 
}



// ─── 核心修复：确保项目及成员列表同步到云端 ───
async function syncProject(proj) {
  // 必须显式映射：JS 的驼峰命名 -> 数据库的下划线命名
  const dbData = {
    id: proj.id,
    name: proj.name,
    color_idx: proj.colorIdx || 0,
    members: proj.members || [],
  };

  const { error } = await sb.from('projects').upsert(dbData);
  
  if (error) {
    console.error("项目同步失败:", error);
    toast("保存失败，请检查数据库 members 字段是否为 JSONB 类型");
    return false;
  }
  return true;
}

// ─── 核心修复：处理“选择成员”并触发保存 ───
async function addMemberToProject(projId) {
  const sel = document.getElementById('proj-add-member-sel');
  if (!sel || !sel.value) {
    toast("请先选择一名成员");
    return;
  }

  const p = state.projects.find(x => x.id === projId);
  if (!p) return;

  // 初始化成员数组（防止为 null）
  if (!p.members) p.members = [];

  // 防止重复添加
  if (!p.members.includes(sel.value)) {
    p.members.push(sel.value);
    
    // 【关键】执行异步同步
    const success = await syncProject(p);
    
    if (success) {
      toast("成员添加成功");
      // 重新渲染弹窗以显示新加入的成员
      openEditProject(projId); 
    }
  } else {
    toast("该成员已在项目中");
  }
}

async function removeMemberFromProject(projId, memberId) {
    const p = state.projects.find(x => x.id === projId);
    if (!p) return;

    p.members = (p.members || []).filter(id => id !== memberId);
    await syncProject(p); // 调用同步
    openEditProject(projId);
    toast('成员已移除');
}

// 同步项目到云端
async function syncProject(proj) {
  // 注意：数据库字段是 color_idx，JS 传入的是 colorIdx，需做个转换
  const { error } = await sb.from('projects').upsert({
    id: proj.id,
    name: proj.name,
    color_idx: proj.colorIdx || 0, // 适配 SQL 里的下划线命名
    members: proj.members || []
  });
  if (error) { console.error(error); toast("项目同步失败"); }
}

// 通用的云端删除函数
async function deleteFromCloud(tableName, id) {
  const { error } = await sb.from(tableName).delete().eq('id', id);
  if (error) {
    console.error(`删除 ${tableName} 失败:`, error);
    toast("同步删除失败");
    return false;
  }
  return true;
}

// 同步成员到云端
async function syncMember(member) {
  const { error } = await sb.from('members').upsert({
    id: member.id,
    name: member.name,
    color_idx: member.colorIdx || 0
  });
  if (error) toast("成员同步失败");
}



// 同步标签到云端
async function syncTag(tag) {
  const { error } = await sb.from('tags').upsert({
    id: tag.id,
    name: tag.name,
    palette_idx: tag.paletteIdx // 转换为数据库需要的下划线
  });
  if (error) toast("标签同步失败");
}



function seedData() {
  state.projects = [
    {id:'p1',name:'品牌官网改版',members:[],colorIdx:0},
    {id:'p2',name:'Q2营销活动',members:[],colorIdx:1},
    {id:'p3',name:'新功能上线',members:[],colorIdx:2},
  ];
  state.members = [
    {id:'m1',name:'张三',colorIdx:0},
    {id:'m2',name:'李四',colorIdx:1},
    {id:'m3',name:'王五',colorIdx:2},
  ];
  const d = n => { const dd = new Date(); dd.setDate(dd.getDate()+n); return dd.toISOString().slice(0,10); };
  const ct = n => { const dd = new Date(); dd.setDate(dd.getDate()+n); return dd.toISOString().slice(0,10); };
  state.tasks = [
    {id:'t1',title:'确认设计稿终稿，发给开发',projectId:'p1',due:d(-1),priority:'紧急',status:'doing',logs:[],done:false,tags:['tag1'],subtasks:[{id:'s1',title:'整理设计资产',done:true},{id:'s2',title:'导出切图',done:false}],dependencies:[],assignee:'m1',createdAt:ct(-7),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t2',title:'和市场对齐活动预算',projectId:'p2',due:d(0),priority:'重要',status:'todo',logs:[],done:false,tags:['tag3'],subtasks:[],dependencies:[],assignee:'m2',createdAt:ct(-3),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t3',title:'跟进前端开发进度',projectId:'p3',due:d(1),priority:'紧急',status:'doing',logs:[{date:d(-2),text:'前端说本周五可以提测'}],done:false,tags:['tag2'],subtasks:[],dependencies:['t1'],assignee:'m1',createdAt:ct(-5),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t4',title:'撰写活动策划方案',projectId:'p2',due:d(2),priority:'重要',status:'todo',logs:[],done:false,tags:['tag3'],subtasks:[{id:'s3',title:'竞品分析',done:false},{id:'s4',title:'预算规划',done:false},{id:'s5',title:'执行时间表',done:false}],dependencies:[],assignee:'m3',createdAt:ct(-2),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t5',title:'用户访谈结果整理',projectId:'p1',due:d(5),priority:'普通',status:'todo',logs:[],done:false,tags:[],subtasks:[],dependencies:[],assignee:'m2',createdAt:ct(-1),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t6',title:'提交上线申请单',projectId:'p3',due:d(7),priority:'重要',status:'waiting',logs:[],done:false,tags:[],subtasks:[],dependencies:['t3'],assignee:'m3',createdAt:ct(-1),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t7',title:'评审UI交互方案',projectId:'p1',due:d(-3),priority:'紧急',status:'done',logs:[],done:true,tags:['tag1'],subtasks:[],dependencies:[],assignee:'m1',createdAt:ct(-10),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t8',title:'每周进度汇报',projectId:'p3',due:d(7),priority:'普通',status:'todo',logs:[],done:false,tags:[],subtasks:[],dependencies:[],assignee:'m2',createdAt:ct(-1),recurring:{enabled:true,freq:'weekly',dayOfWeek:1}},
  ];
}

// ─── Recurring tasks ──────────────────────────────────────────────────────────
function checkRecurringTasks() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  if (state.recurringLastGenerated === todayStr) return;
  const dow = today.getDay(); // 0=Sun,1=Mon,...
  const recurringTasks = state.tasks.filter(t => t.recurring && t.recurring.enabled && t.recurring.freq === 'weekly');
  if (recurringTasks.length === 0) { state.recurringLastGenerated = todayStr; return; }
  let generated = 0;
  recurringTasks.forEach(t => {
    const targetDow = t.recurring.dayOfWeek || 1;
    if (dow !== targetDow) return;
    // Check if we already have an instance created today
    const alreadyExists = state.tasks.some(x => x.recurringFrom === t.id && x.createdAt === todayStr);
    if (alreadyExists) return;
    // Calculate next due (same day of week, 7 days from today)
    const due = new Date(today); due.setDate(due.getDate() + 7);
    state.tasks.push({
      id: uid(), title: t.title,
      projectId: t.projectId, due: due.toISOString().slice(0,10),
      priority: t.priority, status: 'todo', logs: [], done: false,
      tags: [...(t.tags||[])], subtasks: [], dependencies: [],
      assignee: t.assignee, createdAt: todayStr,
      recurring: {enabled:false, freq:'weekly', dayOfWeek:1},
      recurringFrom: t.id,
    });
    generated++;
  });
  state.recurringLastGenerated = todayStr;
  if (generated > 0) toast(`已自动生成 ${generated} 个周期性任务`);
}

// ─── Burndown snapshot ────────────────────────────────────────────────────────
function recordBurndownSnapshot() {
  const today = new Date().toISOString().slice(0,10);
  const record = (key, remaining) => {
    if (!state.burndownLog[key]) state.burndownLog[key] = [];
    const log = state.burndownLog[key];
    if (!log.length || log[log.length-1].date !== today) {
      log.push({date: today, remaining});
      if (log.length > 60) log.splice(0, log.length - 60);
    }
  };
  record('all', state.tasks.filter(t=>!t.done).length);
  state.projects.forEach(p => record(p.id, state.tasks.filter(t=>t.projectId===p.id&&!t.done).length));
}

// ─── Export CSV ──────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['任务名称','所属项目','负责人','截止日期','优先级','状态','标签','子任务数','子任务完成','前置依赖数','是否完成','周期性'];
  const rows = [headers];
  state.tasks.forEach(t => {
    const tagNames = (t.tags||[]).map(tid => { const tg = state.globalTags.find(x=>x.id===tid); return tg?tg.name:''; }).filter(Boolean).join('|');
    const assigneeName = t.assignee ? (state.members.find(m=>m.id===t.assignee)||{name:t.assignee}).name : '';
    const subtotalDone = (t.subtasks||[]).filter(s=>s.done).length;
    rows.push([
      t.title, projName(t.projectId), assigneeName, t.due, t.priority,
      statusInfo(t.status).lbl, tagNames,
      (t.subtasks||[]).length, subtotalDone,
      (t.dependencies||[]).length,
      t.done?'是':'否',
      (t.recurring&&t.recurring.enabled)?'是':'否'
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pm_tasks_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('CSV 已导出');
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function uid() { return 'i' + Date.now() + Math.random().toString(36).slice(2,6); }
function priorityOrder(p) { return {'紧急':0,'重要':1,'普通':2}[p]??3; }

function urgencyOf(t) {
  if (t.done) return 99;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(t.due); due.setHours(0,0,0,0);
  const diff = Math.round((due-today)/86400000);
  if (diff<0) return 0; if (diff===0) return 0; if (diff<=3) return 1; if (diff<=7) return 2; return 3;
}

// --- 1. 更新右上角用户信息（含角色徽章）---
// ─── 角色工具函数 ────────────────────────────────────────────────────────────
const ROLE_LEVELS = { super_admin: 3, admin: 2, user: 1 };
const ROLE_LABELS = { super_admin: '超级管理员', admin: '管理员', user: '普通用户' };

function getRoleLevel(role) { return ROLE_LEVELS[role] || 1; }
function canManageRole(operatorRole, targetRole) {
  // 只能管理比自己低级的角色
  return getRoleLevel(operatorRole) > getRoleLevel(targetRole);
}
function isSuperAdmin() { return currentUser && currentUser.role === 'super_admin'; }
function isAdmin()      { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin'); }

// 菜单项定义
const MENU_DEFS = [
  { key: 'today',     label: '今日看板',   icon: '○', required: true  },  // 必须项
  { key: 'tasks',     label: '全部任务',   icon: '≡', required: true  },  // 必须项
  { key: 'charts',    label: '数据统计',   icon: '◉', required: false },
  { key: 'gantt',     label: '甘特图',     icon: '▦', required: false },
  { key: 'projects',  label: '项目列表',   icon: '□', required: false },
  { key: 'add_task',  label: '快速添加任务', icon: '+', required: false },
  { key: 'members',   label: '成员管理',   icon: '👤', adminOnly: true },
  { key: 'tags',      label: '标签管理',   icon: '🏷', adminOnly: true },
  { key: 'roles',     label: '角色权限',   icon: '🔐', adminOnly: true },
  { key: 'logs',      label: '操作日志',   icon: '📋', required: false },
  { key: 'pm',        label: '项目管理',   icon: '□', required: true  },
  { key: 'finance',   label: '资金计划',   icon: '💰', required: false },
  { key: 'system_config', label: '系统配置', icon: '⚙', adminOnly: true },
];

// 根据角色返回默认可见菜单
function getDefaultMenuPerms(role) {
  if (role === 'super_admin') return MENU_DEFS.map(m => m.key);
  if (role === 'admin') return MENU_DEFS.filter(m => !m.superOnly).map(m => m.key);
  // 普通用户默认：PM 模块、今日看板、全部任务、日志（无资金计划）
  return ['pm', 'today', 'tasks', 'logs'];
}

// 获取当前用户实际菜单权限
function getEffectiveMenuPerms() {
  if (!currentUser) return [];
  // super_admin 始终拥有全部权限，不受配置影响
  if (currentUser.role === 'super_admin') return MENU_DEFS.map(m => m.key);
  // 有自定义配置则用自定义
  if (currentUser.menuPerms && currentUser.menuPerms.length > 0) return currentUser.menuPerms;
  // 否则用角色默认
  return getDefaultMenuPerms(currentUser.role);
}

// 应用菜单权限到侧边栏和顶部 Tab
function applyMenuPerms() {
  const allowed = getEffectiveMenuPerms();
  document.querySelectorAll('[data-menu-key]').forEach(el => {
    const key = el.getAttribute('data-menu-key');
    el.classList.toggle('menu-hidden', !allowed.includes(key));
  });
  // 顶部模块切换 Tab 的显示/隐藏
  const pmTab = document.getElementById('top-tab-pm');
  const finTab = document.getElementById('top-tab-finance');
  if (pmTab) pmTab.classList.toggle('menu-hidden', !allowed.includes('pm'));
  if (finTab) finTab.classList.toggle('menu-hidden', !allowed.includes('finance'));
  // 如果当前激活的模块被隐藏了，自动切换
  if (activeModule === 'finance' && !allowed.includes('finance')) {
    switchModule('pm');
  }
}

function updateUserInfoUI() {
  if (!currentUser) return;
  const nameEl    = document.getElementById('user-name-top');
  const avatarEl  = document.getElementById('user-avatar-top');
  const roleBadge = document.getElementById('user-role-badge');
  const dropdownName = document.getElementById('dropdown-user-name');
  const dropdownRole = document.getElementById('dropdown-user-role');

  if (nameEl) nameEl.textContent = currentUser.name;
  if (avatarEl) {
    avatarEl.textContent = currentUser.name.slice(0, 1);
    var cIdx = currentUser.colorIdx !== undefined ? currentUser.colorIdx : (currentUser.color_idx || 0);
    avatarEl.style.background = MEMBER_COLORS[cIdx % MEMBER_COLORS.length] || 'var(--accent)';
  }
  var role = currentUser.role || 'user';
  if (roleBadge) {
    roleBadge.textContent = ROLE_LABELS[role] || '普通用户';
    roleBadge.className = 'role-badge role-' + role;
  }
  if (dropdownName) dropdownName.textContent = currentUser.name;
  if (dropdownRole) {
    dropdownRole.textContent = ROLE_LABELS[role] || '普通用户';
    dropdownRole.className = 'role-badge role-' + role;
  }
  // 应用菜单权限
  applyMenuPerms();
}

// --- 2. 退出登录 ---
function handleLogout() {
  showConfirm('退出登录', '确定要退出登录吗？', function() {
    localStorage.removeItem('pm_session');
    window.location.href = 'login.html';
  });
}

// --- 3. 实时同步 ---
function initRealtime() {
  const channel = sb.channel('db-changes');
  channel
    .on('postgres_changes', { event: '*', schema: 'public' }, () => loadState())
    .subscribe();
}

// --- 4. 初始化（本地 Session 校验 + 后台静默角色同步）---
async function init() {
  const saved = localStorage.getItem('pm_session');
  if (!saved) { window.location.href = 'login.html'; return; }

  let parsed;
  try { parsed = JSON.parse(saved); } catch(e) {
    localStorage.removeItem('pm_session');
    window.location.href = 'login.html';
    return;
  }

  // Session 过期检查（8 小时，loginAt 不存在则跳过）
  if (parsed.loginAt && (Date.now() - parsed.loginAt) > SESSION_MAX) {
    localStorage.removeItem('pm_session');
    window.location.href = 'login.html';
    return;
  }

  // Session 有效 → 立即显示主界面，不阻塞
  currentUser = { ...parsed, role: parsed.role || 'user' };

  const loader = document.getElementById('page-loader');
  const layout = document.getElementById('main-layout');
  if (loader) { loader.classList.add('fade-out'); setTimeout(() => loader.style.display = 'none', 350); }
  if (layout) layout.style.display = 'flex';

  updateUserInfoUI();
  restoreTheme();
  applyMenuPerms();
  initRippleEffect();
  restoreSidebarState();
  initKeyboardShortcuts();
  initChartTooltips();
  await loadState();
  recordBurndownSnapshot();
  initRealtime();

  // 后台静默同步角色（不影响页面正常使用）
  silentRoleSync();
}

// 后台静默更新角色信息，失败不影响任何功能
async function silentRoleSync() {
  if (!currentUser || !currentUser.id) return;
  try {
    const { data, error } = await sb
      .from('members')
      .select('id, role, color_idx, password, menu_perms')
      .eq('id', currentUser.id)
      .single();
    if (!error && data) {
      currentUser.role      = data.role       || 'user';
      currentUser.colorIdx  = data.color_idx  || 0;
      currentUser.password  = data.password   || currentUser.password;
      currentUser.menuPerms = data.menu_perms || null;
      localStorage.setItem('pm_session', JSON.stringify(currentUser));
      updateUserInfoUI();
      applyMenuPerms();  // 重新应用菜单权限
    }
  } catch(e) { /* 网络问题忽略，不影响使用 */ }
}

window.onload = init;


function dueInfo(t) {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(t.due); due.setHours(0,0,0,0);
  const diff = Math.round((due-today)/86400000);
  if (diff<0) return {text:`逾期 ${-diff} 天`,cls:'pill-red'};
  if (diff===0) return {text:'今天到期',cls:'pill-red'};
  if (diff<=3) return {text:`${diff} 天后`,cls:'pill-amber'};
  if (diff<=7) return {text:`${diff} 天后`,cls:'pill-green'};
  return {text:t.due,cls:'pill-gray'};
}

function statusInfo(s) {
  return {todo:{lbl:'待启动',cls:'pill-gray'},doing:{lbl:'进行中',cls:'pill-blue'},waiting:{lbl:'待反馈',cls:'pill-amber'},done:{lbl:'已完成',cls:'pill-green'}}[s] || {lbl:s,cls:'pill-gray'};
}

function projName(id) { const p=state.projects.find(x=>x.id===id); return p?p.name:'未分类'; }
function projColor(id) { const p=state.projects.find(x=>x.id===id); return PROJ_COLORS[(p?p.colorIdx||0:0)%PROJ_COLORS.length]; }
function memberName(id) { const m=state.members.find(x=>x.id===id); return m?m.name:id; }
function memberColor(id) { const m=state.members.find(x=>x.id===id); return m?MEMBER_COLORS[m.colorIdx%MEMBER_COLORS.length]:'#a09e98'; }
function memberInitial(id) { const n=memberName(id); return n?n.slice(0,1):'?'; }

function isBlocked(t) {
  if (!t.dependencies||!t.dependencies.length) return false;
  return t.dependencies.some(depId => { const dep=state.tasks.find(x=>x.id===depId); return dep&&!dep.done; });
}

function tagHTML(tagId) {
  const tg = state.globalTags.find(x=>x.id===tagId); if (!tg) return '';
  const p = TAG_PALETTES[tg.paletteIdx%TAG_PALETTES.length];
  return `<span class="pill" style="background:${p.bg};color:${p.color};border-color:${p.border}">${tg.name}</span>`;
}

function subtaskProgress(t) {
  if (!t.subtasks||!t.subtasks.length) return '';
  const done = t.subtasks.filter(s=>s.done).length;
  return `<span class="subtask-progress">${done}/${t.subtasks.length}</span>`;
}

function updateBadges() {
  const active = state.tasks.filter(t=>!t.done);
  document.getElementById('badge-today').textContent = active.length;
  document.getElementById('badge-tasks').textContent = state.tasks.length;
  const now = new Date();
  document.getElementById('sidebar-date-label').textContent = now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});

  const SIDEBAR_FOLD_LIMIT = 5;
  const isExpanded = localStorage.getItem('pm_sidebar_proj_expanded') === 'true';
  const visibleProjects = (isExpanded || state.projects.length <= SIDEBAR_FOLD_LIMIT)
    ? state.projects
    : state.projects.slice(0, SIDEBAR_FOLD_LIMIT);
  const hiddenCount = state.projects.length - SIDEBAR_FOLD_LIMIT;

  let html = '';
  visibleProjects.forEach(p => {
    const cnt = state.tasks.filter(t=>t.projectId===p.id&&!t.done).length;
    const isActive = currentView==='project-'+p.id;
    html += `<div class="nav-proj-wrap" style="position:relative;display:flex;align-items:center">
      <button class="nav-item${isActive?' active':''}" style="flex:1;padding-right:28px" onclick="switchView('project-${p.id}')">
        <i data-lucide="circle" class="nav-icon" style="width:10px;height:10px;color:${PROJ_COLORS[(p.colorIdx||0)%PROJ_COLORS.length]}"></i>
        <span style="flex:1;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${p.name}</span>
        ${cnt?`<span class="nav-badge">${cnt}</span>`:''}
      </button>
      <button class="nav-edit-btn" onclick="openEditProject('${p.id}')" title="编辑" style="position:absolute;right:4px;width:20px;height:20px;border-radius:4px;border:none;background:transparent;cursor:pointer;color:rgba(255,255,255,.45);font-size:12px;display:none;align-items:center;justify-content:center;flex-shrink:0;transition:color .12s" onmouseover="this.style.color='rgba(255,255,255,.8)'" onmouseout="this.style.color='rgba(255,255,255,.45)'"><i data-lucide="pencil" style="width:11px;height:11px"></i></button>
    </div>`;
  });

  if (state.projects.length > SIDEBAR_FOLD_LIMIT) {
    if (!isExpanded) {
      html += `<button class="nav-item" style="font-size:11px;color:rgba(255,255,255,.4);padding-left:16px"
        onclick="localStorage.setItem('pm_sidebar_proj_expanded','true');updateBadges();if(typeof lucide!=='undefined')lucide.createIcons()">
        ＋ 展开另外 ${hiddenCount} 个项目
      </button>`;
    } else {
      html += `<button class="nav-item" style="font-size:11px;color:rgba(255,255,255,.4);padding-left:16px"
        onclick="localStorage.setItem('pm_sidebar_proj_expanded','false');updateBadges();if(typeof lucide!=='undefined')lucide.createIcons()">
        ↑ 收起
      </button>`;
    }
  }

  document.getElementById('sidebar-projects').innerHTML = html;
}

const TOAST_ICONS = { success:'check-circle', error:'x-circle', warning:'alert-triangle', info:'info' };
const _toastQueue = [];
let _toastActive = false;
function toast(msg, type) {
  type = type || 'info';
  _toastQueue.push({msg, type});
  if (!_toastActive) _processToastQueue();
}
function _processToastQueue() {
  if (!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const {msg, type} = _toastQueue.shift();
  const el = document.getElementById('toast');
  el.className = 'toast toast-' + type;
  const icon = TOAST_ICONS[type] || 'info';
  el.innerHTML = `<i data-lucide="${icon}" class="toast-icon"></i> ${msg}`;
  el.classList.add('show');
  if (typeof lucide !== 'undefined') lucide.createIcons();
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(_processToastQueue, 280);
  }, 3000);
}

// ─── A1: Staggered card entrance ──────────────────────────────────────
function staggerEntrance() {
  const cards = document.querySelectorAll('.stagger-in:not(.visible)');
  cards.forEach((card, i) => {
    card.style.animationDelay = (i * 0.04) + 's';
    card.classList.add('visible');
  });
}

// ─── A3: Number scroll animation on stat cards ────────────────────────
function animateStatNumbers() {
  document.querySelectorAll('.stat-val').forEach(el => {
    const num = parseInt(el.textContent, 10);
    if (isNaN(num) || num <= 0) return;
    if (el._animNum === num) return;
    el._animNum = num;
    const duration = 500;
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(num * eased);
      if (progress < 1) requestAnimationFrame(step);
      else { el.textContent = num; el._animNum = null; }
    }
    requestAnimationFrame(step);
  });
}

// ─── A2: Button ripple effect ─────────────────────────────────────────
function initRippleEffect() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', function() { ripple.remove(); });
  });
}

// ─── A4: Sidebar collapse ─────────────────────────────────────────────
function toggleSidebarCollapse() {
  const sidebar = document.getElementById('sidebar-pm');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('pm_sidebar_collapsed', sidebar.classList.contains('collapsed'));
  setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 300);
}

function restoreSidebarState() {
  if (localStorage.getItem('pm_sidebar_collapsed') === 'true') {
    const sidebar = document.getElementById('sidebar-pm');
    if (sidebar) sidebar.classList.add('collapsed');
  }
}

// ─── Theme toggle ──────────────────────────────────────────────
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(isDark ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pm_theme', theme);
}

function restoreTheme() {
  const saved = localStorage.getItem('pm_theme');
  if (saved) { applyTheme(saved); }
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  }
}

// ─── User dropdown ─────────────────────────────────────────────
function toggleUserDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.classList.toggle('open');
}

function closeUserDropdown() {
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.classList.remove('open');
}

document.addEventListener('click', function(e) {
  const dd = document.getElementById('user-dropdown');
  if (dd && dd.classList.contains('open') && !dd.contains(e.target)) {
    dd.classList.remove('open');
  }
});

// ─── View slide transition + render ────────────────────────────
window._viewHistory = [];

function switchView(v) {
  if (currentView && currentView !== v) {
    window._viewHistory.push(currentView);
    if (window._viewHistory.length > 20) window._viewHistory.shift();
  }
  currentView = v;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const setDisplay = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.style.display = val;
  };

  setDisplay('task-search-wrap', v === 'tasks' ? 'flex' : 'none');
  setDisplay('header-add-btn', (v === 'tasks' || v.startsWith('project-')) ? 'block' : 'none');
  setDisplay('header-add-proj-btn', v === 'projects' ? 'block' : 'none');
  setDisplay('header-export-btn', v === 'tasks' ? 'block' : 'none');
  setDisplay('header-gantt-today-btn', v === 'gantt' ? 'block' : 'none');

  searchQuery = '';
  const inp = document.getElementById('task-search-input');
  if (inp) inp.value = '';

  // 筛选条件持久化：切进 tasks 视图时恢复
  if (v === 'tasks') {
    try {
      const saved = JSON.parse(localStorage.getItem('pm_task_filters') || '{}');
      if (saved.filterProject)  filterProject  = saved.filterProject;
      if (saved.filterStatus)   filterStatus   = saved.filterStatus;
      if (saved.filterAssignee) filterAssignee = saved.filterAssignee;
    } catch(e) {}
  }

  updateBadges();
  render();
}

function onSearch(val) { searchQuery=val; render(); }

function render() {
  if (currentView==='today') renderToday();
  else if (currentView==='tasks') renderTaskList();
  else if (currentView==='projects') renderProjects();
  else if (currentView==='charts') renderCharts();
  else if (currentView==='gantt') renderGantt();
  else if (currentView.startsWith('project-')) renderProjectView(currentView.slice(8));
  else renderToday();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  requestAnimationFrame(() => {
    const pane = document.querySelector('.view-pane');
    if (pane) {
      pane.classList.remove('slide-in-left', 'slide-in-right');
      const lastView = window._viewHistory[window._viewHistory.length-1];
      const isBack = lastView && (
        (currentView==='today' && ['tasks','projects','charts','gantt'].indexOf(lastView)>=0) ||
        (currentView==='tasks' && ['projects','charts','gantt'].indexOf(lastView)>=0)
      );
      pane.classList.add(isBack ? 'slide-in-left' : 'slide-in-right');
    }
    staggerEntrance();
    setupChartTipListeners();
    if (currentView === 'today') animateStatNumbers();
  });
}

// ─── Task completion celebration ────────────────────────────────
function celebrateCompletion(x, y) {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  const colors = ['#27ae60','#3cc97a','#0ea57c','#22c99e','#5da0f0','#2e7dd1','#f0ede6','#ffd700'];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 70;
    const cx = Math.cos(angle) * distance;
    const cy = Math.sin(angle) * distance - 20;
    const rot = (Math.random() - 0.5) * 540;
    particle.style.cssText = 'left:' + x + 'px;top:' + y + 'px;background:' + colors[Math.floor(Math.random()*colors.length)]
      + ';--cx:' + cx + 'px;--cy:' + cy + 'px;--rot:' + rot + 'deg;'
      + 'width:' + (4+Math.random()*7) + 'px;height:' + (4+Math.random()*7) + 'px';
    container.appendChild(particle);
    particle.addEventListener('animationend', function() { particle.remove(); });
  }
}

// ─── Keyboard shortcuts ────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // 忽略在输入框中
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key !== 'Escape') return;
    }

    // Ctrl+K / Cmd+K → 切换主题
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggleTheme();
      return;
    }

    switch (e.key) {
      case 'n': case 'N':
        if (activeModule === 'pm') { e.preventDefault(); openAddTask(); }
        break;
      case '/':
        if (activeModule === 'pm') {
          e.preventDefault();
          const search = document.getElementById('task-search-input');
          if (search) { search.focus(); search.select(); }
        }
        break;
      case '1':
        if (activeModule === 'pm') { e.preventDefault(); switchView('today'); }
        break;
      case '2':
        if (activeModule === 'pm') { e.preventDefault(); switchView('tasks'); }
        break;
      case '3':
        if (activeModule === 'pm') { e.preventDefault(); switchView('projects'); }
        break;
      case '4':
        if (activeModule === 'pm') { e.preventDefault(); switchView('charts'); }
        break;
      case '5':
        if (activeModule === 'pm') { e.preventDefault(); switchView('gantt'); }
        break;
      case 'Escape':
        closeModal();
        closeUserDropdown();
        closeShortcutsHelp();
        break;
      case '?':
        if (!e.shiftKey) break;
        e.preventDefault();
        toggleShortcutsHelp();
        break;
    }
  });
}

function toggleShortcutsHelp() {
  const overlay = document.getElementById('shortcuts-overlay');
  if (overlay) overlay.classList.toggle('open');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeShortcutsHelp() {
  const overlay = document.getElementById('shortcuts-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ─── Chart tooltip system ──────────────────────────────────────
function showChartTooltip(el, text) {
  const tip = document.getElementById('chart-tooltip');
  if (!tip) return;
  tip.textContent = text;
  tip.classList.add('show');
}

function hideChartTooltip() {
  const tip = document.getElementById('chart-tooltip');
  if (tip) tip.classList.remove('show');
}

function initChartTooltips() {
  document.addEventListener('mousemove', function(e) {
    const tip = document.getElementById('chart-tooltip');
    if (!tip || !tip.classList.contains('show')) return;
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY - 30) + 'px';
  });
}

function setupChartTipListeners() {
  // Bar chart rows and SVG data points with data-tip attribute
  document.querySelectorAll('[data-tip]').forEach(function(el) {
    if (el._tipBound) return;
    el._tipBound = true;
    el.addEventListener('mouseenter', function() {
      showChartTooltip(el, el.getAttribute('data-tip'));
    });
    el.addEventListener('mouseleave', hideChartTooltip);
  });
}

function showConfirm(title, message, onConfirm, opts) {
  opts = opts || {};
  const danger = opts.danger || false;
  const confirmLabel = opts.confirmLabel || '确认';
  const html = modalHeader(title)
    + '<div class="modal-body"><p style="font-size:13.5px;color:var(--text2);line-height:1.6;margin:0">' + message + '</p></div>'
    + '<div class="modal-footer"><div></div><div style="display:flex;gap:8px">'
    + '<button class="btn btn-ghost" onclick="closeModal()">取消</button>'
    + '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="confirm-ok-btn">' + confirmLabel + '</button>'
    + '</div></div>';
  openModal(html);
  document.getElementById('confirm-ok-btn').addEventListener('click', function() {
    closeModal();
    if (onConfirm) onConfirm();
  });
}

// ─── Today ────────────────────────────────────────────────────────────────────
