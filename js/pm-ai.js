/* ════════════════════════════════════════════════
 * pm-ai.js — PM Board AI 任务助手
 * v2.0 — 精细权限 · 报告式回答 · 写操作支持
 * 架构：Context Injection — 数据序列化后注入 DeepSeek API
 * ════════════════════════════════════════════════ */

// ── 配置 ────────────────────────────────────────────
const AI_CFG = {
  model:    'deepseek-v4-pro',
  maxTokens: 2000,
  baseURL:  'https://api.deepseek.com/v1',
};
var _aiApiKey = null;       // 从 app_settings 表加载（AES-GCM 解密）
var _aiKeyLoaded = false;   // 标记 Key 是否已从 DB 加载

// ── AES-GCM 加密/解密（SubtleCrypto）───────────────
async function _deriveCryptoKey() {
  var material = 'pm-board-ai-key-v1-rfjrkcclhvuldenpdlye';
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(material), 'PBKDF2', false, ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('pm-board-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function _encryptApiKey(plaintext) {
  var key = await _deriveCryptoKey();
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var enc = new TextEncoder();
  var encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext)
  );
  var combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode.apply(null, combined));
}

async function _decryptApiKey(ciphertext) {
  try {
    var key = await _deriveCryptoKey();
    var combined = new Uint8Array(atob(ciphertext).split('').map(function(c){ return c.charCodeAt(0); }));
    var iv = combined.slice(0, 12);
    var data = combined.slice(12);
    var decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, key, data
    );
    return new TextDecoder().decode(decrypted);
  } catch(e) { return null; }
}

// ── 从 DB 加载 API Key ─────────────────────────────
async function _loadApiKey() {
  if (typeof sb === 'undefined') { _aiKeyLoaded = true; return; }
  try {
    var { data, error } = await sb.from('app_settings').select('value').eq('key', 'deepseek_api_key').maybeSingle();
    if (error || !data) { _aiKeyLoaded = true; return; }
    var decrypted = await _decryptApiKey(data.value);
    if (decrypted) _aiApiKey = decrypted;
  } catch(e) { }
  _aiKeyLoaded = true;
}

