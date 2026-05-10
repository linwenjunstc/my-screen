/* ════════════════════════════════════════════════
 * pm-core.js  —  常量/状态/初始化/数据同步/工具函数/角色/菜单权限/路由
 * ════════════════════════════════════════════════ */

// ── MD5 哈希（纯 JS 实现，用于密码加密存储）────
function md5(str) {
  function R(t,n){return(t<<n)|(t>>>(32-n))}
  function F(b,c,d){return(b&c)|((~b)&d)}
  function G(b,c,d){return(b&d)|(c&(~d))}
  function H(b,c,d){return b^c^d}
  function I(b,c,d){return c^(b|(~d))}
  function FF(a,b,c,d,x,s,t){ return R(a+F(b,c,d)+x+t,s)+b }
  function GG(a,b,c,d,x,s,t){ return R(a+G(b,c,d)+x+t,s)+b }
  function HH(a,b,c,d,x,s,t){ return R(a+H(b,c,d)+x+t,s)+b }
  function II(a,b,c,d,x,s,t){ return R(a+I(b,c,d)+x+t,s)+b }
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    if (ch < 0x80) bytes.push(ch);
    else if (ch < 0x800) { bytes.push(0xc0|(ch>>6)); bytes.push(0x80|(ch&0x3f)); }
    else if (ch < 0x10000) { bytes.push(0xe0|(ch>>12)); bytes.push(0x80|((ch>>6)&0x3f)); bytes.push(0x80|(ch&0x3f)); }
    else { bytes.push(0xf0|(ch>>18)); bytes.push(0x80|((ch>>12)&0x3f)); bytes.push(0x80|((ch>>6)&0x3f)); bytes.push(0x80|(ch&0x3f)); }
  }
  var len = bytes.length;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  var bits = len * 8;
  for (var i = 0; i < 8; i++) { bytes.push((bits >>> (i*8)) & 0xff); }
  var words = [];
  for (var i = 0; i < bytes.length; i += 4) {
    words.push(bytes[i] | (bytes[i+1]<<8) | (bytes[i+2]<<16) | (bytes[i+3]<<24));
  }
  var S = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
           5,9,14,20, 5,9,14,20, 5,9,14,20, 5,9,14,20,
           4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
           6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];
  var T = []; for (var i = 1; i <= 64; i++) T[i-1] = Math.floor(Math.abs(Math.sin(i)) * 0x100000000);
  var A=0x67452301, B=0xefcdab89, C=0x98badcfe, D=0x10325476;
  for (var k = 0; k < words.length; k += 16) {
    var a=A, b=B, c=C, d=D;
    for (var i = 0; i < 64; i++) {
      var f, g;
      if (i < 16) { f = F(b,c,d); g = i; }
      else if (i < 32) { f = G(b,c,d); g = (5*i+1)%16; }
      else if (i < 48) { f = H(b,c,d); g = (3*i+5)%16; }
      else { f = I(b,c,d); g = (7*i)%16; }
      var temp = d;
      d = c; c = b;
      b = R(a + f + T[i] + words[k+g], S[i]) + b;
      a = temp;
    }
    A = (A + a) | 0; B = (B + b) | 0; C = (C + c) | 0; D = (D + d) | 0;
  }
  function hex(v) { return ((v>>>0).toString(16)).padStart(8, '0'); }
  return hex(A) + hex(B) + hex(C) + hex(D);
}
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

let currentView = 'dashboard';
let searchQuery = '';
var filterProject = 'all';
var filterStatus = 'all';
var filterAssignee = 'all';
var filterModule = 'all';
var filterTag = 'all';
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
    modules: [],               // V20: 模块列表
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
const STATUS_LABELS = { todo:'待启动', doing:'进行中', blocked:'阻塞中', waiting:'待反馈', done:'已完成' };
window.STATUS_LABELS = STATUS_LABELS;
const PROJ_COLORS = ['#2e7dd1','#27ae60','#d4842a','#e74c3c','#8b4de8','#0ea57c','#e04080','#c06020','#a8a59e'];

/* UI-V18: TASK-UI-10 */
window.renderAvatar = function(member, sizeClass) {
  if (!member) return '';
  sizeClass = sizeClass || '';
  var initial = (member.name || '?').charAt(0).toUpperCase();
  var colorIdx = member.colorIdx || 0;
  var bg = MEMBER_COLORS[colorIdx % MEMBER_COLORS.length];
  return '<span class="avatar ' + sizeClass + '" style="background:' + bg + '" title="' + escHtml(member.name || '') + '">' + escHtml(initial) + '</span>';
};

/* UI-V18: TASK-UI-13 */
window.renderEmptyState = function(opts) {
  opts = opts || {};
  var icon = opts.icon || 'inbox';
  var title = opts.title || '暂无数据';
  var desc = opts.desc || '';
  var action = opts.action || '';
  return '<div class="empty-state">' +
    '<div class="empty-state-icon"><i data-lucide="' + escHtml(icon) + '" style="width:22px;height:22px"></i></div>' +
    '<div class="empty-state-title">' + escHtml(title) + '</div>' +
    (desc ? '<div class="empty-state-desc">' + escHtml(desc) + '</div>' : '') +
    action +
    '</div>';
};

// ─── Storage ──────────────────────────────────────────────────────────────────


// 【读取】从云端获取最新数据
let _loadingState = false;
let _lastLoadTime = 0;
/* UI-V18: TASK-UI-14 */
function renderSkeleton() {
  var content = document.getElementById('main-content');
  if (content && !content.children.length) {
    var card = '<div class="skeleton-card"><div class="skeleton skeleton-line medium"></div><div class="skeleton skeleton-line short thin"></div></div>';
    content.innerHTML = card + card + card + card + card;
  }
}

