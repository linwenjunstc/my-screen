/* ════════════════════════════════════════════════
 * pm-logs.js  —  操作日志 / Tab分类 / 日志渲染
 * ════════════════════════════════════════════════ */

// ─── Operation Logs ────────────────────────────────────────────────────────────
// ⚠ 需要在 Supabase 执行以下 SQL 创建日志表：
// CREATE TABLE IF NOT EXISTS logs (
//   id TEXT PRIMARY KEY,
//   user_id TEXT,
//   user_name TEXT,
//   action TEXT,
//   detail TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

function getLogBadgeColor(action) {
  if (['添加任务','添加子任务','添加项目','添加成员','添加标签'].includes(action))
    return { bg: 'var(--green-bg)', text: 'var(--green)', border: 'var(--green-border)' };
  if (['完成任务','完成子任务'].includes(action))
    return { bg: 'var(--blue-bg)', text: 'var(--blue)', border: 'var(--blue-border)' };
  if (['删除任务','删除子任务','删除项目','删除成员','删除标签'].includes(action))
    return { bg: 'var(--red-bg)', text: 'var(--red)', border: 'var(--red-border)' };
  if (['修改角色','重置密码','修改密码','用户登录'].includes(action))
    return { bg: 'var(--purple-bg)', text: 'var(--purple)', border: 'var(--purple-border)' };
  if (['设置前置条件','移除前置条件'].includes(action))
    return { bg: 'var(--amber-bg)', text: 'var(--amber)', border: 'var(--amber-border)' };
  // 资金模块
  if (['新增收款记录','更新收款记录','新增付款明细','更新付款明细',
       '新增实际收款','更新实际收款','新增实际支付','更新实际支付',
       '新增对上合同','更新对上合同','新增对下合同','更新对下合同',
       '新增客户','更新客户','新增供应商','更新供应商',
       '导出资金报表','编辑月度计划','编辑完成情况'].includes(action))
    return { bg: 'var(--teal-bg,#e8f7f5)', text: 'var(--teal)', border: 'var(--teal-border,#a0d8d2)' };
  if (['删除收款记录','删除付款明细','删除实际收款','删除实际支付',
       '删除对上合同','删除对下合同','删除客户','删除供应商'].includes(action))
    return { bg: 'var(--red-bg)', text: 'var(--red)', border: 'var(--red-border)' };
  return { bg: 'var(--surface2)', text: 'var(--text2)', border: 'var(--border)' };
}

async function logAction(action, detail) {
  if (!currentUser) return;
  try {
    await sb.from('logs').insert({
      id: uid(),
      user_id: currentUser.id,
      user_name: currentUser.name,
      action,
      detail: detail || '',
      created_at: new Date().toISOString()
    });
  } catch(e) { /* 日志写入失败不影响主功能 */ }
}

async function openLogsModal() {
  window._logTab = window._logTab || 'all';
  const _isAdmin = isAdmin();
  openModal(`${modalHeader('操作日志')}
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 22px;overflow-x:auto">
      ${[
        {k:'all',  label:'全部'},
        {k:'task', label:'📋 任务'},
        {k:'project',label:'📁 项目'},
        {k:'finance',label:'💰 资金'},
        {k:'member', label:'👤 成员'},
      ].map(t=>`<button
        class="modal-tab ${window._logTab===t.k?'active':''}"
        onclick="window._logTab='${t.k}';document.querySelectorAll('.log-cat-tab').forEach(el=>el.classList.remove('active'));this.classList.add('active');refreshLogsList()"
        style="white-space:nowrap"
        data-logtab="${t.k}"
      >${t.label}</button>`).join('')}
    </div>
    <div class="modal-body" style="padding-bottom:0">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        ${_isAdmin ? `<select class="form-select" id="log-filter-user" onchange="refreshLogsList()" style="flex:1">
          <option value="">全部成员</option>
          ${state.members.map(m => '<option value="' + m.id + '">' + m.name + '</option>').join('')}
        </select>` : '<div style="flex:1;font-size:12px;color:var(--text3);display:flex;align-items:center;padding:0 4px">📋 我的操作记录</div>'}
        <select class="form-select" id="log-filter-days" onchange="refreshLogsList()" style="width:110px">
          <option value="1">今天</option>
          <option value="7" selected>最近 7 天</option>
          <option value="30">最近 30 天</option>
          <option value="0">全部</option>
        </select>
      </div>
      <div id="logs-list" style="max-height:380px;overflow-y:auto">
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">加载中...</div>
      </div>
    </div>
    <div class="modal-footer">
      <div style="font-size:11px;color:var(--text3)" id="log-count">-</div>
      <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
    </div>`);
  // 激活当前 tab 样式
  setTimeout(()=>{
    document.querySelectorAll('[data-logtab]').forEach(el=>{
      el.classList.toggle('active', el.dataset.logtab===window._logTab);
    });
  },20);
  refreshLogsList();
}

