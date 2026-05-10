/* ════════════════════════════════════════════════
 * invest-core.js — 投资测算核心：状态/路由/权限/数据加载
 * 依赖：pm-core.js（sb, currentUser, uid, escHtml, toast, isAdmin,
 *       getEffectiveMenuPerms, hasGroupPerm, logAction）
 * ════════════════════════════════════════════════ */

// ── 全局状态 ──
var currentInvTab = 'inv_list';
var currentCalcProjectId = null;
var currentEditVersionId = null;
var currentInvStep = 'land';
var invState = {
  projects: [],
  versions: [],
  currentVersion: null,
  lands: [],
  inputs: {},
  outputs: {},
  sensitivityItems: []
};

// ── 临时编辑状态（保存时才写入 DB）──
var _editLands = [];
var _editInputs = {};
var _editOutputs = {};

// ── Tab 路由定义 ──
var INV_TAB_PERM_MAP = {
  'inv_list':        'inv_list',
  'inv_calc':        'inv_calc',
  'inv_edit':        'inv_edit',
  'inv_grid':        'inv_edit',
  'inv_logs':        'inv_logs',
  'inv_sensitivity': 'inv_sensitivity'
};

var INV_TAB_TITLES = {
  'inv_list':        '投资项目列表',
  'inv_calc':        '项目测算',
  'inv_edit':        '测算编辑',
  'inv_grid':        '表格编辑',
  'inv_logs':        '操作日志',
  'inv_sensitivity': '敏感性分析'
};

var INV_STEPS = [
  { key: 'land',    label: '土地信息' },
  { key: 'product', label: '产品规划' },
  { key: 'cost',    label: '成本分摊' },
  { key: 'area',    label: '按建面分摊' },
  { key: 'pay',     label: '支付计划' },
  { key: 'sales',   label: '销售计划' }
];

var INV_OUTPUT_STEPS = [
  { key: 'composite', label: '综合指标表' },
  { key: 'vat',       label: '土地增值税计算表' },
  { key: 'cashflow',  label: '现金流量表' },
  { key: 'profit',    label: '利润表' },
  { key: 'total',     label: '总投资输出' },
  { key: 'verify',    label: '计算校验' }
];

// ── Tab 路由 ──
window.switchInvTab = function(tab) {
  var permKey = INV_TAB_PERM_MAP[tab];
  if (!permKey) return;
  var allowed = getEffectiveMenuPerms();
  if (!allowed.includes(permKey)) {
    if (typeof toast === 'function') toast('没有「' + (INV_TAB_TITLES[tab] || tab) + '」的访问权限', 'warning');
    var tabs = Object.keys(INV_TAB_PERM_MAP);
    for (var i = 0; i < tabs.length; i++) {
      if (allowed.includes(INV_TAB_PERM_MAP[tabs[i]])) {
        currentInvTab = tabs[i]; invRender(); return;
      }
    }
    return;
  }
  currentInvTab = tab;
  invRender();
};