async function loadState(force) {
  if (_loadingState) return;
  if (!force && Date.now() - _lastLoadTime < 800) return;
  _loadingState = true;
  renderSkeleton();
  try {
    const [tasksRes, projsRes, memsRes, tagsRes, modsRes] = await Promise.all([
      sb.from('tasks').select('*'),
      sb.from('projects').select('*'),
      sb.from('members').select('*'),
      sb.from('tags').select('*'),
      sb.from('modules').select('*').order('sort_order')  // V20: 模块数据
    ]);

    if (tasksRes.error || projsRes.error) throw "读取失败";

    // 【关键修改】将数据库的下划线字段映射回代码需要的驼峰字段
    state.tasks = (tasksRes.data || []).map(t => ({
        ...t,
        projectId: t.project_id, // 映射项目ID
        moduleId: t.module_id,   // V20: 所属模块
        createdAt: t.created_at,
        startDate: t.start_date,
        completedAt: t.completed_at,
        completedBy: t.completed_by,  // 映射创建时间
        assignees: t.assignees || [],  // V20: 多负责人
        description: t.description || ''
    }));

    state.projects = (projsRes.data || []).map(p => ({
        id: p.id, name: p.name,
        colorIdx: p.color_idx || 0,
        members: p.members || [],
        status:   p.status   || 'active',
        deadline: p.deadline || null
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

    // V20: 模块映射
    state.modules = (modsRes.data || []).map(function(m) {
      return Object.assign({}, m, {
        projectId: m.project_id,
        sortOrder: m.sort_order,
        createdAt: m.created_at
      });
    });

    // 如果云端没有标签，初始化默认标签
    if (!state.globalTags.length) {
        state.globalTags = [
            {id:'tag1',name:'设计',paletteIdx:0},{id:'tag2',name:'开发',paletteIdx:1},
            {id:'tag3',name:'运营',paletteIdx:2},{id:'tag4',name:'测试',paletteIdx:3},
        ];
    }
    
    // ── 数据权限过滤（三级） ──
    if (currentUser) {
      if (currentUser.role === 'super_admin') {
        // 超级管理员：查看所有数据，不过滤
      } else if (isAdmin()) {
        // 管理员：查看除超级管理员以外的所有数据
        var superAdminIds = state.members.filter(function(m) { return m.role === 'super_admin'; }).map(function(m) { return m.id; });
        // 隐藏超级管理员账号
        state.members = state.members.filter(function(m) { return m.role !== 'super_admin'; });
        // 过滤超级管理员的任务
        state.tasks = state.tasks.filter(function(t) {
          return !superAdminIds.includes(t.assignee) && !superAdminIds.includes(t.created_by);
        });
        // 过滤仅超级管理员参与的项目
        state.projects = state.projects.filter(function(p) {
          return (p.members || []).some(function(mid) { return !superAdminIds.includes(mid); });
        });
      } else {
        // 普通用户：仅查看自己的任务和相关项目（V20: 检查 assignees 多负责人）
        state.tasks = state.tasks.filter(function(t) { return t.assignee === currentUser.id || (t.assignees || []).includes(currentUser.id); });
        var visiblePids = {};
        state.tasks.forEach(function(t) { if (t.projectId) visiblePids[t.projectId] = true; });
        state.projects = state.projects.filter(function(p) {
          return (p.members || []).includes(currentUser.id) || visiblePids[p.id];
        });
      }
    }

    updateBadges();
    if (!window._ganttSaving) render();
    if (typeof refreshNotifs === 'function') refreshNotifs();
    if (typeof loadCloudNotifications === 'function') await loadCloudNotifications();
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
    module_id: t.moduleId || null,   // V20: 所属模块
    created_at: t.createdAt || t.created_at,
    start_date: t.startDate || t.start_date,
    completed_at: t.completedAt || t.completed_at,
    completed_by: t.completedBy || t.completed_by
  };
  // V20: 确保 assignees / description 同步到数据库
  dbData.assignees = t.assignees || [];
  dbData.description = t.description || '';
  // 移除 JS 内部使用的驼峰属性，保持数据库整洁
  delete dbData.projectId;
  delete dbData.moduleId;
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

// V20: 模块同步
async function syncModule(mod) {
  var { error } = await sb.from('modules').upsert({
    id:          mod.id,
    project_id:  mod.projectId || mod.project_id,
    name:        mod.name,
    description: mod.description || '',
    sort_order:  mod.sortOrder !== undefined ? mod.sortOrder : (mod.sort_order || 0)
  });
  if (error) { console.error('syncModule 失败:', error); toast('模块同步失败：' + error.message, 'error'); return false; }
  return true;
}
window.syncModule = syncModule;

async function handleCustomLogin() {
    const name = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-err');

    // 按用户名查用户，密码对比支持 MD5 哈希 + 明文兼容
    const { data: member, error } = await sb
        .from('members')
        .select('*')
        .eq('name', name)
        .maybeSingle();

    if (error || !member) {
        errEl.textContent = "账号或密码错误，或您尚未被添加为成员";
        return;
    }

    var hashed = md5(pass);
    if (member.password !== hashed && member.password !== pass) {
        errEl.textContent = "账号或密码错误，或您尚未被添加为成员";
        return;
    }

    // 登录成功，记录状态并隐藏登录框
    currentUser = member;
    localStorage.setItem('pm_login_session', JSON.stringify(member));
    document.getElementById('login-screen').classList.add('hidden');
    initBoard(); 
}



// ─── 核心修复：处理”选择成员”并触发保存 ───
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
  // 注意：数据库字段和 JS 命名差异
  const { error } = await sb.from('projects').upsert({
    id: proj.id,
    name: proj.name,
    color_idx: proj.colorIdx || 0,
    members: proj.members || [],
    status:   proj.status   || 'active',
    deadline: proj.deadline || null
  });
  if (error) { console.error(error); toast("项目同步失败"); }
}

window._globalSearch  = '';

window.onGlobalSearch = function(val) {
  window._globalSearch = (val || '').trim().toLowerCase();
  render();
};

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
    {id:'t1',title:'确认设计稿终稿，发给开发',projectId:'p1',due:d(-1),priority:'紧急',status:'doing',logs:[],done:false,tags:['tag1'],subtasks:[{id:'s1',title:'整理设计资产',done:true},{id:'s2',title:'导出切图',done:false}],dependencies:[],assignee:'m1',assignees:[],createdAt:ct(-7),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t2',title:'和市场对齐活动预算',projectId:'p2',due:d(0),priority:'重要',status:'todo',logs:[],done:false,tags:['tag3'],subtasks:[],dependencies:[],assignee:'m2',assignees:[],createdAt:ct(-3),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t3',title:'跟进前端开发进度',projectId:'p3',due:d(1),priority:'紧急',status:'doing',logs:[{date:d(-2),text:'前端说本周五可以提测'}],done:false,tags:['tag2'],subtasks:[],dependencies:['t1'],assignee:'m1',assignees:[],createdAt:ct(-5),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t4',title:'撰写活动策划方案',projectId:'p2',due:d(2),priority:'重要',status:'todo',logs:[],done:false,tags:['tag3'],subtasks:[{id:'s3',title:'竞品分析',done:false},{id:'s4',title:'预算规划',done:false},{id:'s5',title:'执行时间表',done:false}],dependencies:[],assignee:'m3',assignees:[],createdAt:ct(-2),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t5',title:'用户访谈结果整理',projectId:'p1',due:d(5),priority:'普通',status:'todo',logs:[],done:false,tags:[],subtasks:[],dependencies:[],assignee:'m2',createdAt:ct(-1),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t6',title:'提交上线申请单',projectId:'p3',due:d(7),priority:'重要',status:'waiting',logs:[],done:false,tags:[],subtasks:[],dependencies:['t3'],assignee:'m3',assignees:[],createdAt:ct(-1),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
    {id:'t7',title:'评审UI交互方案',projectId:'p1',due:d(-3),priority:'紧急',status:'done',logs:[],done:true,tags:['tag1'],subtasks:[],dependencies:[],assignee:'m1',assignees:[],createdAt:ct(-10),recurring:{enabled:false,freq:'weekly',dayOfWeek:1}},
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
      assignee: t.assignee, assignees: t.assignees || [], createdAt: todayStr,
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
    const assigneeIds = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [t.assignee] : []);
    const assigneeName = assigneeIds.map(function(id) { var m = state.members.find(function(x) { return x.id === id; }); return m ? m.name : id; }).join(', ');
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
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
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
  // ── 项目管理 ──
  { key: 'dashboard', label: '总体概览',   icon: '⬛', group: 'pm' },
  { key: 'today',     label: '今日看板',   icon: '○', group: 'pm' },
  { key: 'tasks',     label: '全部任务',   icon: '≡', group: 'pm' },
  { key: 'charts',    label: '数据统计',   icon: '◉', group: 'pm' },
  { key: 'gantt',     label: '甘特图',     icon: '▦', group: 'pm' },
  { key: 'calendar',  label: '月历视图',   icon: '📅', group: 'pm' },
  { key: 'projects',  label: '项目列表',   icon: '□', group: 'pm' },
  { key: 'add_task',  label: '快速添加任务', icon: '+', group: 'pm' },
  // ── 资金计划 ──
  { key: 'fin_t1',        label: '月度资金计划', icon: '📊', group: 'finance' },
  { key: 'fin_receipt',   label: '对上收款台账', icon: '📥', group: 'finance' },
  { key: 'fin_payment',   label: '对下付款计划', icon: '📤', group: 'finance' },
  { key: 'fin_t4',        label: '完成情况',     icon: '✅', group: 'finance' },
  { key: 'fin_t5',        label: '实际收款明细', icon: '💰', group: 'finance' },
  { key: 'fin_t6',        label: '实际支付明细', icon: '💳', group: 'finance' },
  { key: 'fin_dashboard', label: '资金看板',     icon: '📈', group: 'finance' },
  // ── 基础库配置 ──
  { key: 'basic_info',       label: '基础信息配置', icon: '⚙', group: 'base' },
  { key: 'base_contracts',   label: '合同库',       icon: '📄', group: 'base' },
  { key: 'base_customers',   label: '客户库',       icon: '👥', group: 'base' },
  { key: 'base_suppliers',   label: '供应商库',     icon: '🏢', group: 'base' },
  // ── 系统管理 ──
  { key: 'members',   label: '成员管理',   icon: '👤', group: 'admin', adminOnly: true },
  { key: 'tags',      label: '标签管理',   icon: '🏷', group: 'admin', adminOnly: true },
  { key: 'roles',     label: '角色权限',   icon: '🔐', group: 'admin', adminOnly: true },
  { key: 'system_config', label: '系统配置', icon: '⚙', group: 'admin', adminOnly: true },
  { key: 'logs',      label: '操作日志',   icon: '📋', group: 'admin' },
  // ── AI 助手 ──
  { key: 'ai_assistant', label: 'AI 任务助手', icon: '🤖', group: 'ai' },
  // ── 投资测算 ──
  { key: 'inv_list',        label: '投资项目列表', icon: '📊', group: 'investment' },
  { key: 'inv_calc',        label: '项目测算',     icon: '🧮', group: 'investment' },
  { key: 'inv_edit',        label: '测算编辑',     icon: '✏️', group: 'investment' },
  { key: 'inv_logs',        label: '测算操作日志', icon: '📋', group: 'investment' },
  { key: 'inv_sensitivity', label: '敏感性分析',   icon: '📈', group: 'investment' },
];

// 暴露常量到 window 供 settings 等模块使用
window._MEMBER_COLORS = MEMBER_COLORS;
window._PROJ_COLORS = PROJ_COLORS;
window._ROLE_LABELS = ROLE_LABELS;
window._ROLE_LEVELS = ROLE_LEVELS;
window._MENU_DEFS = MENU_DEFS;

// 根据角色返回默认可见菜单
function getDefaultMenuPerms(role) {
  // 仅 super_admin 默认拥有全部权限，admin 和 user 均需手动配置
  if (role === 'super_admin') return MENU_DEFS.map(m => m.key);
  return [];
}

// 检查用户对某个分组的菜单权限
function hasGroupPerm(group) {
  var allowed = getEffectiveMenuPerms();
  return MENU_DEFS.filter(function(m) { return m.group === group; }).some(function(m) { return allowed.includes(m.key); });
}

// 获取当前用户实际菜单权限（含旧格式兼容）
function getEffectiveMenuPerms() {
  if (!currentUser) return [];
  // super_admin 始终拥有全部权限，不受配置影响
  if (currentUser.role === 'super_admin') return MENU_DEFS.map(m => m.key);
  var perms;
  // null/undefined = 从未配置，使用角色默认值
  // [] = 管理员显式清空，尊重空数组
  if (currentUser.menuPerms != null) {
    perms = currentUser.menuPerms.slice();
  } else {
    perms = getDefaultMenuPerms(currentUser.role);
  }
  // 向后兼容：旧版 'finance' 自动展开为所有资金子菜单
  if (perms.includes('finance')) {
    var finKeys = MENU_DEFS.filter(function(m) { return m.group === 'finance'; }).map(function(m) { return m.key; });
    perms = perms.filter(function(k) { return k !== 'finance'; }).concat(finKeys);
  }
  return perms;
}

// 应用菜单权限到侧边栏和顶部 Tab
function applyMenuPerms() {
  const allowed = getEffectiveMenuPerms();
  document.querySelectorAll('[data-menu-key]').forEach(el => {
    const key = el.getAttribute('data-menu-key');
    el.classList.toggle('menu-hidden', !allowed.includes(key));
  });
  // 顶部模块切换 Tab 的显示/隐藏（基于分组权限）
  var hasPM = hasGroupPerm('pm');
  var hasFinance = hasGroupPerm('finance');
  var hasBase = hasGroupPerm('base');
  var hasInvestment = hasGroupPerm('investment');
  const pmTab     = document.getElementById('top-tab-pm');
  const finTab    = document.getElementById('top-tab-finance');
  const investTab = document.getElementById('top-tab-invest');

  if (pmTab)     pmTab.classList.toggle('menu-hidden', !hasPM);
  if (finTab)    finTab.classList.toggle('menu-hidden', !hasFinance && !hasBase);
  if (investTab) investTab.classList.toggle('menu-hidden', !hasInvestment);
  // 如果当前激活的模块被隐藏了，自动切换
  if (activeModule === 'pm' && !hasPM) {
    if (hasFinance || hasBase) switchModule('finance');
    else if (hasInvestment)    switchModule('invest');
  } else if (activeModule === 'finance' && !hasFinance && !hasBase) {
    if (hasPM)                 switchModule('pm');
    else if (hasInvestment)    switchModule('invest');
  } else if (activeModule === 'invest' && !hasInvestment) {
    if (hasPM)                 switchModule('pm');
    else if (hasFinance || hasBase) switchModule('finance');
  }
  // 基础库配置：拥有任一基础库权限即显示
  var baseLibBtn = document.getElementById('base-lib-btn');
  if (baseLibBtn) {
    baseLibBtn.classList.toggle('menu-hidden', !hasBase);
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
    // 保留 pm_remember 中的用户名密码，标记为主动退出
    var rem = JSON.parse(localStorage.getItem('pm_remember') || 'null');
    if (rem && rem.name) {
      rem.loggedOut = true;
      localStorage.setItem('pm_remember', JSON.stringify(rem));
    }
    window.location.href = 'login.html';
  });
}

// --- 3. 实时同步 ---
function initRealtime() {
  // 频道 1：所有表变更 → 全量刷新（现有逻辑）
  var channel = sb.channel('db-changes');
  channel
    .on('postgres_changes', { event: '*', schema: 'public' }, function() { loadState(); })
    .subscribe();

  // 频道 2：notifications 表专用 → 仅刷新通知（绕过 loadState 防抖）
  if (currentUser && currentUser.id) {
    window._notifChannel = null;
    window._notifChannelStatus = 'idle';

    var subscribeNotifChannel = function() {
      if (window._notifChannel) {
        try { sb.removeChannel(window._notifChannel); } catch(e) {}
      }
      var ch = sb.channel('notif-' + currentUser.id + '-' + Date.now());
      ch.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'recipient_id=eq.' + currentUser.id
      }, function() {
        loadCloudNotifications();
      });
      ch.subscribe(function(status, err) {
        window._notifChannelStatus = status;
        if (window._DEBUG_NOTIF) console.log('[Notification] channel status:', status, err);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window._notifReconnectAttempts = (window._notifReconnectAttempts || 0) + 1;
          if (window._notifReconnectAttempts <= 10) {
            var delay = Math.min(5000 * window._notifReconnectAttempts, 60000);
            console.warn('[Notification] channel disconnected, reconnect in', delay, 'ms');
            setTimeout(subscribeNotifChannel, delay);
          } else {
            console.error('[Notification] channel failed after 10 attempts, please refresh');
          }
        } else if (status === 'SUBSCRIBED') {
          window._notifReconnectAttempts = 0;
          loadCloudNotifications();
        }
      });
      window._notifChannel = ch;
    };

    subscribeNotifChannel();

    // 页面恢复焦点 / 网络恢复时主动拉取（兜底）
    window.addEventListener('focus', function() {
      if (currentUser && currentUser.id) loadCloudNotifications();
    });
    window.addEventListener('online', function() {
      if (currentUser && currentUser.id) {
        loadCloudNotifications();
        if (window._notifChannelStatus !== 'SUBSCRIBED') subscribeNotifChannel();
      }
    });
  }
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

  // Session 过期检查（8 小时），但 Remember Me 可在 5 天内延长
  if (parsed.loginAt && (Date.now() - parsed.loginAt) > SESSION_MAX) {
    var remember = JSON.parse(localStorage.getItem('pm_remember') || 'null');
    if (remember && remember.expires && Date.now() < remember.expires) {
      // Remember Me 有效，刷新 loginAt 继续使用
      parsed.loginAt = Date.now();
      localStorage.setItem('pm_session', JSON.stringify(parsed));
    } else {
      localStorage.removeItem('pm_session');
      localStorage.removeItem('pm_remember');
      window.location.href = 'login.html';
      return;
    }
  }

  // Session 有效 → 立即显示主界面，不阻塞
  currentUser = { ...parsed, role: parsed.role || 'user', menuPerms: parsed.menuPerms || parsed.menu_perms || null };

  // 清除历史 Session 中可能遗留的明文密码
  if (currentUser && currentUser.password) {
    delete currentUser.password;
    try {
      const stored = JSON.parse(localStorage.getItem('pm_session') || '{}');
      delete stored.password;
      localStorage.setItem('pm_session', JSON.stringify(stored));
    } catch(e) {}
  }

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
  // 同步本地已读列表（首次会迁移 localStorage 中的旧数据到云端）
  if (typeof _syncLocalReadsFromCloud === 'function') {
    _syncLocalReadsFromCloud().then(function() {
      if (typeof refreshNotifs === 'function') refreshNotifs();
    });
  }
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
      .select('id, role, color_idx, menu_perms')
      .eq('id', currentUser.id)
      .single();
    if (!error && data) {
      currentUser.role      = data.role       || 'user';
      currentUser.colorIdx  = data.color_idx  || 0;
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
  return {todo:{lbl:'待启动',cls:'pill-gray'},doing:{lbl:'进行中',cls:'pill-blue'},blocked:{lbl:'阻塞中',cls:'pill-purple'},waiting:{lbl:'待反馈',cls:'pill-amber'},done:{lbl:'已完成',cls:'pill-green'}}[s] || {lbl:s,cls:'pill-gray'};
}