async function refreshLogsList() {
  const listEl = document.getElementById('logs-list');
  const countEl = document.getElementById('log-count');
  if (!listEl) return;

  listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">加载中...</div>';

  // Tab 分类定义
  const LOG_CATS = {
    all: null,
    task: ['添加任务','编辑任务','完成任务','删除任务',
           '添加子任务','完成子任务','删除子任务',
           '设置前置条件','移除前置条件'],
    project: ['添加项目','编辑项目','删除项目',
              '添加标签','编辑标签','删除标签'],
    finance: ['新增收款记录','更新收款记录','删除收款记录',
              '新增付款明细','更新付款明细','删除付款明细',
              '新增实际收款','更新实际收款','删除实际收款',
              '新增实际支付','更新实际支付','删除实际支付',
              '新增对上合同','更新对上合同','删除对上合同',
              '新增对下合同','更新对下合同','删除对下合同',
              '新增客户','更新客户','删除客户',
              '新增供应商','更新供应商','删除供应商',
              '导出资金报表','编辑月度计划','编辑完成情况'],
    member: ['添加成员','删除成员','修改角色',
             '重置密码','修改密码','用户登录','配置菜单权限'],
  };

  const _isAdminUser = isAdmin();
  const filterUserId = _isAdminUser
    ? (document.getElementById('log-filter-user')?.value || '')
    : (currentUser?.id || '');
  const days = parseInt(document.getElementById('log-filter-days')?.value || '7');
  const catFilter = LOG_CATS[window._logTab || 'all'];

  let query = sb.from('logs').select('*').order('created_at', { ascending: false }).limit(500);
  if (filterUserId) query = query.eq('user_id', filterUserId);
  if (days > 0) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    query = query.gte('created_at', since);
  }

  const { data, error } = await query;

  if (error) {
    const isRLS = error.message?.includes('row-level') || error.code === '42501';
    listEl.innerHTML = `<div style="color:var(--red);font-size:12px;padding:12px;background:var(--red-bg);border-radius:6px;border:1px solid var(--red-border)">
      <strong>加载失败</strong><br>${error.message}<br>
      ${isRLS ? '<br>⚠ 提示：请在 Supabase 执行文件顶部注释里的 SQL，开放 logs 表的读写权限。' : ''}
    </div>`;
    return;
  }

  // 前端 Tab 过滤
  const filtered = catFilter ? (data||[]).filter(l => catFilter.includes(l.action)) : (data||[]);

  if (!filtered.length) {
    const tabLabel = {all:'',task:'任务',project:'项目',finance:'资金',member:'成员'}[window._logTab||'all'];
    listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">暂无${tabLabel}日志记录</div>`;
    if (countEl) countEl.textContent = '共 0 条';
    return;
  }

  if (countEl) countEl.textContent = `共 ${filtered.length} 条`;

  const ACTION_ICONS = {
    '用户登录':'🔑',
    '添加任务':'📋', '编辑任务':'✏️', '完成任务':'✅', '删除任务':'🗑',
    '添加子任务':'📌', '完成子任务':'✅', '删除子任务':'🗑',
    '设置前置条件':'🔗', '移除前置条件':'🔗',
    '添加项目':'📁', '编辑项目':'📝', '删除项目':'🗑',
    '添加标签':'🏷', '编辑标签':'🏷', '删除标签':'🏷',
    '添加成员':'👤', '删除成员':'👤',
    '修改角色':'🔐', '重置密码':'🔑', '修改密码':'🔑',
    // 资金模块
    '新增收款记录':'💰', '更新收款记录':'✏️', '删除收款记录':'🗑',
    '新增付款明细':'📤', '更新付款明细':'✏️', '删除付款明细':'🗑',
    '新增实际收款':'📥', '更新实际收款':'✏️', '删除实际收款':'🗑',
    '新增实际支付':'📤', '更新实际支付':'✏️', '删除实际支付':'🗑',
    '新增对上合同':'📄', '更新对上合同':'📄', '删除对上合同':'🗑',
    '新增对下合同':'📄', '更新对下合同':'📄', '删除对下合同':'🗑',
    '新增客户':'👥', '更新客户':'👥', '删除客户':'🗑',
    '新增供应商':'🏢', '更新供应商':'🏢', '删除供应商':'🗑',
    '导出资金报表':'📊', '编辑月度计划':'📊', '编辑完成情况':'📊',
  };

  // 按日期分组
  const groups = {};
  filtered.forEach(log => {
    const date = log.created_at.slice(0, 10);
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  });

  const memberColors = {};
  state.members.forEach(m => { memberColors[m.id] = MEMBER_COLORS[m.colorIdx % MEMBER_COLORS.length]; });

  listEl.innerHTML = Object.entries(groups).map(([date, logs]) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dateLabel = date === today ? '今天' : date === yesterday ? '昨天' : date;
    const logsHTML = logs.map(log => {
      const time = new Date(log.created_at).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' });
      const icon = ACTION_ICONS[log.action] || '▸';
      const color = memberColors[log.user_id] || 'var(--text3)';
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;flex-shrink:0;margin-top:1px">${(log.user_name||'?').slice(0,1)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:500">${log.user_name || '未知'}</span>
            <span style="font-size:11px;padding:1px 7px;background:${getLogBadgeColor(log.action).bg};border-radius:10px;color:${getLogBadgeColor(log.action).text};border:1px solid ${getLogBadgeColor(log.action).border}">${icon} ${log.action}</span>
            <span style="font-size:11px;color:var(--text3);margin-left:auto">${time}</span>
          </div>
          ${log.detail ? `<div style="font-size:12px;color:var(--text2);margin-top:3px">${log.detail}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:4px">
      <div style="font-size:11px;font-weight:600;color:var(--text3);padding:8px 0 4px;position:sticky;top:0;background:var(--surface)">${dateLabel}</div>
      ${logsHTML}
    </div>`;
  }).join('');
}