function invRender() {
  var main = document.getElementById('main-content');
  if (!main) return;
  main.style.display = '';
  var settingsContent = document.getElementById('settings-content');
  if (settingsContent) settingsContent.style.display = 'none';
  main.innerHTML = '';

  switch (currentInvTab) {
    case 'inv_list':        renderInvProjectList(); break;
    case 'inv_calc':        renderInvVersionList(); break;
    case 'inv_edit':        renderInvEditForm(); break;
    case 'inv_grid':        renderInvGridEdit(); break;
    case 'inv_logs':        renderInvLogs(); break;
    case 'inv_sensitivity': renderSensitivityBoard(); break;
  }

  // 更新侧边栏激活
  var allItems = document.querySelectorAll('#sidebar-invest .sb-item[data-inv-tab]');
  allItems.forEach(function(b) { b.classList.remove('active'); });
  var activeItem = document.querySelector('#sidebar-invest .sb-item[data-inv-tab="' + currentInvTab + '"]');
  if (activeItem) activeItem.classList.add('active');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── 数据加载 ──
async function loadInvProjects() {
  var query = sb.from('invest_projects').select('*').order('created_at', { ascending: false });
  if (currentUser && currentUser.role === 'user') {
    query = query.eq('created_by', currentUser.id);
  }
  var result = await query;
  if (result.error) { console.error('loadInvProjects:', result.error); return; }
  invState.projects = result.data || [];
}

async function loadInvVersions(projectId) {
  var result = await sb.from('invest_versions')
    .select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (result.error) { console.error('loadInvVersions:', result.error); return; }
  invState.versions = result.data || [];
}

async function loadInvVersionData(versionId) {
  var results = await Promise.all([
    sb.from('invest_land').select('*').eq('version_id', versionId).order('sort_order'),
    sb.from('invest_input').select('*').eq('version_id', versionId),
    sb.from('invest_output').select('*').eq('version_id', versionId)
  ]);
  var err = results.find(function(r) { return r.error; });
  if (err) { console.error('loadInvVersionData:', err.error); return; }
  invState.lands = results[0].data || [];
  invState.inputs = {};
  (results[1].data || []).forEach(function(r) { invState.inputs[r.section] = r.data || {}; });
  invState.outputs = {};
  (results[2].data || []).forEach(function(r) { invState.outputs[r.section] = r.data || {}; });
  invState.currentVersion = invState.versions.find(function(v) { return v.id === versionId; }) || null;
  // 初始化编辑缓存
  _editLands = JSON.parse(JSON.stringify(invState.lands));
  _editInputs = JSON.parse(JSON.stringify(invState.inputs));
  _editOutputs = JSON.parse(JSON.stringify(invState.outputs));
}

async function loadSensitivityItems(versionId) {
  var result = await sb.from('invest_sensitivity')
    .select('*').eq('version_id', versionId).order('created_at', { ascending: false });
  if (result.error) { console.error('loadSensitivityItems:', result.error); return; }
  invState.sensitivityItems = result.data || [];
}

// ── 工具函数 ──
function invFmt(n, decimals) {
  if (n == null || isNaN(n)) return '--';
  decimals = (decimals != null) ? decimals : 2;
  var parts = Number(n).toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function invPct(n, decimals) {
  if (n == null || isNaN(n)) return '--';
  decimals = (decimals != null) ? decimals : 2;
  return (Number(n) * 100).toFixed(decimals) + '%';
}

function invToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ── 权限检查 ──
function invHasPerm(menuKey) {
  if (!currentUser) return false;
  if (currentUser.role === 'super_admin') return true;
  return getEffectiveMenuPerms().includes(menuKey);
}

// ── 操作日志 ──
function invLogAction(action, detail) {
  if (typeof logAction === 'function') logAction(action, detail);
}

// ── 权限应用 ──
function applyInvPerms() {
  var allowed = getEffectiveMenuPerms();
  var els = document.querySelectorAll('#main-content [data-menu-key]');
  els.forEach(function(el) {
    var key = el.getAttribute('data-menu-key');
    if (key && !allowed.includes(key)) el.style.display = 'none';
  });
}

// ── 初始化 ──
function initInvestModule() {
  var permItems = document.querySelectorAll('#sidebar-invest [data-menu-key]');
  var allowed = getEffectiveMenuPerms();
  permItems.forEach(function(el) {
    var key = el.getAttribute('data-menu-key');
    if (key && !allowed.includes(key)) {
      el.style.display = 'none';
    }
  });
}

// ── IRR 计算引擎 ──
/** 计算 IRR（内部收益率），Newton-Raphson 迭代法 */
function calcIRR(cashflows, guess) {
  guess = (guess === undefined) ? 0.1 : guess;
  var MAX_ITER = 1000;
  var PRECISION = 1e-7;
  var r = guess;

  for (var i = 0; i < MAX_ITER; i++) {
    var npv = 0;
    var dnpv = 0;

    for (var t = 0; t < cashflows.length; t++) {
      var cf = cashflows[t];
      var denom = Math.pow(1 + r, t);
      npv += cf / denom;
      if (t > 0) dnpv -= t * cf / Math.pow(1 + r, t + 1);
    }

    if (Math.abs(dnpv) < 1e-12) return null;

    var rNew = r - npv / dnpv;

    if (Math.abs(rNew - r) < PRECISION) return rNew;
    r = rNew;

    if (r <= -1) return null;
  }

  return null;
}

/** 根据支付计划和销售计划构建逐年净现金流数组 */
function buildCashflowByYear(payItems, salesItems, lands) {
  var flows = {};

  var landCost = 0;
  (lands || []).forEach(function(l) {
    landCost += Number(l.land_price || 0) + Number(l.extra_land_fee || 0) + Number(l.manage_fee || 0);
  });
  flows[0] = (flows[0] || 0) - landCost;

  (payItems || []).forEach(function(item) {
    if (!item.pay_date) return;
    var yr = new Date(item.pay_date + 'T00:00:00').getFullYear();
    var amount = Number(item.amount || 0);
    flows[yr] = (flows[yr] || 0) - amount;
  });

  (salesItems || []).forEach(function(item) {
    if (!item.sale_date) return;
    var yr = new Date(item.sale_date + 'T00:00:00').getFullYear();
    var revenue = (Number(item.area || 0) * Number(item.unit_price || 0)) / 10000;
    flows[yr] = (flows[yr] || 0) + revenue;
  });

  var years = Object.keys(flows).map(Number).sort(function(a, b) { return a - b; });
  if (years.length === 0) return [];

  var baseYear = years[0];
  var maxYear = years[years.length - 1];
  var result = [];
  for (var y = baseYear; y <= maxYear; y++) {
    result.push(flows[y] || 0);
  }
  return result;
}

/** 计算企业所得税后 IRR（T=25%） */
function calcAfterTaxIRR(cashflows) {
  var TAX_RATE = 0.25;
  var afterTaxCF = cashflows.map(function(cf) {
    return cf > 0 ? cf * (1 - TAX_RATE) : cf;
  });
  return calcIRR(afterTaxCF);
}

window.calcIRR = calcIRR;
window.buildCashflowByYear = buildCashflowByYear;
window.calcAfterTaxIRR = calcAfterTaxIRR;