function projName(id) { const p=state.projects.find(x=>x.id===id); return p?p.name:'未分类'; }
function projColor(id) { const p=state.projects.find(x=>x.id===id); return PROJ_COLORS[(p?p.colorIdx||0:0)%PROJ_COLORS.length]; }
// V20: 模块名称辅助函数
function moduleName(id) { if (!id) return '未分类'; var m=state.modules.find(function(x){return x.id===id}); return m?m.name:'未分类'; }
function memberName(id) { const m=state.members.find(x=>x.id===id); return m?m.name:id; }
function memberColor(id) { const m=state.members.find(x=>x.id===id); return m?MEMBER_COLORS[m.colorIdx%MEMBER_COLORS.length]:'#a09e98'; }
function memberInitial(id) { const n=memberName(id); return n?n.slice(0,1):'?'; }
function getColorName(colorIdx) { const names=['blue','green','amber','red','purple','teal','orange','blue']; return names[(colorIdx||0)%names.length]; }

// ─── 阻塞判定（两个独立概念，不能混淆） ────────────────────────
// isWaitingDeps：派生 — 任务的 dependencies 中有未完成项（甘特图依赖线、任务卡"等待前置"徽章用）
// isManuallyBlocked：主动 — PM 把 status 标为 blocked + 填了 reason（总览页"阻塞中"指标用）