// ── 保存 API Key（仅 super_admin 可调用）───────────
window.saveAiApiKey = async function(btn) {
  var input = document.getElementById('ai-apikey-input');
  if (!input) return;
  var newKey = input.value.trim();
  if (!newKey) {
    if (typeof toast === 'function') toast('请输入有效的 API Key', 'error');
    return;
  }
  if (newKey.indexOf('sk-') !== 0) {
    if (typeof toast === 'function') toast('API Key 格式不正确，应以 sk- 开头', 'error');
    return;
  }
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    var encrypted = await _encryptApiKey(newKey);
    if (typeof sb === 'undefined') throw new Error('数据库不可用');
    var { error } = await sb.from('app_settings').upsert({
      key: 'deepseek_api_key',
      value: encrypted,
      updated_at: new Date().toISOString(),
      updated_by: (currentUser && currentUser.name) || ''
    }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    _aiApiKey = newKey;
    input.value = '';
    document.getElementById('ai-key-status').textContent = '已配置';
    document.getElementById('ai-key-status').style.color = 'var(--green)';
    if (typeof toast === 'function') toast('API Key 已加密保存', 'success');
    _toggleApiKeySettings();
  } catch(e) {
    if (typeof toast === 'function') toast('保存失败：' + e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = '保存';
};

// ── API Key 设置面板开关（仅 super_admin 可见）────
window._toggleApiKeySettings = function() {
  var el = document.getElementById('ai-apikey-panel');
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
  } else {
    el.style.display = 'block';
    var inp = document.getElementById('ai-apikey-input');
    if (inp) setTimeout(function(){ inp.focus(); }, 100);
  }
};

// ── 历史持久化配置 ─────────────────────────────────
var AI_HISTORY_KEY = 'pm_ai_history_v1';
var AI_HISTORY_MAX = 20;

// ── 状态 ──────────────────────────────────────────
let _aiOpen = false;
let _aiHistory = _loadAiHistory();
let _aiSending = false;
var _aiAbortController = null;   // AbortController 用于中断流式响应

function _loadAiHistory() {
  try {
    var raw = localStorage.getItem(AI_HISTORY_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

function _saveAiHistory() {
  try {
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(_aiHistory));
  } catch (e) { }
}

function _restoreHistoryToDOM() {
  _aiHistory.forEach(function(msg) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      _appendMsg(msg.role, msg.content);
    }
  });
  var wrap = document.getElementById('ai-messages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

var _aiLoginCache = null;   // 今日登录记录缓存（V15：按需拉取）

// ── 日期工具 ──────────────────────────────────────
function _fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function _getMonday(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function _getSunday(d) {
  const m = _getMonday(d);
  const s = new Date(m);
  s.setDate(m.getDate() + 6);
  return s;
}
function _daysDiff(dateStr, today) {
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}
function _fmt(n) { return (n || 0).toLocaleString('zh-CN'); }

// ── 精细权限检查 ───────────────────────────────────
function _aiHasPerm(menuKey) {
  if (!currentUser) return false;
  if (currentUser.role === 'super_admin') return true;
  var perms = typeof getEffectiveMenuPerms === 'function' ? getEffectiveMenuPerms() : [];
  return perms.includes(menuKey);
}
function _aiHasPmAny() {
  return ['today','tasks','charts','gantt','projects','logs']
    .some(function(k) { return _aiHasPerm(k); });
}
function _aiHasFinanceAny() {
  return ['fin_t1','fin_receipt','fin_payment','fin_t4','fin_t5','fin_t6','fin_dashboard']
    .some(function(k) { return _aiHasPerm(k); });
}
function _aiHasBaseAny() {
  return ['basic_info','base_contracts','base_customers','base_suppliers']
    .some(function(k) { return _aiHasPerm(k); });
}

// ── 成员权限操作准入检查（V16-PERM）─────────────
function _aiCanManagePerms() {
  if (!currentUser) return false;
  if (!_aiHasPerm('members')) return false;
  return currentUser.role === 'super_admin';
}

function _aiCanManageMember(targetMember) {
  if (!currentUser || !targetMember) return false;
  if (currentUser.role === 'super_admin') {
    return targetMember.role !== 'super_admin';
  }
  if (currentUser.role === 'admin') {
    return targetMember.role === 'user';
  }
  return false;
}

function _aiCanGrantMenuKey(menuKey) {
  var SUPER_ADMIN_ONLY_KEYS = ['members', 'roles', 'system_config', 'basic_info'];
  if (SUPER_ADMIN_ONLY_KEYS.includes(menuKey)) {
    return currentUser && currentUser.role === 'super_admin';
  }
  return true;
}

// ── Finance 数据加载状态 ───────────────────────────
function _isFinanceDataLoaded() {
  return typeof finState !== 'undefined'
    && finState !== null
    && (finState.receipts && finState.receipts.length > 0
        || finState.payments && finState.payments.length > 0
        || finState.contractsUp && finState.contractsUp.length > 0);
}

// ── PM Context（按权限过滤）─────────────────────────
function _buildPmContext() {
  if (!_aiHasPmAny()) return null;

  var now = new Date(); now.setHours(0, 0, 0, 0);
  var todayStr = _fmtDate(now);
  var monStr = _fmtDate(_getMonday(now));
  var sunStr = _fmtDate(_getSunday(now));

  var memberMap = {};
  (state.members || []).forEach(function(m) { memberMap[m.id] = m.name; });

  var projectMap = {};
  (state.projects || []).forEach(function(p) { projectMap[p.id] = p.name; });

  var tasks = (state.tasks || []).map(function(t) {
    var daysUntil = t.due ? _daysDiff(t.due, now) : null;
    var isOverdue = daysUntil !== null && daysUntil < 0 && t.status !== '已完成';
    return {
      id:          t.id,
      title:       t.title,
      status:      t.status,
      priority:    t.priority || '普通',
      due:         t.due || null,
      startDate:   t.startDate || null,
      assignee:    memberMap[t.assigneeId] || '未分配',
      project:     projectMap[t.projectId] || '无项目',
      daysUntil:   daysUntil,
      overdue:     isOverdue,
      dueToday:    t.due === todayStr && t.status !== '已完成',
      dueThisWeek: t.due >= monStr && t.due <= sunStr && t.status !== '已完成',
      tags:        (t.tags || []).join('、') || null,
      subtaskCount: (t.subtasks ? t.subtasks.length : 0),
    };
  });

  return {
    today: todayStr,
    thisWeek: { start: monStr, end: sunStr },
    stats: {
      total:       tasks.length,
      open:        tasks.filter(function(t){return t.status!=='已完成'}).length,
      done:        tasks.filter(function(t){return t.status==='已完成'}).length,
      overdue:     tasks.filter(function(t){return t.overdue}).length,
      urgent:      tasks.filter(function(t){return t.priority==='紧急'&&t.status!=='已完成'}).length,
      dueToday:    tasks.filter(function(t){return t.dueToday}).length,
      dueThisWeek: tasks.filter(function(t){return t.dueThisWeek}).length,
    },
    tasks: tasks,
    projects: (state.projects || []).map(function(p) { return {
      id:           p.id,
      name:         p.name,
      members:      (p.members || []).map(function(id){return memberMap[id]}).filter(Boolean),
      totalTasks:   tasks.filter(function(t){return t.project===p.name}).length,
      openTasks:    tasks.filter(function(t){return t.project===p.name&&t.status!=='已完成'}).length,
      overdueTasks: tasks.filter(function(t){return t.project===p.name&&t.overdue}).length,
      urgentTasks:  tasks.filter(function(t){return t.project===p.name&&t.priority==='紧急'&&t.status!=='已完成'}).length,
    }; }),
    members: (state.members || []).filter(function(m){return m.role!=='super_admin'}).map(function(m) { return {
      id:           m.id,
      name:         m.name,
      role:         m.role==='admin'?'管理员':'成员',
      openTasks:    tasks.filter(function(t){return t.assignee===m.name&&t.status!=='已完成'}).length,
      overdueTasks: tasks.filter(function(t){return t.assignee===m.name&&t.overdue}).length,
      urgentTasks:  tasks.filter(function(t){return t.assignee===m.name&&t.priority==='紧急'&&t.status!=='已完成'}).length,
    }; }),
    tags: (state.globalTags || []).map(function(tg) {
      return { id: tg.id, name: tg.name };
    }),
  };
}

// ── Finance Context（按权限过滤）────────────────────
function _buildFinanceContext() {
  if (!_aiHasFinanceAny() || typeof finState === 'undefined' || !finState) return null;

  var perms = {
    t1:       _aiHasPerm('fin_t1'),
    receipt:  _aiHasPerm('fin_receipt'),
    payment:  _aiHasPerm('fin_payment'),
    t4:       _aiHasPerm('fin_t4'),
    t5:       _aiHasPerm('fin_t5'),
    t6:       _aiHasPerm('fin_t6'),
    dashboard:_aiHasPerm('fin_dashboard'),
  };

  var ctx = {
    currentMonth: typeof currentMonth !== 'undefined' ? currentMonth : '',
    config: (finState.config || {}),
  };

  if (perms.receipt) {
    ctx.receipts = (finState.receipts || []).map(function(r) { return {
      contractName:    r.contract_name,
      customerName:    r.customer_name,
      plannedAmount:   +(r.plan_amount || r.planned_amount) || 0,
      receivedAmount:  +(r.total_received || 0),
      completionRate:  (r.plan_amount || r.planned_amount) > 0 ? Math.round((+(r.total_received||0))/(+(r.plan_amount||r.planned_amount))*100) : 0,
      nextExpectedDate: r.next_expected_date || null,
      status:          r.status,
    }; });
  }

  if (perms.payment) {
    ctx.payments = (finState.payments || []).map(function(p) { return {
      contractName:   p.contract_name,
      supplierName:   p.supplier_name,
      planCash:       +(p.plan_cash || 0),
      planSupplyChain:+(p.plan_supply_chain || 0),
      totalPlan:      (+(p.plan_cash||0))+(+(p.plan_supply_chain||0)),
      paid:           +(p.total_paid || 0),
      nextDueDate:    p.next_expected_date || null,
    }; });
  }

  if (perms.t5) {
    ctx.actualReceipts = (finState.actualReceipts || []).map(function(r) { return {
      amount:       +(r.amount || 0),
      date:         r.receipt_date,
      contractName: r.contract_name,
      customerName: r.customer_name,
    }; });
    ctx.actualReceiptTotal = ctx.actualReceipts.reduce(function(s,r){return s+r.amount;}, 0);
  }

  if (perms.t6) {
    ctx.actualPayments = (finState.actualPayments || []).map(function(p) { return {
      amount:       +(p.amount || 0),
      date:         p.payment_date,
      supplierName: p.supplier_name,
      type:         (p.remark && p.remark.indexOf('[供应链]') >= 0) ? '供应链' : '现金',
    }; });
    ctx.actualPaymentTotal = ctx.actualPayments.reduce(function(s,p){return s+p.amount;}, 0);
  }

  if (perms.t4 || perms.dashboard) {
    ctx.summary = finState.summary || {};
    ctx.prevSummary = finState.prevSummary || {};
  }

  if (perms.t1) {
    ctx.monthlyPlanReceipt = (finState.receipts || []).reduce(function(s,r){return s+(+(r.plan_amount||r.planned_amount||0));}, 0);
    ctx.monthlyPlanPayment = (finState.payments || []).reduce(function(s,r){return s+(+(r.plan_cash||0))+(+(r.plan_supply_chain||0));}, 0);
  }

  return ctx;
}

// ── Base Context（按权限过滤）───────────────────────
function _buildBaseContext() {
  if (!_aiHasBaseAny() || typeof finState === 'undefined' || !finState) return null;

  var ctx = {};

  if (_aiHasPerm('basic_info')) {
    ctx.config = {
      companyName: (finState.config && finState.config.company_name) || '',
      deptName:    (finState.config && finState.config.dept_name) || '',
    };
  }

  if (_aiHasPerm('base_contracts')) {
    ctx.contractsUp = (finState.contractsUp || []).map(function(c) { return {
      name:              c.name,
      customerName:      c.customer_name || '',
      amount:            +(c.amount || 0),
      cumulativeReceived:+(c.cumulative_received || 0),
      completionRate:    +(c.amount||0) > 0 ? Math.round((+(c.cumulative_received||0))/(+(c.amount||0))*100) : 0,
      status:            c.status === 'active' ? '执行中' : '已结算',
      assessmentYear:    c.assessment_year || '',
    }; });
    ctx.contractsDown = (finState.contractsDown || []).map(function(c) { return {
      name:         c.name,
      supplierName: c.supplier_name || '',
      amount:       +(c.amount || 0),
      status:       c.status === 'active' ? '执行中' : '已结算',
    }; });
    ctx.contractStats = {
      upTotal:   ctx.contractsUp.reduce(function(s,c){return s+c.amount;}, 0),
      upActive:  ctx.contractsUp.filter(function(c){return c.status==='执行中'}).length,
      upSettled: ctx.contractsUp.filter(function(c){return c.status==='已结算'}).length,
      downTotal: ctx.contractsDown.reduce(function(s,c){return s+c.amount;}, 0),
    };
  }

  if (_aiHasPerm('base_customers')) {
    ctx.customers = (finState.customers || []).map(function(c) { return {
      name:           c.name,
      contractCount:  (finState.contractsUp || []).filter(function(x){return x.customer_id===c.id}).length,
      totalAmount:    (finState.contractsUp || []).filter(function(x){return x.customer_id===c.id}).reduce(function(s,x){return s+(+(x.amount||0));}, 0),
      activeContracts:(finState.contractsUp || []).filter(function(x){return x.customer_id===c.id&&x.status==='active'}).length,
    }; });
  }

  if (_aiHasPerm('base_suppliers')) {
    ctx.suppliers = (finState.suppliers || []).map(function(s) { return {
      name:          s.name,
      contractCount: (finState.contractsDown || []).filter(function(x){return x.supplier_id===s.id}).length,
      totalAmount:   (finState.contractsDown || []).filter(function(x){return x.supplier_id===s.id}).reduce(function(s2,x){return s2+(+(x.amount||0));}, 0),
    }; });
  }

  return ctx;
}

// ── Audit Context（系统审计：成员权限/登录记录）──
function _buildAuditContext() {
  var ctx = {};

  // 成员权限摘要（需要 members 权限）
  if (_aiHasPerm('members')) {
    var showSuperAdmin = currentUser && currentUser.role === 'super_admin';
    ctx.members = (state.members || []).filter(function(m) {
      if (m.role === 'super_admin' && !showSuperAdmin) return false;
      return true;
    }).map(function(m) {
      var perms = m.menuPerms != null ? m.menuPerms
        : (typeof getDefaultMenuPerms === 'function' ? getDefaultMenuPerms(m.role || 'user') : []);
      return {
        name: m.name,
        role: m.role === 'super_admin' ? '超级管理员' : m.role === 'admin' ? '管理员' : '普通用户',
        menuPerms: perms,
        permCount: perms.length,
        permSummary: _permGroupSummary(perms)
      };
    });
    ctx.memberCount = ctx.members.length;
  }

  // 今日登录记录（缓存在全局变量，异步拉取）
  if (typeof _aiLoginCache !== 'undefined' && _aiLoginCache) {
    ctx.todayLogins = _aiLoginCache;
  }

  return ctx;
}

// 权限分组摘要（给 AI 看的简短版）
function _permGroupSummary(perms) {
  var groups = { pm: [], finance: [], base: [], ai: [], admin: [] };
  var labels = { pm: 'PM', finance: '资金', base: '基础库', ai: 'AI', admin: '系统' };
  (typeof MENU_DEFS !== 'undefined' ? MENU_DEFS : []).forEach(function(md) {
    if (perms.includes(md.key)) groups[md.group].push(md.label);
  });
  var parts = [];
  Object.keys(groups).forEach(function(g) {
    if (groups[g].length) parts.push(labels[g] + '：' + groups[g].join('、'));
  });
  return parts.join(' | ') || '无权限';
}

// 查询今天的登录记录（仅 super_admin + logs 权限可用）
async function _fetchTodayLogins() {
  if (!currentUser || currentUser.role !== 'super_admin') return null;
  if (!_aiHasPerm('logs')) return null;
  if (typeof sb === 'undefined') return null;

  var today = _fmtDate(new Date());
  try {
    var { data, error } = await sb
      .from('logs')
      .select('user_name, created_at')
      .eq('action', '用户登录')
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return null;
    return data;
  } catch(e) { return null; }
}

// ── 完整 Context ───────────────────────────────────
function _buildFullContext() {
  var pmCtx  = _buildPmContext();
  var finCtx = _buildFinanceContext();
  var baseCtx = _buildBaseContext();
  var auditCtx = _buildAuditContext();

  var hasPm = pmCtx !== null;
  var hasFinance = finCtx !== null;
  var hasBase = baseCtx !== null;
  var hasAudit = auditCtx && (auditCtx.members || auditCtx.todayLogins);

  var userName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '';
  var userRole = (typeof currentUser !== 'undefined' && currentUser)
    ? (currentUser.role === 'super_admin' ? '超级管理员' : currentUser.role === 'admin' ? '管理员' : '成员')
    : '';

  return {
    meta: {
      today: _fmtDate(new Date()),
      thisWeek: { start: _fmtDate(_getMonday(new Date())), end: _fmtDate(_getSunday(new Date())) },
      activeModule: typeof activeModule !== 'undefined' ? activeModule : 'pm',
      userName: userName,
      userRole: userRole,
    },
    pm: pmCtx,
    finance: finCtx,
    base: baseCtx,
    audit: auditCtx,
    hasPm: hasPm,
    hasFinance: hasFinance,
    hasBase: hasBase,
    hasAudit: hasAudit,
    perms: {
      today:    _aiHasPerm('today'),
      tasks:    _aiHasPerm('tasks'),
      charts:   _aiHasPerm('charts'),
      gantt:    _aiHasPerm('gantt'),
      projects: _aiHasPerm('projects'),
      logs:     _aiHasPerm('logs'),
      members:  _aiHasPerm('members'),
      fin_t1:       _aiHasPerm('fin_t1'),
      fin_receipt:  _aiHasPerm('fin_receipt'),
      fin_payment:  _aiHasPerm('fin_payment'),
      fin_t4:       _aiHasPerm('fin_t4'),
      fin_t5:       _aiHasPerm('fin_t5'),
      fin_t6:       _aiHasPerm('fin_t6'),
      fin_dashboard:_aiHasPerm('fin_dashboard'),
      basic_info:      _aiHasPerm('basic_info'),
      base_contracts:  _aiHasPerm('base_contracts'),
      base_customers:  _aiHasPerm('base_customers'),
      base_suppliers:  _aiHasPerm('base_suppliers'),
      canWriteTask: _aiHasPerm('tasks'),
    },
  };
}

// ── 权限摘要文字 ──────────────────────────────────
function _permSummaryText(p) {
  var lines = [];
  if (p.today || p.tasks || p.charts || p.gantt || p.projects) {
    var pmItems = [];
    if (p.today) pmItems.push('今日看板');
    if (p.tasks) pmItems.push('全量任务');
    if (p.charts) pmItems.push('数据统计');
    if (p.gantt) pmItems.push('甘特图');
    if (p.projects) pmItems.push('项目列表');
    lines.push('项目管理：' + pmItems.join('、'));
  }
  if (p.logs) lines.push('操作日志' + (currentUser && currentUser.role === 'super_admin' ? '（含登录记录）' : ''));
  if (p.members) lines.push('成员管理（可查询成员权限）');
  if (p.fin_t1||p.fin_receipt||p.fin_payment||p.fin_t4||p.fin_t5||p.fin_t6||p.fin_dashboard) {
    var finItems = [];
    if (p.fin_t1) finItems.push('月度计划');
    if (p.fin_receipt) finItems.push('收款台账');
    if (p.fin_payment) finItems.push('付款计划');
    if (p.fin_t4) finItems.push('完成情况');
    if (p.fin_t5) finItems.push('实际收款');
    if (p.fin_t6) finItems.push('实际支付');
    if (p.fin_dashboard) finItems.push('资金看板');
    lines.push('资金计划：' + finItems.join('、'));
  }
  if (p.basic_info||p.base_contracts||p.base_customers||p.base_suppliers) {
    var baseItems = [];
    if (p.basic_info) baseItems.push('基础配置');
    if (p.base_contracts) baseItems.push('合同库');
    if (p.base_customers) baseItems.push('客户库');
    if (p.base_suppliers) baseItems.push('供应商库');
    lines.push('基础库：' + baseItems.join('、'));
  }
  if (p.canWriteTask) lines.push('可执行：任务状态/优先级/负责人更新、创建任务（需确认）');
  return lines.join('\n') || '（无数据访问权限）';
}

// ── System Prompt 构建 ─────────────────────────────
function _buildSystemPrompt(ctx) {
  var p = ctx.perms;
  var dow = ['日','一','二','三','四','五','六'][new Date().getDay()];

  var pmSection = '';
  if (ctx.pm) {
    var s = ctx.pm.stats;
    pmSection = '\n# 项目管理数据\n' +
      '## 总体统计\n' +
      '- 总任务：' + s.total + '，进行中：' + s.open + '，已完成：' + s.done + '\n' +
      '- 逾期：' + s.overdue + '，紧急（未完成）：' + s.urgent + '\n' +
      '- 今日到期：' + s.dueToday + '，本周到期：' + s.dueThisWeek + '\n\n' +
      '## 成员概况\n' +
      ctx.pm.members.map(function(m){ return '- ' + m.name + '（memberId: ' + m.id + '，' + m.role + '）：待完成 ' + m.openTasks + '，逾期 ' + m.overdueTasks + '，紧急 ' + m.urgentTasks; }).join('\n') + '\n\n' +
      '## 项目概况\n' +
      ctx.pm.projects.map(function(p){ return '- ' + p.name + '（projectId: ' + p.id + '）：进行中 ' + p.openTasks + '，逾期 ' + p.overdueTasks + '，成员[' + (p.members.join('、')||'无') + ']'; }).join('\n') + '\n\n' +
      '## 任务明细（完整列表）\n' + JSON.stringify(ctx.pm.tasks) + '\n';
  }

  var finSection = '';
  if (ctx.finance) {
    var f = ctx.finance;
    finSection = '\n# 资金计划数据（' + (f.currentMonth || '当前月份') + '）\n' +
      '公司：' + (f.config.company_name || '') + '  事业部：' + (f.config.dept_name || '') + '\n\n';
    if (f.receipts) {
      finSection += '## 收款台账（T2）\n计划收款合计：' + _fmt(f.receipts.reduce(function(s,r){return s+r.plannedAmount;},0)) + ' 元\n' + JSON.stringify(f.receipts) + '\n\n';
    }
    if (f.payments) {
      finSection += '## 付款计划（T3）\n' + JSON.stringify(f.payments) + '\n\n';
    }
    if (f.actualReceipts) {
      finSection += '## 实际收款（T5）\n已收合计：' + _fmt(f.actualReceiptTotal) + ' 元\n' + JSON.stringify(f.actualReceipts) + '\n\n';
    }
    if (f.actualPayments) {
      finSection += '## 实际支付（T6）\n已付合计：' + _fmt(f.actualPaymentTotal) + ' 元\n' + JSON.stringify(f.actualPayments) + '\n\n';
    }
  }

  var baseSection = '';
  if (ctx.base) {
    var b = ctx.base;
    baseSection = '\n# 基础库数据\n';
    if (b.contractsUp) {
      baseSection += '## 对上合同（' + b.contractsUp.length + ' 份，合同总额 ' + _fmt(b.contractStats.upTotal) + ' 元）\n' + JSON.stringify(b.contractsUp) + '\n\n';
    }
    if (b.contractsDown) {
      baseSection += '## 对下合同（' + b.contractsDown.length + ' 份）\n' + JSON.stringify(b.contractsDown) + '\n\n';
    }
    if (b.customers) {
      baseSection += '## 客户库（' + b.customers.length + ' 家）\n' + JSON.stringify(b.customers) + '\n\n';
    }
    if (b.suppliers) {
      baseSection += '## 供应商库（' + b.suppliers.length + ' 家）\n' + JSON.stringify(b.suppliers) + '\n\n';
    }
  }

  var auditSection = '';
  if (ctx.audit) {
    var a = ctx.audit;
    auditSection = '\n# 系统审计数据\n';
    if (a.members) {
      auditSection += '## 成员及其菜单权限（共 ' + a.memberCount + ' 人）\n';
      auditSection += a.members.map(function(m) {
        return '- ' + m.name + '（' + m.role + '）权限：' + m.permSummary;
      }).join('\n') + '\n\n';
    }
    if (a.todayLogins && a.todayLogins.length > 0) {
      auditSection += '## 今日登录记录（' + a.todayLogins.length + ' 条）\n';
      auditSection += a.todayLogins.map(function(l) {
        return '- ' + l.user_name + ' 登录于 ' + (l.created_at || '');
      }).join('\n') + '\n\n';
    } else if (a.todayLogins && a.todayLogins.length === 0) {
      auditSection += '## 今日登录记录\n暂无登录记录\n\n';
    }
  }

  var writeSection = '';
  if (p.canWriteTask) {
    writeSection = '你有权执行以下操作（需用户确认）：\n' +
      '- 更新任务状态：待启动 / 进行中 / 待反馈 / 已完成\n' +
      '- 更新任务优先级：紧急 / 重要 / 普通\n' +
      '- 更新任务负责人（仅限系统中已有成员）\n' +
      '- 创建新任务（需提供标题，截止日期和负责人可选）\n' +
      (_aiCanManagePerms()
        ? '- 授予/撤销成员菜单权限（需提供成员ID和完整的新权限数组）\n'
        : '') +
      '\n' +
      '执行格式（必须严格遵守，不要在 JSON 外加 markdown 代码块）：\n' +
      '当用户要求执行写操作时，你必须：\n' +
      '1. 确认操作目标（展示任务标题/新任务信息）\n' +
      '2. 在回答末尾加 [WRITE_ACTION] JSON\n' +
      '3. 等待用户确认，绝不自动执行\n\n' +
      '[WRITE_ACTION] 格式示例（每种操作对应不同的 type）：\n' +
      '更新状态：[WRITE_ACTION] {"type":"task_update","taskId":"ID","field":"status","value":"已完成","display":"将「任务名」标记为【已完成】"}\n' +
      '更新优先级：[WRITE_ACTION] {"type":"task_update","taskId":"ID","field":"priority","value":"紧急","display":"将「任务名」优先级设为【紧急】"}\n' +
      '更新负责人：[WRITE_ACTION] {"type":"task_update","taskId":"ID","field":"assigneeId","value":"成员ID","valueName":"成员姓名","display":"将「任务名」指派给【成员姓名】"}\n' +
      '创建任务：{"type":"task_create","projectId":"项目ID或null（从项目概况取 projectId）","title":"任务标题","assigneeId":"成员ID或null（从成员概况取 memberId）","due":"YYYY-MM-DD或null","startDate":"YYYY-MM-DD或null","priority":"紧急/重要/普通","status":"待启动/进行中","tags":[],"display":"创建任务「任务标题」"}\n' +
      (_aiCanManagePerms()
        ? '授予权限：[WRITE_ACTION] {"type":"member_perm_update","memberId":"成员ID","memberName":"成员姓名","action":"grant","keys":["ai_assistant"],"newPerms":["tod...（完整权限数组）"],"display":"给「成员姓名」添加「AI 助手」权限"}\n'
        : '') +
      '\n';
  } else {
    writeSection = '你目前没有任务写操作权限，如需修改任务状态，请让有权限的成员操作。\n';
  }

  // 权限操作规范（仅当用户有 members 权限 + admin 角色时才注入）
  var permOpSection = '';
  if (_aiCanManagePerms()) {
    var manageableMembers = (state.members || []).filter(function(m) {
      return _aiCanManageMember(m) && m.id !== currentUser.id;
    }).map(function(m) {
      var effectivePerms = m.menuPerms != null ? m.menuPerms
        : (typeof getDefaultMenuPerms === 'function' ? getDefaultMenuPerms(m.role) : []);
      return {
        id: m.id,
        name: m.name,
        role: m.role === 'admin' ? '管理员' : '普通用户',
        currentPerms: effectivePerms,
      };
    });

    var menuList = (typeof MENU_DEFS !== 'undefined' ? MENU_DEFS : [])
      .filter(function(md) { return md.group !== 'admin' || currentUser.role === 'super_admin'; })
      .map(function(md) { return md.key + '（' + md.label + '，分组：' + md.group + '）'; })
      .join('\n  ');

    permOpSection = '\n# 成员权限操作能力（V16-PERM）\n\n' +
      '你现在可以帮助管理员执行成员菜单权限变更，操作需要用户二次确认后执行。\n\n' +
      '## 可操作的成员列表\n' +
      JSON.stringify(manageableMembers) + '\n\n' +
      '## 所有菜单权限 Key\n  ' + menuList + '\n\n' +
      '## 权限操作限制（严格遵守）\n' +
      '- 你只能操作以上列表中的成员，不能操作列表外的人\n' +
      '- 不能修改成员的 role（角色），只能修改 menuPerms（菜单权限数组）\n' +
      (currentUser.role !== 'super_admin'
        ? '- 你无法授予 members、roles、system_config、basic_info 这类高级权限（需超级管理员）\n'
        : '') +
      '- 每次操作必须在回答末尾加 [WRITE_ACTION] JSON，等待用户确认\n' +
      '- 授权时，新的 menuPerms 是在成员现有权限数组基础上 **合并**（union），不是替换\n' +
      '- 撤权时，新的 menuPerms 是从现有数组中 **移除** 对应 key，不是清空\n\n' +
      '## 权限操作 [WRITE_ACTION] 格式（必须严格遵守，不要用 markdown 代码块包裹）\n' +
      '在回答末尾直接写：\n' +
      '[WRITE_ACTION] {"type":"member_perm_update","memberId":"成员ID","memberName":"成员姓名","action":"grant","keys":["menuKey"],"newPerms":["完整的新权限数组"],"display":"给「成员姓名」添加「权限名称」权限"}\n\n' +
      '**newPerms 字段说明**：这是操作后该成员应有的 **完整 menuPerms 数组**，由你根据 currentPerms + action 计算得出，前端直接用此数组覆盖写库，不做二次计算。\n\n' +
      '## 权限查询处理规范\n' +
      '- 被问「某人有什么权限」时：从可操作成员列表的 currentPerms 中查找并列出\n' +
      '- 被问「给某人开通 XX 权限」时：确认该 key 存在且在你的授权范围内，生成确认框\n' +
      '- 被问「撤销某人的 XX 权限」时：确认该 key 在其 currentPerms 中，生成确认框\n' +
      '- 找不到成员时：列出系统中的可操作成员，让用户确认\n\n';
  }

  return '# 身份\n' +
    '你是 PM Board 的内部智能助手。你的职责是基于系统实时数据，提供准确的查询分析和操作辅助。\n' +
    '你的回答必须像一份专业的工作汇报：有标题、有数据、有结论，可以直接发给上级。\n\n' +
    '# 当前环境\n' +
    '- 今天：' + (ctx.pm ? ctx.pm.today : ctx.meta.today) + '（周' + dow + '）\n' +
    '- 本周：' + (ctx.pm ? ctx.pm.thisWeek.start : ctx.meta.thisWeek.start) + ' 至 ' + (ctx.pm ? ctx.pm.thisWeek.end : ctx.meta.thisWeek.end) + '\n' +
    '- 当前模块：' + (ctx.meta.activeModule === 'finance' ? '资金计划' : '项目管理') + '\n' +
    '- 当前用户：' + (ctx.meta.userName || '') + '（' + (ctx.meta.userRole || '') + '）\n\n' +
    '# 用户权限范围\n' +
    '本次对话中，你只能回答以下权限范围内的问题：\n' +
    _permSummaryText(p) + '\n\n' +
    '如果被问到权限范围外的数据，回答："抱歉，你目前没有 [具体模块] 的访问权限，无法查询相关数据。"\n\n---\n' +
    pmSection + finSection + baseSection + auditSection + permOpSection + '---\n\n' +
    '# 回答格式规范\n\n' +
    '## 基础规则\n' +
    '1. 始终用中文\n' +
    '2. 金额统一用"元"，千分位格式（如 1,234,567 元），超过百万时同时标注（如 1,234,567 元（约 123 万元））\n' +
    '3. 日期格式：MM-DD（如 05-08），不写年份\n' +
    '4. 百分比保留一位小数（如 87.3%）\n' +
    '5. 不猜测没有的数据，没有就说没有\n\n' +
    '## 系统审计问题处理规范（V15 新增）\n' +
    '1. 成员权限查询：当被问到"某用户有哪些权限"时，从【系统审计数据→成员及其菜单权限】中查找，列出该成员的权限分组摘要\n' +
    '2. 全量权限列表：当被问到"所有成员的权限"时，从【系统审计数据】中以表格形式列出所有成员及其权限\n' +
    '3. 登录记录查询：当被问到"今天谁登录过"时，从【系统审计数据→今日登录记录】中列出，标注用户名和登录时间\n' +
    '4. 角色说明：super_admin = 超级管理员（全权限）、admin = 管理员、user = 普通用户\n' +
    '5. 权限建议：如需调整某成员权限，建议用户联系管理员在「成员管理→菜单权限」中操作\n\n' +
    '## 状态标注规范\n' +
    '- ⚠️ 逾期任务：必须标注逾期天数（如"⚠️ 逾期 3 天"）\n' +
    '- 🔴 今日到期（紧急程度高）\n' +
    '- 🟡 本周到期（需关注）\n' +
    '- ✅ 收款完成率 ≥ 90%\n' +
    '- ⚠️ 收款完成率 < 60%（欠佳）\n\n' +
    '## 报告型回答结构（用于汇报场景）\n' +
    '使用以下固定模板输出，方便用户直接复制汇报：\n' +
    '---\n**[报告标题]**\n📅 报告时间：[当前日期]\n\n**【核心结论】**\n[2-3 句话的结论，直接说结果]\n\n**【详细数据】**\n[数据列表或表格]\n\n**【风险提示】**（如有）\n[风险点列表]\n\n**【建议】**（如有）\n[可操作的建议]\n---\n\n' +
    '## 列表型回答\n' +
    '任务列表格式：\n' +
    '`[状态标注] 任务名 · 负责人 · 截止 MM-DD · [优先级]`\n\n' +
    '## 分析型回答\n' +
    '数据 → 结论 → 原因分析 → 建议，四段式结构。\n\n' +
    '## 逾期风险判断标准\n' +
    '- 已逾期：due < today && status ≠ 已完成\n' +
    '- 高风险：due 在 3 天内 && priority = 紧急 && status ≠ 已完成\n' +
    '- 中风险：due 在 7 天内 && status = 待启动\n' +
    '- 低风险：due 在 7 天内 && status = 进行中/待反馈\n\n---\n\n' +
    '# 写操作规范\n\n' + writeSection + '\n---\n\n' +
    '# 边界与限制\n' +
    '- 不分析权限范围外的数据\n' +
    '- 不编造、推测、补充不在数据中的信息\n' +
    '- 预测类回答必须注明"基于现有数据的估算"\n' +
    '- 财务数据不执行写操作（不论什么情况）\n' +
    '- 回答长度控制在 600 字以内（报告型可适当放宽至 800 字）';
}

// ── 关键词列表 ────────────────────────────────────
var FINANCE_KEYWORDS = [
  '收款', '付款', '回款', '合同金额', '资金', '财务', '预算', '资金计划',
  '月度计划', '实际收款', '实际支付', '完成率', '偏差分析', '收款台账',
  '付款计划', '资金看板', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6',
  '回款预测', '应收', '应付', '结款', '到款', '打款', '万元', '千元', '百万'
];
var CONTRACT_KEYWORDS = ['合同', '对上合同', '对下合同', '合同库', '合同金额', '结算', '执行中合同'];
var CUSTOMER_KEYWORDS = ['客户', '客户库', '客户名', '甲方'];
var SUPPLIER_KEYWORDS = ['供应商', '供应商库', '乙方', '分包'];

// ── 系统审计关键词（V15 新增）─────────────────
var LOGIN_KEYWORDS = ['登录', '登录记录', '谁登录过', '登录系统', '登录情况', '登录历史'];
var MEMBER_PERM_KEYWORDS = ['权限', '菜单权限', '有哪些权限', '能看什么', '能访问什么', '可见菜单', '权限配置', '权限列表'];
var MEMBER_LIST_KEYWORDS = ['成员列表', '有哪些用户', '用户列表', '谁在系统', '系统成员', '哪些成员', '成员信息'];
var SYSTEM_CONFIG_KEYWORDS = ['系统配置', '公司名称', '事业部', '部门名称'];

// ── 成员权限操作关键词（V16-PERM）──────────────────
var PERM_GRANT_KEYWORDS = [
  '开通', '授权', '添加权限', '给权限', '开权限', '赋予权限',
  '开通权限', '给他权限', '给她权限', '开通访问', '允许访问',
  '加上权限', '增加权限'
];
var PERM_REVOKE_KEYWORDS = [
  '撤销权限', '取消权限', '关闭权限', '移除权限', '禁用权限',
  '收回权限', '去掉权限', '删除权限', '不让他', '不让她'
];
var PERM_QUERY_KEYWORDS = [
  '有什么权限', '有哪些权限', '能看什么', '能访问什么',
  '权限是什么', '权限配置', '查看权限', '目前权限'
];
var PERM_WRITE_KEYWORDS = PERM_GRANT_KEYWORDS.concat(PERM_REVOKE_KEYWORDS);
var WRITE_KEYWORDS =[
  '标记为完成', '标记完成', '改成完成', '更新状态', '状态改为',
  '改为进行中', '改为待反馈', '改为待启动', '设为紧急', '优先级改为',
  '做完了', '完成了', '标记一下', '帮我改', '帮我标记', '标记为'
];

function _containsAnyKeyword(text, keywords) {
  return keywords.some(function(kw) { return text.indexOf(kw) >= 0; });
}

// ── 任务匹配（写操作）─────────────────────────────
function _matchTask(userInput) {
  var q = userInput.toLowerCase();
  var tasks = state.tasks || [];

  // 1. 精确匹配标题
  var exact = tasks.filter(function(t) { return t.title.toLowerCase() === q; });
  if (exact.length === 1) return exact;

  // 2. 包含匹配
  var contains = tasks.filter(function(t) { return t.title.toLowerCase().indexOf(q) >= 0; });
  if (contains.length === 1) return contains;

  // 3. 多结果 → 返回候选列表
  if (contains.length > 1) return contains;

  // 4. 无结果
  return [];
}

// ── 写操作解析 ─────────────────────────────────────
function _parseWriteAction(text) {
  // 支持多种格式：[WRITE_ACTION] {...} 或 [WRITE_ACTION] ```...{...}...```
  var match = text.match(/\[WRITE_ACTION\]\s*(\{[\s\S]*\})/);
  if (!match) return { text: text, action: null };
  try {
    var action = JSON.parse(match[1]);
    var cleanText = text.replace(/\[WRITE_ACTION\][\s\S]*/, '').trim();
    return { text: cleanText, action: action };
  } catch(e) { return { text: text, action: null }; }
}

// ── 确认组件 ───────────────────────────────────────
function _renderConfirmArea(action) {
  var safe = JSON.stringify(action).replace(/'/g, "\\'").replace(/"/g, '&quot;');

  var isPermOp = action.type === 'member_perm_update';
  var boxClass = isPermOp ? 'ai-confirm-box ai-confirm-box--perm' : 'ai-confirm-box';
  var confirmBtnClass = isPermOp ? 'ai-confirm-yes ai-confirm-yes--perm' : 'ai-confirm-yes';

  var detailHTML = '';
  if (isPermOp && action.keys && action.keys.length > 0) {
    var actionVerb = action.action === 'grant' ? '✅ 将授予' : '❌ 将撤销';
    var keyLabels = (action.keys || []).map(function(k) {
      var def = (typeof MENU_DEFS !== 'undefined' ? MENU_DEFS : []).find(function(m){ return m.key === k; });
      return def ? def.label : k;
    });
    detailHTML = '<div class="ai-confirm-detail">' +
      '<span class="ai-confirm-detail-verb">' + actionVerb + '</span>' +
      '<span class="ai-confirm-detail-keys">「' + keyLabels.join('」「') + '」</span>' +
      '<span class="ai-confirm-detail-target">→ ' + _esc(action.memberName || '') + '</span>' +
    '</div>';
  }

  return '<div class="' + boxClass + '">' +
    '<div class="ai-confirm-desc">' + _esc(action.display || '确认执行此操作？') + '</div>' +
    detailHTML +
    '<div class="ai-confirm-btns">' +
      '<button class="' + confirmBtnClass + '" onclick="aiConfirmWrite(\'' + safe + '\', this)">确认执行</button>' +
      '<button class="ai-confirm-no" onclick="aiCancelWrite(this)">取消</button>' +
    '</div>' +
  '</div>';
}

window.aiConfirmWrite = async function(actionStr, btn) {
  var action;
  try { action = JSON.parse(actionStr.replace(/&quot;/g, '"')); }
  catch(e) { return; }
  btn.disabled = true;
  btn.textContent = '执行中...';

  try {
    // ── 类型：task_update（更新任务字段：status / priority / assigneeId）──
    if (action.type === 'task_update' || action.type === 'task_status') {
      var task = (state.tasks || []).find(function(t) { return t.id === action.taskId; });
      if (!task) throw new Error('任务不存在或已被删除');
      var oldVal = task[action.field];
      task[action.field] = action.value;

      var updateObj = {};
      var fieldMap = { status: 'status', priority: 'priority', assigneeId: 'assignee', startDate: 'start_date', projectId: 'project_id', title: 'title', due: 'due' };
      var dbField = fieldMap[action.field] || action.field;
      updateObj[dbField] = action.value;

      if (action.field === 'status' && action.value === '已完成') {
        updateObj.completed_at = new Date().toISOString();
        updateObj.completed_by = (currentUser && currentUser.name) || '';
      }

      if (typeof sb !== 'undefined') {
        var res = await sb.from('tasks').update(updateObj).eq('id', action.taskId);
        if (res.error) throw new Error(res.error.message);
      }
      if (typeof logAction === 'function') {
        var logDetail = '「' + task.title + '」' + action.field + '：「' + (oldVal||'无') + '」→「' + (action.valueName || action.value) + '」';
        logAction('AI更新任务', logDetail);
      }
      if (typeof loadState === 'function') { loadState(true); }

    // ── 类型：task_create（创建新任务）──
    } else if (action.type === 'task_create') {
      if (!action.title || !action.title.trim()) throw new Error('任务标题不能为空');
      if (typeof uid !== 'function') throw new Error('uid() 函数不可用');

      var newTask = {
        id:          uid(),
        title:       action.title.trim(),
        status:      action.status || '待启动',
        priority:    action.priority || '普通',
        project_id:  action.projectId || null,
        assignee: action.assigneeId || null,
        due:         action.due || null,
        start_date:  action.startDate || null,
        created_at:  new Date().toISOString(),
        tags:        action.tags || [],
        subtasks:    [],
        dependencies: [],
      };

      if (typeof sb !== 'undefined') {
        var res = await sb.from('tasks').insert(newTask);
        if (res.error) throw new Error(res.error.message);
      }
      if (typeof logAction === 'function') {
        logAction('AI创建任务', '「' + newTask.title + '」' + (action.due ? ' 截止 ' + action.due : ''));
      }
      if (typeof loadState === 'function') { loadState(true); }

    // ── 类型：member_perm_update（成员菜单权限变更）──
    } else if (action.type === 'member_perm_update') {

      if (!_aiCanManagePerms()) {
        throw new Error('当前用户无权执行成员权限操作');
      }

      var targetMember = (state.members || []).find(function(m) { return m.id === action.memberId; });
      if (!targetMember) {
        throw new Error('找不到成员：' + (action.memberName || action.memberId));
      }

      if (!_aiCanManageMember(targetMember)) {
        throw new Error('无权操作该成员（角色层级限制）：' + targetMember.name);
      }

      if (!Array.isArray(action.newPerms)) {
        throw new Error('权限数组格式错误，请重新生成操作指令');
      }

      var SUPER_ADMIN_ONLY_KEYS = ['members', 'roles', 'system_config', 'basic_info'];
      var safeNewPerms = action.newPerms;
      if (currentUser.role !== 'super_admin') {
        var existingPerms = targetMember.menuPerms != null ? targetMember.menuPerms
          : (typeof getDefaultMenuPerms === 'function' ? getDefaultMenuPerms(targetMember.role) : []);
        var existingHighPerms = existingPerms.filter(function(k) {
          return SUPER_ADMIN_ONLY_KEYS.includes(k);
        });
        safeNewPerms = action.newPerms
          .filter(function(k) { return !SUPER_ADMIN_ONLY_KEYS.includes(k); })
          .concat(existingHighPerms);
      }

      safeNewPerms = safeNewPerms.filter(function(k, i, arr) { return arr.indexOf(k) === i; });

      if (typeof sb !== 'undefined') {
        var res = await sb.from('members')
          .update({ menu_perms: safeNewPerms })
          .eq('id', action.memberId);
        if (res.error) throw new Error(res.error.message);
      }

      if (targetMember) {
        targetMember.menuPerms = safeNewPerms;
      }

      if (typeof logAction === 'function') {
        var logDetail = '通过 AI 操作「' + targetMember.name + '」权限：' +
          (action.action === 'grant' ? '授予' : '撤销') +
          '「' + (action.keys || []).join('、') + '」' +
          '，新权限共 ' + safeNewPerms.length + ' 项';
        logAction('AI修改成员权限', logDetail);
      }

      if (action.memberId === currentUser.id) {
        currentUser.menuPerms = safeNewPerms;
        if (typeof applyMenuPerms === 'function') applyMenuPerms();
      }

    } else {
      throw new Error('未知操作类型：' + action.type);
    }

    btn.closest('.ai-confirm-box').innerHTML =
      '<div class="ai-confirm-done">已执行：' + _esc(action.display) + '</div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:4px">如需撤销，请在任务列表中手动操作。</div>';

  } catch(err) {
    btn.closest('.ai-confirm-box').innerHTML =
      '<div class="ai-confirm-err">执行失败：' + _esc(err.message) + '</div>';
  }
};

window.aiCancelWrite = function(btn) {
  btn.closest('.ai-confirm-box').innerHTML =
    '<div class="ai-confirm-done" style="color:var(--text3)">已取消，任务状态保持不变。</div>';
};

function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 快捷问题 Chips（按权限动态渲染）────────────────
function _renderQuickChips() {
  var chips = document.querySelector('.ai-quick-chips');
  if (!chips) return;

  var month = typeof currentMonth !== 'undefined' ? currentMonth : '本月';

  var allChips = [
    { label: '逾期任务', q: '当前有哪些逾期任务？按逾期天数列出', perm: 'tasks' },
    { label: '今日到期', q: '今天有哪些任务到期？', perm: 'today' },
    { label: '本周紧急', q: '本周有哪些紧急任务？分别是谁负责的？', perm: 'tasks' },
    { label: '项目风险', q: '各项目有哪些延期风险？给出风险评估报告', perm: 'gantt' },
    { label: '成员状态', q: '各成员目前的任务完成情况对比？', perm: 'charts' },
    { label: '收款进度', q: month + '收款完成情况？完成率多少？哪些合同还未收款？', perm: 'fin_receipt' },
    { label: '回款预测', q: '预测本月最终回款总额大概是多少？', perm: 'fin_t5' },
    { label: '待付清单', q: '本月还有哪些付款计划未完成？', perm: 'fin_payment' },
    { label: '资金报告', q: '生成本月资金情况综合报告', perm: 'fin_dashboard' },
    { label: '合同总览', q: '所有执行中的对上合同有哪些？总金额多少？', perm: 'base_contracts' },
    { label: '客户清单', q: '我们有哪些客户？各客户的合同情况？', perm: 'base_customers' },
    // ── 系统审计 Chips（V15）──
    { label: '成员权限', q: '各成员目前拥有哪些菜单权限？按成员列出', perm: 'members' },
    { label: '今日登录', q: '今天有哪些用户登录过系统？', perm: 'logs', superOnly: true },
    // ── 权限管理 Chips（V16-PERM，仅 admin+ 可见）──
    { label: '权限总览', q: '列出所有成员目前的权限配置', perm: 'members', adminOnly: true },
    { label: '开通 AI 助手', q: '我想给某个成员开通 AI 助手权限，请列出当前没有此权限的成员', perm: 'members', adminOnly: true },
    { label: '撤销权限', q: '我想撤销某个成员的部分权限，请列出所有成员及其当前权限', perm: 'members', adminOnly: true },
  ];

  var allowed = allChips.filter(function(c) {
    if (c.superOnly && (!currentUser || currentUser.role !== 'super_admin')) return false;
    if (c.adminOnly && (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'admin'))) return false;
    return _aiHasPerm(c.perm);
  });

  chips.innerHTML = allowed.map(function(c) {
    return '<button class="ai-quick-chip" onclick="askAiQuick(\'' + c.q.replace(/'/g, "\\'") + '\')">' + c.label + '</button>';
  }).join('');
}

// ── 权限标签 ───────────────────────────────────────
function _renderPermBadge() {
  var badge = document.getElementById('ai-perm-badge');
  if (!badge) return;
  var labels = [];
  if (_aiHasPmAny()) labels.push('PM');
  if (_aiHasFinanceAny()) labels.push('资金');
  if (_aiHasBaseAny()) labels.push('基础库');
  if (_aiHasPerm('members')) labels.push('成员');
  if (_aiHasPerm('logs') && currentUser && currentUser.role === 'super_admin') labels.push('审计');
  badge.textContent = labels.join(' · ') || '无权限';
}

// ── 欢迎卡片 ───────────────────────────────────────
function _renderWelcomeCard() {
  var userName = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.name : '';
  var taskCount = (state && state.tasks || []).filter(function(t){ return t.status !== '已完成'; }).length;
  var projectCount = (state && state.projects || []).length;
  var finLoaded = _isFinanceDataLoaded();
  var finMonth = typeof currentMonth !== 'undefined' ? currentMonth : '本月';

  var capHTML = '';
  if (_aiHasPmAny()) {
    capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">任务查询</span><span class="ai-cap-items">逾期/紧急/到期/成员维度/项目分析</span></div>';
  }
  if (_aiHasFinanceAny()) {
    capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">资金分析</span><span class="ai-cap-items">收款进度/付款计划/回款预测/综合报告</span></div>';
  }
  if (_aiHasBaseAny()) {
    capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">基础库</span><span class="ai-cap-items">合同/客户/供应商查询</span></div>';
  }
  if (_aiHasPerm('members')) {
    if (_aiCanManagePerms()) {
      capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">权限管理</span><span class="ai-cap-items">查询成员权限 · 授予/撤销菜单权限（需确认）</span></div>';
    } else {
      capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">系统审计</span><span class="ai-cap-items">成员权限查询/角色信息</span></div>';
    }
  }
  if (_aiHasPerm('logs') && currentUser && currentUser.role === 'super_admin') {
    capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">登录记录</span><span class="ai-cap-items">今日登录查询（超级管理员专属）</span></div>';
  }
  if (_aiHasPerm('tasks')) {
    capHTML += '<div class="ai-cap-group"><span class="ai-cap-label">快捷操作</span><span class="ai-cap-items">标记任务完成/更新状态/调整优先级/创建任务</span></div>';
  }

  var statusLine = '已加载 ' + taskCount + ' 个进行中任务 · ' + projectCount + ' 个项目';
  if (finLoaded) statusLine += ' · ' + finMonth + ' Finance 数据已就绪';

  // 如果有历史对话，显示恢复入口
  var historyHTML = '';
  if (_aiHistory.length > 0) {
    var lastMsg = _aiHistory[_aiHistory.length - 1];
    var preview = (lastMsg.content || '').slice(0, 40);
    if (preview.length === 40) preview += '...';
    historyHTML = '<div class="ai-history-tip" onclick="window.clearAiChat()" title="点击开始新对话">' +
      '<span class="ai-history-icon">💬</span>' +
      '<span>已恢复上次对话 · 上次：' + _esc(preview) + '</span>' +
      '<button class="ai-history-clear" onclick="event.stopPropagation();window.clearAiChat()">新对话</button>' +
      '</div>';
  }

  return '<div class="ai-welcome-card">' +
    '<div class="ai-welcome-header">' +
      '<span class="ai-welcome-icon"></span>' +
      '<div>' +
        '<div class="ai-welcome-title">你好，' + _esc(userName || '用户') + '</div>' +
        '<div class="ai-welcome-sub">' + statusLine + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ai-welcome-body">' + capHTML + historyHTML + '</div>' +
  '</div>';
}

// ── API Key 状态指示 ──────────────────────────────
function _renderApiKeyStatus() {
  var isSuper = currentUser && currentUser.role === 'super_admin';
  var gearBtn = document.getElementById('ai-key-gear-btn');
  var statusEl = document.getElementById('ai-key-status');

  if (gearBtn) gearBtn.style.display = isSuper ? 'flex' : 'none';
  if (statusEl) {
    if (_aiApiKey) {
      statusEl.textContent = '已配置';
      statusEl.style.color = 'var(--green)';
    } else {
      statusEl.textContent = isSuper ? '未配置' : '';
      statusEl.style.color = 'var(--amber)';
    }
  }
}

// ── 面板开关 ──────────────────────────────────────
window.toggleAiPanel = function() {
  _aiOpen ? _closeAiPanel() : _openAiPanel();
};
window.closeAiPanel = function() { _closeAiPanel(); };

// ── 主动提示生成（轻量调用，仅统计数据）────
async function _generateProactiveInsight() {
  if (!_aiHasPmAny()) return;
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var todayStr = _fmtDate(now);
  var tasks = state.tasks || [];
  var overdue = tasks.filter(function(t){ return t.due && t.due < todayStr && t.status !== '已完成'; });
  var dueToday = tasks.filter(function(t){ return t.due === todayStr && t.status !== '已完成'; });
  var urgent = tasks.filter(function(t){ return t.priority === '紧急' && t.status !== '已完成'; });

  var tips = [];
  if (overdue.length > 0) {
    tips.push('⚠️ 有 **' + overdue.length + '** 个任务已逾期');
  }
  if (dueToday.length > 0) {
    tips.push('🔴 今日到期 **' + dueToday.length + '** 个');
  }
  if (urgent.length > 0) {
    tips.push('🚨 **' + urgent.length + '** 个紧急任务待处理');
  }

  if (tips.length === 0) {
    var done = tasks.filter(function(t){ return t.status === '已完成'; }).length;
    if (done > 0) tips.push('✅ 已完成 **' + done + '** 个任务，进展良好');
  }

  if (tips.length === 0) return;

  var insightHTML = '<div class="ai-proactive-tip">' +
    '<div class="ai-proactive-header">📊 当前状态速览</div>' +
    '<div class="ai-proactive-body">' + tips.map(function(t){ return _renderMd(t); }).join(' · ') + '</div>' +
    '<div class="ai-proactive-actions">' +
      (overdue.length > 0 ? '<button class="ai-quick-chip" onclick="askAiQuick(\'当前有哪些逾期任务？\')">查看逾期任务</button>' : '') +
      (urgent.length > 0 ? '<button class="ai-quick-chip" onclick="askAiQuick(\'当前紧急任务有哪些？\')">查看紧急任务</button>' : '') +
    '</div>' +
  '</div>';

  _appendMsg('welcome', insightHTML);
}

function _openAiPanel() {
  if (!_aiHasPerm('ai_assistant')) {
    if (typeof toast === 'function') toast('你没有 AI 助手的访问权限，请联系管理员开通', 'error');
    return;
  }
  _aiOpen = true;
  document.getElementById('ai-panel').classList.add('open');
  document.getElementById('ai-panel-overlay').classList.add('show');
  document.getElementById('ai-trigger-btn').classList.add('active');

  localStorage.setItem('pm_ai_seen_v1', '1');
  var badge = document.querySelector('.ai-new-badge');
  if (badge) badge.remove();

  _renderQuickChips();
  _renderPermBadge();
  _renderApiKeyStatus();

  var wrap = document.getElementById('ai-messages');
  var alreadyRendered = wrap && wrap.children.length > 0;

  if (!alreadyRendered) {
    _appendMsg('welcome', _renderWelcomeCard());
    if (_aiHistory.length > 0) {
      _restoreHistoryToDOM();
    }
    // 首次打开时，生成一条主动提示
    if (_aiHistory.length === 0) {
      setTimeout(_generateProactiveInsight, 800);
    }
  }

  setTimeout(function() {
    var inp = document.getElementById('ai-input');
    if (inp) inp.focus();
  }, 300);
}

function _closeAiPanel() {
  _aiOpen = false;
  document.getElementById('ai-panel').classList.remove('open');
  document.getElementById('ai-panel-overlay').classList.remove('show');
  document.getElementById('ai-trigger-btn').classList.remove('active');
}

// ── 首次使用引导徽章 ──────────────────────────────
window.initAiBadge = function() {
  var seen = localStorage.getItem('pm_ai_seen_v1');
  if (!seen) {
    var btn = document.getElementById('ai-trigger-btn');
    if (btn) {
      var badge = document.createElement('span');
      badge.className = 'ai-new-badge';
      badge.textContent = 'N';
      btn.appendChild(badge);
    }
  }
};

// ── 清空对话 ──────────────────────────────────────
window.clearAiChat = function() {
  _aiHistory = [];
  _saveAiHistory();
  var el = document.getElementById('ai-messages');
  if (el) el.innerHTML = '';
  _appendMsg('welcome', _renderWelcomeCard());
};

// ── 快捷问题 ──────────────────────────────────────
window.askAiQuick = function(q) {
  var input = document.getElementById('ai-input');
  if (!input) return;
  input.value = q;
  _autoResize(input);
  window.sendAiMsg();
};

// ── 发送消息 ──────────────────────────────────────
window.sendAiMsg = async function() {
  if (_aiSending) return;
  var input  = document.getElementById('ai-input');
  var sendBtn = document.getElementById('ai-send-btn');
  var question = input.value.trim();
  if (!question) return;

  // API Key 未配置
  if (!_aiApiKey) {
    _appendMsg('user', question);
    _appendMsg('assistant',
      'AI 助手尚未配置 API Key，无法回答。\n\n' +
      (currentUser && currentUser.role === 'super_admin'
        ? '你是超级管理员，可以点击面板顶部的 ⚙ 设置按钮来配置 DeepSeek API Key。'
        : '请联系超级管理员配置 DeepSeek API Key 后再使用 AI 助手。')
    );
    input.value = '';
    _autoResize(input);
    input.focus();
    return;
  }

  // 前端权限拦截：财务关键词 → 需要任一 Finance 权限
  if (_containsAnyKeyword(question, FINANCE_KEYWORDS) && !_aiHasFinanceAny()) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    _appendMsg('assistant',
      '抱歉，你目前没有资金计划模块的访问权限，无法查询财务相关数据。\n\n' +
      '如需查询财务信息，请联系系统管理员开通相关权限。'
    );
    input.focus();
    return;
  }

  // 前端权限拦截：合同关键词 → 需要 base_contracts 权限（精确匹配）
  if (_containsAnyKeyword(question, CONTRACT_KEYWORDS) && !_aiHasPerm('base_contracts')) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    _appendMsg('assistant',
      '抱歉，你目前没有合同库的访问权限，无法查询合同相关数据。\n\n' +
      '如需查询合同信息，请联系系统管理员开通「基础库配置 → 合同库」权限。'
    );
    input.focus();
    return;
  }

  // 前端权限拦截：客户关键词 → 需要 base_customers 权限
  if (_containsAnyKeyword(question, CUSTOMER_KEYWORDS) && !_aiHasPerm('base_customers')) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    _appendMsg('assistant',
      '抱歉，你目前没有客户库的访问权限，无法查询客户相关数据。\n\n' +
      '如需查询客户信息，请联系系统管理员开通「基础库配置 → 客户库」权限。'
    );
    input.focus();
    return;
  }

  // 前端权限拦截：供应商关键词 → 需要 base_suppliers 权限
  if (_containsAnyKeyword(question, SUPPLIER_KEYWORDS) && !_aiHasPerm('base_suppliers')) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    _appendMsg('assistant',
      '抱歉，你目前没有供应商库的访问权限，无法查询供应商相关数据。\n\n' +
      '如需查询供应商信息，请联系系统管理员开通「基础库配置 → 供应商库」权限。'
    );
    input.focus();
    return;
  }

  // 前端权限拦截：登录记录关键词 → 仅 super_admin + logs 权限可问
  if (_containsAnyKeyword(question, LOGIN_KEYWORDS)) {
    var canSeeLogins = _aiHasPerm('logs') && currentUser && currentUser.role === 'super_admin';
    if (!canSeeLogins) {
      input.value = '';
      _autoResize(input);
      _appendMsg('user', question);
      _appendMsg('assistant',
        '抱歉，登录记录仅限超级管理员查询。\n\n' +
        '如需查看登录日志，请联系超级管理员。'
      );
      input.focus();
      return;
    }
  }

  // 前端权限拦截：成员权限/列表关键词 → 需要 members 权限
  if ((_containsAnyKeyword(question, MEMBER_PERM_KEYWORDS) || _containsAnyKeyword(question, MEMBER_LIST_KEYWORDS)) && !_aiHasPerm('members')) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    _appendMsg('assistant',
      '抱歉，你目前没有成员管理的访问权限，无法查询成员信息和权限配置。\n\n' +
      '如需查询成员信息，请联系系统管理员开通「系统管理 → 成员管理」权限。'
    );
    input.focus();
    return;
  }

  // 前端权限拦截：系统配置关键词 → 需要 basic_info 或 system_config 权限
  if (_containsAnyKeyword(question, SYSTEM_CONFIG_KEYWORDS) && !_aiHasPerm('basic_info') && !_aiHasPerm('system_config')) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    _appendMsg('assistant',
      '抱歉，你目前没有系统配置或基础信息配置的访问权限，无法查询系统配置信息。\n\n' +
      '如需查询系统配置，请联系系统管理员开通相关权限。'
    );
    input.focus();
    return;
  }

  // 前端权限拦截：成员权限变更关键词 → 需要 members 权限 + admin 角色
  if (_containsAnyKeyword(question, PERM_WRITE_KEYWORDS)) {
    if (!_aiCanManagePerms()) {
      input.value = '';
      _autoResize(input);
      _appendMsg('user', question);
      _appendMsg('assistant',
        '抱歉，只有管理员才能通过 AI 执行成员权限变更。\n\n' +
        '如需调整成员权限，请联系系统管理员在「成员管理 → 菜单权限」中操作。'
      );
      input.focus();
      return;
    }
  }

  // Finance 数据未加载引导
  if (_containsAnyKeyword(question, FINANCE_KEYWORDS) && _aiHasFinanceAny() && !_isFinanceDataLoaded()) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    if (typeof switchModule === 'function') {
      _appendMsg('assistant',
        '资金数据尚未加载。\n\n' +
        '请先切换到【资金计划】模块，等数据加载完成后再来问我，我就能给你准确的分析了。\n\n' +
        '<button class="ai-goto-btn" onclick="switchModule(\'finance\');closeAiPanel()">切换到资金计划</button>'
      );
    } else {
      _appendMsg('assistant',
        '资金数据尚未加载。\n\n' +
        '请先切换到【资金计划】模块，等数据加载完成后再来问我，我就能给你准确的分析了。'
      );
    }
    input.focus();
    return;
  }

  // 基础库数据未加载引导（合同/客户/供应商，数据来自 Finance 模块 loadAll()）
  if ((_containsAnyKeyword(question, CONTRACT_KEYWORDS) || _containsAnyKeyword(question, CUSTOMER_KEYWORDS) || _containsAnyKeyword(question, SUPPLIER_KEYWORDS))
      && _aiHasBaseAny() && !_isFinanceDataLoaded()) {
    input.value = '';
    _autoResize(input);
    _appendMsg('user', question);
    if (typeof switchModule === 'function') {
      _appendMsg('assistant',
        '基础库数据尚未加载。\n\n' +
        '合同、客户、供应商数据需要先从【资金计划】模块加载，请先切换到资金计划模块再回来问我。\n\n' +
        '<button class="ai-goto-btn" onclick="switchModule(\'finance\');closeAiPanel()">切换到资金计划</button>'
      );
    } else {
      _appendMsg('assistant',
        '基础库数据尚未加载，请先切换到【资金计划】模块后再提问。'
      );
    }
    input.focus();
    return;
  }

  input.value = '';
  _autoResize(input);

  _appendMsg('user', question);

  var placeholderId = 'ai-p-' + Date.now();
  _appendMsg('assistant', null, placeholderId);

  _aiSending = true;
  if (sendBtn) sendBtn.disabled = true;
  _aiAbortController = new AbortController();
  var stopBtn = document.getElementById('ai-stop-btn');
  if (stopBtn) { stopBtn.style.display = 'flex'; }
  if (sendBtn) { sendBtn.style.display = 'none'; }

  try {
    // 如果询问登录记录，先拉取今日登录数据
    if (_containsAnyKeyword(question, LOGIN_KEYWORDS) && _aiHasPerm('logs') && currentUser && currentUser.role === 'super_admin') {
      try { _aiLoginCache = await _fetchTodayLogins(); } catch(e) { _aiLoginCache = null; }
    } else {
      _aiLoginCache = null;
    }
    var ctx = _buildFullContext();
    var systemPrompt = _buildSystemPrompt(ctx);
    var messages = _aiHistory.concat([{ role: 'user', content: question }]);

    var res = await fetch(AI_CFG.baseURL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + _aiApiKey,
      },
      body: JSON.stringify({
        model: AI_CFG.model,
        max_tokens: AI_CFG.maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
        ].concat(messages),
      }),
      signal: _aiAbortController.signal,
    });

    if (!res.ok) {
      var errMsg = 'HTTP ' + res.status;
      try { var e = await res.json(); errMsg = e.error && e.error.message || errMsg; } catch(_) {}
      throw new Error(errMsg);
    }

    // 流式读取
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var fullAnswer = '';
    var buffer = '';

    while (true) {
      var _ref = await reader.read();
      var done = _ref.done;
      var value = _ref.value;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      var lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line === 'data: [DONE]') continue;
        if (!line.startsWith('data: ')) continue;

        try {
          var chunk = JSON.parse(line.slice(6));
          var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          if (delta && delta.content) {
            fullAnswer += delta.content;
            var el = document.getElementById(placeholderId);
            if (el) {
              el.querySelector('.ai-msg-bubble').innerHTML =
                _esc(fullAnswer) + '<span class="ai-stream-cursor">▋</span>';
              var wrap = document.getElementById('ai-messages');
              if (wrap) wrap.scrollTop = wrap.scrollHeight;
            }
          }
        } catch (_) { }
      }
    }

    // 流结束后做完整 Markdown 渲染
    var parsed = _parseWriteAction(fullAnswer);
    var displayContent = _renderMd(parsed.text);
    if (parsed.action) {
      displayContent += _renderConfirmArea(parsed.action);
    }
    _updateMsg(placeholderId, displayContent);
    // 流式消息补上操作工具栏（placeholder 创建时无 toolbar）
    (function(){
      var el = document.getElementById(placeholderId);
      if (!el || el.querySelector('.ai-msg-toolbar')) return;
      el.insertAdjacentHTML('beforeend',
        '<div class="ai-msg-toolbar">' +
        '<button class="ai-msg-btn" onclick="_copyAiMsg(this)" title="复制内容">' +
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1"/></svg>' +
        ' 复制</button>' +
        '<button class="ai-msg-btn" onclick="_retryAiMsg(this)" title="重新生成">↻ 重新生成</button>' +
        '</div>');
    })();

    var answer = fullAnswer;

    _aiHistory.push({ role: 'user', content: question });
    _aiHistory.push({ role: 'assistant', content: answer });
    if (_aiHistory.length > AI_HISTORY_MAX) _aiHistory = _aiHistory.slice(-AI_HISTORY_MAX);
    _saveAiHistory();

  } catch(err) {
    if (err.name === 'AbortError') {
      var el2 = document.getElementById(placeholderId);
      if (el2) {
        var bubble2 = el2.querySelector('.ai-msg-bubble');
        var currentText = ((bubble2 && bubble2.textContent) || '').replace(/▋/g, '').trim();
        if (currentText && currentText.length > 0) {
          _updateMsg(placeholderId, _renderMd(currentText) + '\n\n<span style="color:var(--text3);font-size:11px">（已中断）</span>');
        } else {
          _updateMsg(placeholderId, '<span style="color:var(--text3)">已中断</span>');
        }
      }
    } else {
      _updateMsg(placeholderId, '请求失败：' + _esc(err.message) + '\n\n请检查 API Key 是否配置正确。');
    }
  } finally {
    _aiSending = false;
    _aiAbortController = null;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = 'flex'; }
    var stopBtn2 = document.getElementById('ai-stop-btn');
    if (stopBtn2) { stopBtn2.style.display = 'none'; }
    input.focus();
  }
};

// ── 中断流式响应 ──────────────────────────────────
window.stopAiMsg = function() {
  if (_aiAbortController) {
    _aiAbortController.abort();
    _aiAbortController = null;
  }
};

// ── 键盘快捷键 ────────────────────────────────────
window.aiInputKeydown = function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    window.sendAiMsg();
  }
};

window.onAiInputChange = function(el) { _autoResize(el); };

function _autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── 消息操作函数 ──────────────────────────────────
window._copyAiMsg = function(btn) {
  var bubble = btn.closest('.ai-msg.ai-msg-assistant').querySelector('.ai-msg-bubble');
  if (!bubble) return;
  var text = bubble.innerText || bubble.textContent || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      var orig = btn.innerHTML;
      btn.innerHTML = '✓ 已复制';
      btn.style.color = 'var(--green)';
      setTimeout(function() {
        btn.innerHTML = orig;
        btn.style.color = '';
      }, 2000);
    });
  }
};

window._retryAiMsg = function(btn) {
  if (_aiHistory.length < 2) return;
  var lastUserMsg = null;
  for (var i = _aiHistory.length - 1; i >= 0; i--) {
    if (_aiHistory[i].role === 'user') {
      lastUserMsg = _aiHistory[i].content;
      break;
    }
  }
  if (!lastUserMsg) return;
  _aiHistory = _aiHistory.slice(0, -2);
  _saveAiHistory();
  var wrap = document.getElementById('ai-messages');
  if (wrap) {
    var msgs = wrap.querySelectorAll('.ai-msg');
    if (msgs.length >= 2) {
      msgs[msgs.length - 1].remove();
      msgs[msgs.length - 2].remove();
    }
  }
  var input = document.getElementById('ai-input');
  if (input) {
    input.value = lastUserMsg;
    window.sendAiMsg();
  }
};