function isWaitingDeps(t) {
  if (!t.dependencies || !t.dependencies.length) return false;
  return t.dependencies.some(function(depId) {
    var dep = state.tasks.find(function(x) { return x.id === depId; });
    return dep && !dep.done;
  });
}

function isManuallyBlocked(t) {
  return t && t.status === 'blocked';
}

// 已阻塞工作日数（跳过周末，节假日不跳）
function getBlockedDays(t) {
  if (!isManuallyBlocked(t) || !t.blocked_at) return 0;
  return countWorkdays(new Date(t.blocked_at), new Date());
}

// 工作日计数（跳过周六周日）
function countWorkdays(fromDate, toDate) {
  if (!fromDate || !toDate) return 0;
  var from = new Date(fromDate); from.setHours(0,0,0,0);
  var to   = new Date(toDate);   to.setHours(0,0,0,0);
  if (to < from) return 0;
  var days = 0;
  var cur = new Date(from);
  while (cur < to) {
    var dow = cur.getDay();  // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// 旧名兼容（保留 90 天，避免外部调用断裂）
// TODO: V26 移除以下兼容层
function isBlocked(t) { return isWaitingDeps(t); }

// 暴露到 window
window.isWaitingDeps = isWaitingDeps;
window.isManuallyBlocked = isManuallyBlocked;
window.getBlockedDays = getBlockedDays;
window.countWorkdays = countWorkdays;

function tagHTML(tagId) {
  const tg = state.globalTags.find(x=>x.id===tagId); if (!tg) return '';
  const p = TAG_PALETTES[tg.paletteIdx%TAG_PALETTES.length];
  return `<span class="pill" style="background:${p.bg};color:${p.color};border-color:${p.border}">${escHtml(tg.name)}</span>`;
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
        <span style="flex:1;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escHtml(p.name)}</span>
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
  document.querySelectorAll('.stat-val, .proj-stat-num, [data-count-to]').forEach(el => {
    var raw = el.hasAttribute('data-count-to') ? el.getAttribute('data-count-to') : el.textContent;
    // Skip non-numeric placeholders like "—"
    if (!/[0-9]/.test(raw)) return;
    var isPct = raw.indexOf('%') > -1;
    // Strip commas and other formatting, keep minus sign and digits
    var cleaned = raw.replace(/[^0-9\-]/g, '');
    var num = parseInt(cleaned, 10);
    if (isNaN(num) || num < 0) return;
    var key = el._animTarget;
    if (!key || key !== raw) {
      el._animTarget = raw;
      el._animNum = null;
    }
    if (el._animNum === num) return;
    el._animNum = num;
    var duration = 500;
    var start = performance.now();
    function step(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = Math.round(num * eased);
      el.textContent = isPct ? val + '%' : val.toLocaleString('en-US');
      if (progress < 1) requestAnimationFrame(step);
      else { el.textContent = raw; el._animNum = null; el._animTarget = null; }
    }
    requestAnimationFrame(step);
  });
}

// ─── A5: Chart bar entrance animation ──────────────────────────────────
function animateChartBars() {
  document.querySelectorAll('.chart-bar-fill, .proj-progress-fill').forEach(function(bar) {
    if (bar._barAnimated) return;
    bar._barAnimated = true;
    var targetW = bar.style.width;
    bar.style.width = '0';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        bar.style.transition = 'width .6s ease-out';
        bar.style.width = targetW;
      });
    });
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
  const matchedNav = document.querySelector('.nav-item[data-view="' + v + '"]');
  if (matchedNav) matchedNav.classList.add('active');

  const setDisplay = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.style.display = val;
  };

  var searchViews = ['dashboard', 'today', 'tasks', 'projects'];
  var showSearch = searchViews.indexOf(v) !== -1 || v.startsWith('project-');
  setDisplay('task-search-wrap', showSearch ? 'flex' : 'none');
  setDisplay('header-add-btn', (v === 'tasks' || v.startsWith('project-')) ? 'block' : 'none');
  setDisplay('header-add-proj-btn', v === 'projects' ? 'block' : 'none');
  setDisplay('header-export-btn', v === 'tasks' ? 'block' : 'none');

  searchQuery = '';
  window._globalSearch = '';
  const inp = document.getElementById('task-search-input');
  if (inp) inp.value = '';

  // 筛选条件持久化：切进 tasks 视图时恢复
  if (v === 'tasks') {
    try {
      const saved = JSON.parse(localStorage.getItem('pm_task_filters') || '{}');
      if (saved.filterProject)  filterProject  = saved.filterProject;
      if (saved.filterStatus)   filterStatus   = saved.filterStatus;
      if (saved.filterAssignee) filterAssignee = saved.filterAssignee;
      if (saved.filterModule)   filterModule   = saved.filterModule;
      if (saved.filterTag)      filterTag      = saved.filterTag;
    } catch(e) {}
  }

  updateBadges();
  render();
}

function onSearch(val) { window._globalSearch = (val || '').trim().toLowerCase(); render(); }

function render() {
  if (typeof activeModule !== 'undefined' && activeModule !== 'pm') return;
  if (currentView==='dashboard') { renderPMDashboard(); return; }
  if (currentView==='today') renderToday();
  else if (currentView==='tasks') renderTaskList();
  else if (currentView==='projects') renderProjects();
  else if (currentView==='charts') renderCharts();
  else if (currentView==='gantt') renderGantt();
  else if (currentView==='calendar') renderCalendar();
  else if (currentView.startsWith('project-')) renderProjectView(currentView.slice(8));
  else renderPMDashboard();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  requestAnimationFrame(() => {
    var pane = document.querySelector('.view-pane');
    if (pane) {
      pane.classList.remove('slide-in-left', 'slide-in-right');
      var lastView = window._viewHistory[window._viewHistory.length - 1];
      var VIEW_ORDER = ['dashboard','today','tasks','projects','charts','gantt','week','calendar'];
      var curIdx  = VIEW_ORDER.indexOf(currentView);
      var lastIdx = VIEW_ORDER.indexOf(lastView);
      if (curIdx > -1 && lastIdx > -1 && curIdx !== lastIdx) {
        void pane.offsetWidth;
        pane.classList.add(curIdx > lastIdx ? 'slide-in-right' : 'slide-in-left');
      }
    }
    staggerEntrance();
    setupChartTipListeners();
    animateStatNumbers();
    animateChartBars();

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
        if (activeModule === 'pm') { e.preventDefault(); switchView('dashboard'); }
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

/* ════════════════════════════════════════════════
 * 通知铃铛系统 — 重设计版（带点击导航）
 * ════════════════════════════════════════════════ */

// 计算通知列表（PM 任务到期 + Finance 收付款到期）
window._notifItems = [];

window.buildNotifItems = function() {
  var items = [];
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var in48h = new Date(now); in48h.setDate(now.getDate() + 2);

  // 读取通知偏好
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('pm_notif_prefs') || '{}'); } catch(e) {}

  function getPref(key, def) { return prefs[key] !== undefined ? prefs[key] : def; }

  // ── PM 任务：逾期 + 即将到期 ──
  if (getPref('task_overdue', true) || getPref('task_urgent', true)) {
    (state.tasks || []).forEach(function(t) {
      if (t.done || !t.due) return;
      var due = new Date(t.due + 'T00:00:00'); due.setHours(0, 0, 0, 0);
      var assigneeName = '';
      if (t.assignee) {
        var m = (state.members || []).find(function(mb) { return mb.id === t.assignee; });
        if (m) assigneeName = m.name;
      }
      if (due.getTime() < now.getTime() && getPref('task_overdue', true)) {
        items.push({
          id: 'task-overdue-' + t.id,
          type: 'red',
          icon: '⏰',
          iconCls: 'ico-red',
          title: (t.title || '未命名任务') + '  已逾期',
          sub: assigneeName || '未分配',
          tag: '任务',
          ts: due.getTime(),
          navType: 'task',
          navId: t.id
        });
      } else if (due.getTime() === now.getTime() && getPref('task_overdue', true)) {
        items.push({
          id: 'task-today-' + t.id,
          type: 'red',
          icon: '⏰',
          iconCls: 'ico-red',
          title: (t.title || '未命名任务') + '  今日到期',
          sub: assigneeName || '未分配',
          tag: '任务',
          ts: due.getTime(),
          navType: 'task',
          navId: t.id
        });
      } else if (due > now && due <= in48h && getPref('task_urgent', true)) {
        var diffDays = Math.round((due.getTime() - now.getTime()) / 86400000);
        items.push({
          id: 'task-48h-' + t.id,
          type: 'amber',
          icon: '📋',
          iconCls: 'ico-amber',
          title: (t.title || '未命名任务'),
          sub: (assigneeName || '未分配') + '  ·  ' + diffDays + '天后到期',
          tag: '任务',
          ts: due.getTime(),
          navType: 'task',
          navId: t.id
        });
      }
    });
  }

  // ── Finance：收款/付款计划到期 ──
  try {
    if (typeof finState !== 'undefined' && finState) {
      if (getPref('fin_receipt', true)) {
        (finState.receipts || []).forEach(function(r) {
          if (!r.next_expected_date) return;
          var d = new Date(r.next_expected_date + 'T00:00:00'); d.setHours(0, 0, 0, 0);
          if (d >= now && d <= in48h) {
            var amtStr = r.plan_amount
              ? '¥' + (Number(r.plan_amount) / 10000).toFixed(1) + '万'
              : '';
            items.push({
              id: 'fin-receipt-' + r.id,
              type: 'blue',
              icon: '💰',
              iconCls: 'ico-blue',
              title: (r.contract_name || '收款计划') + '  计划到款',
              sub: (r.customer_name || '') + (amtStr ? '  ·  ' + amtStr : ''),
              tag: '资金',
              ts: d.getTime(),
              navType: 'receipt',
              navId: r.id
            });
          }
        });
        (finState.payments || []).forEach(function(p) {
          var planTotal = (+p.plan_cash || 0) + (+p.plan_supply_chain || 0);
          if (!planTotal) return;
          var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          var diff = Math.round((monthEnd.getTime() - now.getTime()) / 86400000);
          if (diff <= 3) {
            items.push({
              id: 'fin-payment-' + p.id,
              type: 'teal',
              icon: '📤',
              iconCls: 'ico-teal',
              title: (p.contract_name || '付款计划') + '  本月到期',
              sub: (p.supplier_name || '') + '  ·  ¥' + (planTotal / 10000).toFixed(1) + '万',
              tag: '资金',
              ts: monthEnd.getTime(),
              navType: 'payment',
              navId: p.id
            });
          }
        });
      }
    }
  } catch(e) { /* Finance 未初始化时忽略 */ }

  // 合并云端通知（按偏好过滤）
  var cloudItems = (window._cloudNotifItems || []).filter(function(c) {
    if (_getReadIds().includes(c.id)) return false;
    if (!getPref('cloud_push', true)) return false;
    return true;
  });
  items = items.concat(cloudItems);

  // 按紧急程度排序，同级按时间倒序
  items.sort(function(a, b) {
    var typeOrder = { red: 0, amber: 1, blue: 2, green: 2, purple: 2, teal: 3 };
    var to = (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
    if (to !== 0) return to;
    return b.ts - a.ts;
  });

  window._notifItems = items;
  return items;
};

// 读取/写入已读状态（内存缓存 + localStorage + Supabase）
window._localReadCache = null;

function _getReadIds() {
  if (window._localReadCache !== null) return window._localReadCache;
  try {
    var ids = JSON.parse(localStorage.getItem('pm_notif_read_v2') || '[]');
    window._localReadCache = ids;
    return ids;
  } catch(e) { return []; }
}

function _saveReadIds(ids) {
  try { localStorage.setItem('pm_notif_read_v2', JSON.stringify(ids.slice(-300))); } catch(e) {}
}

async function _markLocalReadAsync(notifKey) {
  if (!notifKey) return;
  var ids = _getReadIds();
  if (ids.includes(notifKey)) return;
  ids.push(notifKey);
  ids = ids.slice(-300);
  window._localReadCache = ids;
  try { localStorage.setItem('pm_notif_read_v2', JSON.stringify(ids)); } catch(e) {}
  if (currentUser && currentUser.id) {
    try {
      await sb.from('notification_local_reads').upsert({
        user_id: currentUser.id,
        notif_key: notifKey,
        read_at: new Date().toISOString()
      }, { onConflict: 'user_id,notif_key' });
    } catch(e) {
      console.warn('[Notification] local-read sync failed:', e);
    }
  }
}

async function _markLocalReadsBatch(notifKeys) {
  if (!notifKeys || !notifKeys.length) return;
  var ids = _getReadIds();
  notifKeys.forEach(function(k) { if (!ids.includes(k)) ids.push(k); });
  ids = ids.slice(-300);
  window._localReadCache = ids;
  try { localStorage.setItem('pm_notif_read_v2', JSON.stringify(ids)); } catch(e) {}
  if (currentUser && currentUser.id) {
    try {
      var rows = notifKeys.map(function(k) {
        return { user_id: currentUser.id, notif_key: k, read_at: new Date().toISOString() };
      });
      await sb.from('notification_local_reads').upsert(rows, { onConflict: 'user_id,notif_key' });
    } catch(e) {
      console.warn('[Notification] local-reads batch sync failed:', e);
    }
  }
}

async function _syncLocalReadsFromCloud() {
  if (!currentUser || !currentUser.id) return;
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    var { data, error } = await sb
      .from('notification_local_reads')
      .select('notif_key')
      .eq('user_id', currentUser.id)
      .gte('read_at', cutoff.toISOString())
      .limit(500);
    if (error) {
      console.warn('[Notification] local-reads load failed:', error.message);
      return;
    }
    var cloudIds = (data || []).map(function(r) { return r.notif_key; });
    var localIds = [];
    try { localIds = JSON.parse(localStorage.getItem('pm_notif_read_v2') || '[]'); } catch(e) {}
    var merged = Array.from(new Set(cloudIds.concat(localIds))).slice(-300);

    var toMigrate = localIds.filter(function(id) { return !cloudIds.includes(id); });
    if (toMigrate.length > 0) {
      var rows = toMigrate.map(function(k) {
        return { user_id: currentUser.id, notif_key: k, read_at: new Date().toISOString() };
      });
      sb.from('notification_local_reads')
        .upsert(rows, { onConflict: 'user_id,notif_key' })
        .then(function(r) {
          if (r.error) console.warn('[Notification] migrate local reads failed:', r.error.message);
          else if (window._DEBUG_NOTIF) console.log('[Notification] migrated', toMigrate.length, 'local reads');
        });
    }

    window._localReadCache = merged;
    try { localStorage.setItem('pm_notif_read_v2', JSON.stringify(merged)); } catch(e) {}
  } catch(e) {
    console.warn('[Notification] sync local-reads exception:', e);
  }
}

window._syncLocalReadsFromCloud = _syncLocalReadsFromCloud;

// ── 云端通知系统 ──
/**
 * 推送通知到云端 notifications 表
 * @returns {Promise<{ok:boolean, error?:string, dbId?:number}>}
 */
window.pushNotification = async function({ recipientId, type, title, body, navType, navId }) {
  if (!recipientId) return { ok: false, error: 'no-recipient' };
  if (currentUser && currentUser.id === recipientId) return { ok: false, error: 'self-skip' };
  try {
    var resp = await sb.from('notifications').insert({
      recipient_id: recipientId,
      type:     type     || 'info',
      title:    title    || '',
      body:     body     || '',
      nav_type: navType  || 'task',
      nav_id:   navId    || '',
      is_read:  false
    }).select().single();
    if (resp.error) {
      console.error('[Notification] insert failed:', resp.error.message, resp.error);
      return { ok: false, error: resp.error.message };
    }
    if (window._DEBUG_NOTIF) {
      console.log('[Notification] pushed →', recipientId, type, '#' + resp.data.id);
    }
    return { ok: true, dbId: resp.data.id };
  } catch(e) {
    console.error('[Notification] exception:', e);
    return { ok: false, error: String(e) };
  }
};

// 向任务的所有负责人推送通知（自动排除当前操作者）
window.pushTaskNotification = async function(task, notifData) {
  if (typeof pushNotification !== 'function') return;
  var recipients = [];
  if (task.assignee) recipients.push(task.assignee);
  (task.assignees || []).forEach(function(id) {
    if (id && recipients.indexOf(id) === -1) recipients.push(id);
  });
  var results = await Promise.all(recipients.map(function(rid) {
    return pushNotification({
      recipientId: rid,
      type:    notifData.type    || 'info',
      title:   notifData.title   || '',
      body:    notifData.body    || '',
      navType: notifData.navType || 'task',
      navId:   notifData.navId   || ''
    });
  }));
  var failed = results.filter(function(r) { return !r.ok && r.error !== 'self-skip'; });
  if (failed.length > 0) {
    console.warn('[Notification] task notification failures:', failed.length, '/', recipients.length);
  }
};

window._cloudNotifItems = [];
// 已读历史持久化（localStorage + 内存双写，跨刷新保留）
function _loadHistoryFromStore() {
  try {
    var raw = localStorage.getItem('pm_notif_read_history');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}
function _saveHistoryToStore(items) {
  try { localStorage.setItem('pm_notif_read_history', JSON.stringify(items.slice(0, 100))); } catch(e) {}
}

window._cloudNotifReadHistory = _loadHistoryFromStore();

window.loadCloudNotifications = async function(opts) {
  if (!currentUser || !currentUser.id) return;
  opts = opts || {};
  var loadHistory = opts.history === true;

  try {
    var query = sb
      .from('notifications')
      .select('*')
      .eq('recipient_id', currentUser.id);

    if (loadHistory) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      query = query
        .eq('is_read', true)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
    } else {
      query = query
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);
    }

    var { data, error } = await query;
    if (error) {
      console.error('[Notification] load failed:', error.message);
      return;
    }

    var TYPE_MAP = {
      task_changed:  { icon:'✏️', iconCls:'ico-amber',  type:'amber',  tag:'任务变更' },
      task_done:     { icon:'✅', iconCls:'ico-green',   type:'green',  tag:'任务完成' },
      task_assigned: { icon:'👤', iconCls:'ico-blue',    type:'blue',   tag:'任务分配' },
      perm_changed:  { icon:'🔐', iconCls:'ico-purple',  type:'amber',  tag:'权限变更' },
    };

    var mapped = (data || []).map(function(n) {
      var cfg = TYPE_MAP[n.type] || { icon:'🔔', iconCls:'ico-amber', type:'amber', tag:'通知' };
      return {
        id:      'cloud-' + n.id,
        _dbId:   n.id,
        type:    cfg.type,
        icon:    cfg.icon,
        iconCls: cfg.iconCls,
        title:   n.title || '',
        sub:     n.body  || '',
        tag:     cfg.tag,
        ts:      new Date(n.created_at).getTime(),
        navType: n.nav_type || 'task',
        navId:   n.nav_id   || '',
        isCloud: true,
        isRead:  !!n.is_read
      };
    });

    if (loadHistory) {
      // 合并已有历史（含本地通知）与服务端返回的云通知，去重后按时间倒序
      var existing = window._cloudNotifReadHistory || [];
      var seen = {};
      for (var i = 0; i < existing.length; i++) { seen[existing[i].id] = true; }
      var merged = existing.slice();
      for (var j = 0; j < mapped.length; j++) {
        if (!seen[mapped[j].id]) { merged.push(mapped[j]); seen[mapped[j].id] = true; }
      }
      merged.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
      window._cloudNotifReadHistory = merged.slice(0, 100);
      _saveHistoryToStore(window._cloudNotifReadHistory);
    } else {
      window._cloudNotifItems = mapped;
      refreshNotifs();
    }
  } catch(e) {
    console.error('[Notification] load exception:', e);
  }
};