// ── DOM 操作 ──────────────────────────────────────
function _appendMsg(role, content, id) {
  var wrap = document.getElementById('ai-messages');
  if (!wrap) return;

  var div = document.createElement('div');
  div.className = 'ai-msg ai-msg-' + role;
  if (id) div.id = id;

  if (content === null) {
    div.innerHTML = '<div class="ai-msg-bubble"><span class="ai-typing"><span></span><span></span><span></span></span></div>';
  } else if (role === 'welcome') {
    div.innerHTML = content;
  } else {
    // assistant 消息经过 Markdown 渲染；user 消息直接转义显示
    var rendered = (role === 'assistant') ? _renderMd(content || '') : _esc(content || '');
    var toolbarHTML = '';
    if (role === 'assistant' && content) {
      toolbarHTML = '<div class="ai-msg-toolbar">' +
        '<button class="ai-msg-btn" onclick="_copyAiMsg(this)" title="复制内容">' +
          '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1"/></svg>' +
          ' 复制' +
        '</button>' +
        '<button class="ai-msg-btn" onclick="_retryAiMsg(this)" title="重新生成">↻ 重新生成</button>' +
      '</div>';
    }
    div.innerHTML = '<div class="ai-msg-bubble">' + rendered + '</div>' + toolbarHTML;
  }

  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function _updateMsg(id, content) {
  var el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.ai-msg-bubble').innerHTML = content || '';
  var wrap = document.getElementById('ai-messages');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

// ── 极简 Markdown 渲染 ────────────────────────────
function _renderMd(text) {
  if (!text) return '';
  var html = text;

  // 1. 转义危险 HTML（仅转义原始文本中的特殊字符，保留后续标签生成）
  html = html.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');

  // 2. 标题（## 和 ###）
  html = html.replace(/^###\s+(.+)$/gm,
    '<div style="font-weight:500;font-size:12px;color:var(--text2);margin:8px 0 3px">$1</div>');
  html = html.replace(/^##\s+(.+)$/gm,
    '<div style="font-weight:500;font-size:13px;color:var(--text);margin:10px 0 4px;border-bottom:1px solid var(--border);padding-bottom:3px">$1</div>');
  html = html.replace(/^#\s+(.+)$/gm,
    '<div style="font-weight:500;font-size:14px;color:var(--text);margin:12px 0 5px">$1</div>');

  // 3. 加粗和内联代码
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`\n]+)`/g,
    '<code style="background:var(--surface3);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>');

  // 4. 分隔线
  html = html.replace(/^---$/gm,
    '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">');

  // 5. 无序列表（- 或 • 开头）
  html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');

  // 6. 有序列表
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>');

  // 7. 将连续 li 包裹在 ul 中
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, function(m) {
    return '<ul style="margin:5px 0;padding-left:18px;line-height:1.7">' + m + '</ul>';
  });

  // 8. 换行处理（在已转换的块级元素后不重复加 br）
  html = html.replace(/\n\n/g, '<br>');
  html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');

  return html;
}

// 页面加载后初始化
function _initAi() {
  initAiBadge();
  _loadApiKey();
}
if (document.readyState === 'complete') { _initAi(); } else { window.addEventListener('load', function() { setTimeout(_initAi, 600); }); }