window.markCloudNotifRead = async function(dbId) {
  if (!dbId) return;
  try {
    var { error } = await sb.from('notifications').update({ is_read: true }).eq('id', dbId);
    if (error) console.error('[Notification] markRead failed:', error.message);
  } catch(e) {
    console.error('[Notification] markRead exception:', e);
  }
};

// 渲染角标和面板
window.refreshNotifs = function() {
  var items = buildNotifItems();
  var readIds = _getReadIds();
  var unreadItems = items.filter(function(i) { return !readIds.includes(i.id); });
  var unreadCount = unreadItems.length;

  // ── 更新铃铛按钮状态 ──
  var trigger = document.getElementById('notif-trigger');
  var badge = document.getElementById('notif-badge');
  var bellIcon = document.getElementById('notif-bell-icon');

  if (trigger) {
    trigger.classList.toggle('has-unread', unreadCount > 0);
  }
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  // ── 更新面板头部角标 ──
  var countEl = document.getElementById('notif-unread-count');
  if (countEl) {
    if (unreadCount > 0) {
      countEl.textContent = unreadCount;
      countEl.classList.add('visible');
    } else {
      countEl.classList.remove('visible');
    }
  }

  // ── 同步更新 Tab 角标 ──
  var tabCountEl = document.getElementById('notif-tab-count-unread');
  if (tabCountEl) tabCountEl.textContent = unreadCount;

  // ── 渲染面板内容（分组）──
  // 如果面板当前在"已读历史"Tab，不覆盖列表内容（避免实时推送冲掉历史视图）
  if (window._notifCurrentTab === 'read') return;
  var listEl = document.getElementById('notif-list');
  if (!listEl) return;

  if (unreadItems.length === 0) {
    listEl.innerHTML = '<div class="notif-empty-state">暂无待处理提醒</div>';
    return;
  }

  function renderNotifItem(item) {
    var cls = 'notif-item type-' + item.type + ' unread';
    var title = item.title || '';
    if (title.length > 28) title = title.slice(0, 28) + '…';
    return (
      '<div class="' + escHtml(cls) + '"' +
        ' onclick="notifNavigate(\'' + escHtml(item.navType) + '\',\'' + escHtml(item.navId) + '\',\'' + escHtml(item.id) + '\')">' +
        '<div class="notif-unread-dot"></div>' +
        '<div class="notif-item-icon ' + escHtml(item.iconCls) + '">' + item.icon + '</div>' +
        '<div class="notif-item-content">' +
          '<div class="notif-item-title">' + escHtml(title) + '</div>' +
          '<div class="notif-item-sub">' +
            '<span style="font-size:9.5px;padding:1px 5px;border-radius:3px;' +
              'background:var(--surface2);border:1px solid var(--border);color:var(--text3)">' +
              escHtml(item.tag) +
            '</span>' +
            '<span>' + escHtml(item.sub || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<svg class="notif-item-arrow" width="13" height="13" fill="none" stroke="currentColor"' +
          ' stroke-width="1.8" viewBox="0 0 16 16">' +
          '<path d="M6 3l5 5-5 5"/>' +
        '</svg>' +
      '</div>'
    );
  }

  // 分组
  var pmItems = unreadItems.filter(function(i) {
    return i.navType === 'task' && !i.isCloud;
  });
  var finItems = unreadItems.filter(function(i) {
    return (i.navType === 'receipt' || i.navType === 'payment') && !i.isCloud;
  });
  var cloudItems = unreadItems.filter(function(i) { return i.isCloud; });

  function renderGroup(label, items) {
    if (!items.length) return '';
    return '<div class="notif-group-label">' + label + '</div>' + items.map(renderNotifItem).join('');
  }

  var bodyHTML =
    renderGroup('任务', pmItems) +
    renderGroup('资金', finItems) +
    renderGroup('系统通知', cloudItems);

  // 兜底：如果有遗漏的项（不属于任何组），追加在最后
  var groupedIds = {};
  [pmItems, finItems, cloudItems].forEach(function(arr) {
    arr.forEach(function(i) { groupedIds[i.id] = true; });
  });
  var remaining = unreadItems.filter(function(i) { return !groupedIds[i.id]; });
  if (remaining.length) {
    bodyHTML += remaining.map(renderNotifItem).join('');
  }

  listEl.innerHTML = bodyHTML || '<div class="notif-empty-state">暂无待处理提醒</div>';
};

// ── 通知面板 Tab 切换 ──
window._notifCurrentTab = 'unread';

window.switchNotifTab = async function(tab) {
  window._notifCurrentTab = tab;
  document.querySelectorAll('.notif-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  var listEl = document.getElementById('notif-list');
  var readAllBtn = document.getElementById('notif-read-all-btn');
  if (!listEl) return;

  if (tab === 'read') {
    if (readAllBtn) readAllBtn.style.display = 'none';
    listEl.innerHTML = '<div class="notif-empty-state"><span class="notif-loading">加载中…</span></div>';
    await loadCloudNotifications({ history: true });
    renderNotifHistoryList();
  } else {
    if (readAllBtn) readAllBtn.style.display = '';
    refreshNotifs();
  }
};

window.renderNotifHistoryList = function() {
  var listEl = document.getElementById('notif-list');
  if (!listEl) return;
  var items = window._cloudNotifReadHistory || [];
  if (items.length === 0) {
    listEl.innerHTML = '<div class="notif-empty-state">暂无已读历史</div>';
    return;
  }
  listEl.innerHTML = items.map(function(item) {
    var title = item.title || '';
    if (title.length > 28) title = title.slice(0, 28) + '…';
    var timeStr = formatRelativeTime(item.ts);
    return (
      '<div class="notif-item type-' + item.type + ' read-item history-item"' +
        ' onclick="notifNavigateHistory(\'' + escHtml(item.navType) + '\',\'' + escHtml(item.navId) + '\')">' +
        '<div class="notif-item-icon ' + escHtml(item.iconCls) + '">' + item.icon + '</div>' +
        '<div class="notif-item-content">' +
          '<div class="notif-item-title">' + escHtml(title) + '</div>' +
          '<div class="notif-item-sub">' +
            '<span class="notif-tag-small">' + escHtml(item.tag) + '</span>' +
            '<span>' + escHtml(item.sub || '') + '</span>' +
            '<span class="notif-time">' + timeStr + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
};

window.notifNavigateHistory = function(navType, navId) {
  closeNotifPanel();
  if (navType === 'task' && typeof openEditTask === 'function') {
    if (typeof switchModule === 'function') switchModule('pm');
    setTimeout(function() { openEditTask(navId); }, 120);
  } else if (navType === 'receipt') {
    if (typeof switchModule === 'function') switchModule('finance');
    setTimeout(function() { switchTab('receipt'); }, 120);
  } else if (navType === 'payment') {
    if (typeof switchModule === 'function') switchModule('finance');
    setTimeout(function() { switchTab('payment'); }, 120);
  }
};

function formatRelativeTime(ts) {
  var diff = Date.now() - ts;
  var min = Math.floor(diff / 60000);
  var hour = Math.floor(diff / 3600000);
  var day = Math.floor(diff / 86400000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  if (hour < 24) return hour + ' 小时前';
  if (day < 7) return day + ' 天前';
  if (day < 30) return Math.floor(day / 7) + ' 周前';
  return Math.floor(day / 30) + ' 月前';
}

// 点击通知 → 标记已读 + 导航
window.notifNavigate = async function(navType, navId, itemId) {
  // 标记已读（同时写本地缓存 + localStorage + Supabase）
  _markLocalReadAsync(itemId);

  // 将当前通知项推入已读历史（云通知 + 本地通知均处理）
  var clickedItem = null;
  var cloudItem = (window._cloudNotifItems || []).find(function(c) { return c.id === itemId; });
  if (cloudItem && cloudItem._dbId) {
    try { await markCloudNotifRead(cloudItem._dbId); } catch(e) {}
    cloudItem.isRead = true;
    cloudItem.readAt = new Date().toISOString();
    clickedItem = cloudItem;
    window._cloudNotifItems = window._cloudNotifItems.filter(function(c) { return c.id !== itemId; });
  } else {
    // 本地通知（task-today-*, fin-receipt-* 等）：从最近一次 buildNotifItems 中找到该项
    var localItems = window._notifItems || [];
    var found = null;
    for (var i = 0; i < localItems.length; i++) {
      if (localItems[i].id === itemId) { found = localItems[i]; break; }
    }
    if (found) {
      clickedItem = {
        id: found.id, type: found.type, icon: found.icon, iconCls: found.iconCls,
        title: found.title, sub: found.sub, tag: found.tag, ts: found.ts,
        navType: found.navType, navId: found.navId,
        isRead: true, readAt: new Date().toISOString()
      };
    }
  }
  if (clickedItem) {
    window._cloudNotifReadHistory = [clickedItem].concat(window._cloudNotifReadHistory || []).slice(0, 100);
    _saveHistoryToStore(window._cloudNotifReadHistory);
  }

  // 关闭面板
  closeNotifPanel();
  refreshNotifs(); // 更新角标

  // 导航
  if (navType === 'task') {
    if (typeof switchModule === 'function') switchModule('pm');
    setTimeout(function() {
      if (typeof openEditTask === 'function') openEditTask(navId);
    }, 120);

  } else if (navType === 'receipt') {
    if (typeof switchModule === 'function') switchModule('finance');
    setTimeout(function() {
      if (typeof switchTab === 'function') switchTab('receipt');
    }, 120);

  } else if (navType === 'payment') {
    if (typeof switchModule === 'function') switchModule('finance');
    setTimeout(function() {
      if (typeof switchTab === 'function') switchTab('payment');
    }, 120);

  } else if (navType === 'member') {
    if (typeof silentRoleSync === 'function') silentRoleSync();
    toast('你的权限已变更，页面已自动刷新', 'info');
  }
};

// 开关面板
window.toggleNotifPanel = function(e) {
  e.stopPropagation();
  var panel = document.getElementById('notif-panel');
  var trigger = document.getElementById('notif-trigger');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  if (isOpen) {
    closeNotifPanel();
  } else {
    // 保持当前 Tab 选择，首次默认未读
    var curTab = window._notifCurrentTab || 'unread';
    document.querySelectorAll('.notif-tab').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === curTab);
    });
    var readAllBtn = document.getElementById('notif-read-all-btn');
    if (readAllBtn) readAllBtn.style.display = curTab === 'read' ? 'none' : '';
    refreshNotifs();
    loadCloudNotifications(); // 每次打开面板时从服务器拉取最新通知（兜底 realtime）
    panel.style.display = 'block';
    if (trigger) trigger.classList.add('is-open');
  }
};

window.closeNotifPanel = function() {
  var panel = document.getElementById('notif-panel');
  var trigger = document.getElementById('notif-trigger');
  if (panel) panel.style.display = 'none';
  if (trigger) trigger.classList.remove('is-open');
};

// 全部已读
window.markAllNotifsRead = async function() {
  var items = window._notifItems || buildNotifItems();
  var newKeys = items.map(function(it) { return it.id; }).filter(function(id) {
    return !_getReadIds().includes(id);
  });

  // 批量同步本地已读到云端
  await _markLocalReadsBatch(newKeys);

  // 将未读的本地通知推入已读历史
  var nowTs = Date.now();
  var newlyReadItems = items.filter(function(it) {
    return newKeys.includes(it.id);
  }).map(function(found) {
    return {
      id: found.id, type: found.type, icon: found.icon, iconCls: found.iconCls,
      title: found.title, sub: found.sub, tag: found.tag, ts: found.ts,
      navType: found.navType, navId: found.navId,
      isRead: true, readAt: new Date().toISOString()
    };
  });
  if (newlyReadItems.length > 0) {
    window._cloudNotifReadHistory = newlyReadItems.concat(window._cloudNotifReadHistory || []).slice(0, 100);
    _saveHistoryToStore(window._cloudNotifReadHistory);
  }

  // 云端通知批量标记已读
  var cloudDbIds = (window._cloudNotifItems || []).map(function(c) { return c._dbId; }).filter(Boolean);
  if (cloudDbIds.length) {
    try {
      await sb.from('notifications').update({ is_read: true }).in('id', cloudDbIds);
    } catch(e) {
      console.warn('[Notification] batch markRead failed:', e);
    }
    window._cloudNotifItems = [];
  }
  refreshNotifs();
};

// 点击面板外关闭
document.addEventListener('click', function(e) {
  if (!e.target.closest('.notif-wrap')) {
    closeNotifPanel();
  }
}, true);

// 数据加载后自动刷新通知（在 loadState 末尾 render() 之后注入）
// 由于 render() 已在 loadState 里调用，此函数需要从外部挂钩
// 在 loadState() 的成功路径末尾找到 `if (!window._ganttSaving) render();`，
// 在其之后追加：if (typeof refreshNotifs === 'function') refreshNotifs();
