/* ════════════════════════════════════════════════
 * finance-base.js  —  资金看板 / 合同库 / 客户库 / 供应商库 / deleteRow / finLogAction / modal utils
 * ════════════════════════════════════════════════ */

//  基础库配置弹框
function openBaseLibModal(){
  var allowed = typeof getEffectiveMenuPerms === 'function' ? getEffectiveMenuPerms() : [];
  var hasInfo = allowed.includes('basic_info');
  var libs = [
    { key: 'base_contracts',  label: '合同库',   icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2h10v12H3z"/><line x1="5" y1="5.5" x2="11" y2="5.5"/><line x1="5" y1="8" x2="11" y2="8"/></svg>', tab: 'contracts' },
    { key: 'base_customers',  label: '客户库',   icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="6" r="3"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg>', tab: 'customers' },
    { key: 'base_suppliers',  label: '供应商库', icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="6" width="10" height="8" rx="1"/><path d="M4 6V4a4 4 0 0 1 8 0v2"/></svg>', tab: 'suppliers' },
  ];
  var visibleLibs = libs.filter(function(l) { return allowed.includes(l.key); });
  if (!visibleLibs.length && !hasInfo) {
    toast('你没有访问任何基础库的权限', 'info');
    return;
  }
  var buttonsHTML = '';
  if (hasInfo) {
    buttonsHTML += '<button class="btn btn-ghost" style="padding:14px 20px;font-size:14px;justify-content:flex-start;display:flex;align-items:center;gap:10px;width:100%" onclick="closeModal();openBasicInfoModal()"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg>基础信息配置</button>';
  }
  buttonsHTML += visibleLibs.map(function(l) {
    return '<button class="btn btn-ghost" style="padding:14px 20px;font-size:14px;justify-content:flex-start;display:flex;align-items:center;gap:10px;width:100%" onclick="closeModal();switchTab(\'' + l.tab + '\')">' + l.icon + l.label + '</button>';
  }).join('');
  openModal(`
  <div class="modal-header">
    <div class="modal-title">基础库配置</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;padding:24px">
    ${buttonsHTML}
  </div>
  <div class="modal-footer"><div></div>
    <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
  </div>`);
}

//  基础信息配置弹框（公司名称 + 事业部名称）
window.openBasicInfoModal = function() {
  var company = (typeof finState !== 'undefined' && finState.config) ? finState.config.company_name || '' : '';
  var dept = (typeof finState !== 'undefined' && finState.config) ? finState.config.dept_name || '' : '';
  openModal(modalHeader('基础信息配置') +
    '<div class="modal-body">' +
      '<div class="form-group">' +
        '<label class="form-label">公司名称</label>' +
        '<input class="form-input" id="cfg-company" value="' + escHtml(company) + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">事业部名称</label>' +
        '<input class="form-input" id="cfg-dept" value="' + escHtml(dept) + '">' +
      '</div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<div></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
        '<button class="btn btn-primary" onclick="saveBasicInfo(this)">保存</button>' +
      '</div>' +
    '</div>');
};

window.saveBasicInfo = async function(btn) {
  var company = document.getElementById('cfg-company')?.value || '';
  var dept = document.getElementById('cfg-dept')?.value || '';
  setLoading(btn, true);
  await sb.from('finance_config').upsert({ id: 'default', company_name: company, dept_name: dept });
  if (typeof finState !== 'undefined') {
    finState.config.company_name = company;
    finState.config.dept_name = dept;
    var el = document.getElementById('sb-dept-name');
    if (el) el.textContent = dept || '资金计划模块';
  }
  setLoading(btn, false);
  closeModal();
  toast('基础信息已保存');
  if (typeof finLogAction === 'function') finLogAction('编辑基础信息', '更新公司/事业部名称');
};

async function renderDashboard(){
  const c=computeTotals();
  const actRec=finState.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const actPay=finState.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const recRatio=c.planRec?((actRec/c.planRec)*100).toFixed(1):0;
  const payRatio=c.planPay?((actPay/c.planPay)*100).toFixed(1):0;
  const rtcf=computeRealTimeCashFlow();
  const rtcfVal=rtcf===null?'<span style="color:var(--text3)">—</span>'
    :`<span style="color:${rtcf>=0?'var(--green)':'var(--red)'}">${fmt(rtcf)}</span>`;
  const prevMon=prevMonthOf(currentMonth);

  // Mini donut for income vs expense
  const flowTotal = actRec + actPay || 1;
  const recAngle = (actRec / flowTotal) * 360;
  const donutRing = `<svg width="72" height="72" viewBox="0 0 72 72">
    <circle cx="36" cy="36" r="28" fill="none" stroke="#e8e5df" stroke-width="6"/>
    <circle cx="36" cy="36" r="28" fill="none" stroke="#27ae60" stroke-width="6"
      stroke-dasharray="${(recAngle/360)*176} 176" stroke-dashoffset="0" stroke-linecap="round"
      transform="rotate(-90 36 36)"/>
    <circle cx="36" cy="36" r="28" fill="none" stroke="#2e7dd1" stroke-width="6"
      stroke-dasharray="${((360-recAngle)/360)*176} 176" stroke-dashoffset="${-(recAngle/360)*176}" stroke-linecap="round"
      transform="rotate(-90 36 36)"/>
    <text x="36" y="40" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="600" font-family="DM Mono,monospace">${(recAngle/360*100).toFixed(0)}%</text>
  </svg>`;

  // Month-over-month comparison
  const prevRec = finState.prevActualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const prevPay = finState.prevActualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const recChange = prevRec ? ((actRec - prevRec) / prevRec * 100).toFixed(0) : null;
  const payChange = prevPay ? ((actPay - prevPay) / prevPay * 100).toFixed(0) : null;

  document.getElementById('main-content').innerHTML=`
  <div class="stat-grid" style="grid-template-columns:repeat(5,1fr)">
    <div class="stat-card ${c.surplus>=0?'positive':'warning'}" onclick="showFinSummaryModal()" style="cursor:pointer" title="点击查看资金计划明细">
      <div class="stat-label">资金溢缺</div>
      <div class="stat-val">${fmt(c.surplus)}</div>
      <div class="stat-sub">计划 · 万元</div>
    </div>
    <div class="stat-card" onclick="showPlanIncomeModal()" style="cursor:pointer" title="查看计划收入明细">
      <div class="stat-label">计划收入</div>
      <div class="stat-val">${fmt(c.planRec)}</div>
      <div class="stat-sub">实收 ${fmt(actRec)} · ${recRatio}%</div>
    </div>
    <div class="stat-card" onclick="showPlanExpenseModal()" style="cursor:pointer" title="查看计划支出明细">
      <div class="stat-label">计划支出</div>
      <div class="stat-val">${fmt(c.planPay)}</div>
      <div class="stat-sub">实支 ${fmt(actPay)} · ${payRatio}%</div>
    </div>
    <div class="stat-card ${rtcf===null?'':'rtcf-card'}" onclick="showCashFlowModal()" style="cursor:pointer" title="查看现金流计算明细">
      <div class="stat-label">实时现金流<span class="stat-hint" title="上月完成净额 + 当月实收 − 当月实付"> ⓘ</span></div>
      <div class="stat-val">${rtcfVal}</div>
      <div class="stat-sub">${rtcf===null?'待录入 '+fmtMon(prevMon):'上月净额 '+fmt(computePrevBalance())}</div>
    </div>
    <div class="stat-card" onclick="showFlowRatioModal()" style="cursor:pointer" title="查看收付明细">
      <div class="stat-label">收付比例</div>
      <div style="display:flex;align-items:center;gap:10px">
        ${donutRing}
        <div style="font-size:10px;color:var(--text3);line-height:1.6">
          <span style="color:#27ae60">●</span> 收 ${(recAngle/360*100).toFixed(0)}%<br>
          <span style="color:#2e7dd1">●</span> 付 ${((360-recAngle)/360*100).toFixed(0)}%
        </div>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">
    <div class="chart-card" style="padding:16px 18px" onclick="showMoMComparisonModal()" style="cursor:pointer" title="查看环比明细">
      <div class="chart-title" style="margin-bottom:10px">月度环比
        <span style="font-size:11px;font-weight:400;color:var(--text3)">较上月</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:12px;color:var(--text2)"><span style="color:#27ae60">●</span> 实际收款</span>
          <span style="font-size:13px;font-family:var(--mono);font-weight:600;color:${recChange===null?'var(--text3)':recChange>=0?'#27ae60':'#e74c3c'}">${recChange===null?'—':(recChange>=0?'+'+recChange:recChange)+'%'}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:12px;color:var(--text2)"><span style="color:#2e7dd1">●</span> 实际付款</span>
          <span style="font-size:13px;font-family:var(--mono);font-weight:600;color:${payChange===null?'var(--text3)':payChange<=0?'#27ae60':'#e74c3c'}">${payChange===null?'—':(payChange<=0?payChange:'+'+payChange)+'%'}</span>
        </div>
      </div>
    </div>
    <div class="chart-card" style="padding:16px 18px" onclick="showCompletionRateModal()" style="cursor:pointer" title="查看完成率明细">
      <div class="chart-title" style="margin-bottom:10px">收款完成率</div>
      <div class="proj-progress-track" style="height:32px;margin-top:8px">
        <div class="proj-progress-fill" style="width:${Math.min(recRatio,100)}%;background:var(--grad-green);display:flex;align-items:center;justify-content:flex-end;padding-right:10px;font-size:12px;font-weight:600;color:#fff;font-family:var(--mono)">${recRatio}%</div>
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--text3)">付款完成率</div>
      <div class="proj-progress-track" style="height:32px;margin-top:6px">
        <div class="proj-progress-fill" style="width:${Math.min(payRatio,100)}%;background:var(--grad-blue);display:flex;align-items:center;justify-content:flex-end;padding-right:10px;font-size:12px;font-weight:600;color:#fff;font-family:var(--mono)">${payRatio}%</div>
      </div>
    </div>
  </div>

  <div class="prog-section">
    <div class="prog-title"><i data-lucide="arrow-down" style="width:13px;height:13px;margin-right:4px"></i>收款进度（对上）</div>
    ${finState.receipts.map(r=>{
      const ratio=r.contract_amount?(+r.cumulative_received||0)/(+r.contract_amount):0;
      const cls=ratio>=1?'ratio-red':ratio>=0.6?'ratio-amber':'ratio-green';
      return `<div class="prog-row" onclick="showReceiptDetailModal('${r.id}')" data-tip="${r.contract_name||'—'}: 累计收款 ${fmt(r.cumulative_received)} / ${fmt(r.contract_amount)} 元 (${(ratio*100).toFixed(1)}%)">
        <div class="prog-name">${r.contract_name||'—'}</div>
        <div class="prog-meta">${fmt(r.cumulative_received)} / ${fmt(r.contract_amount)} 元</div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${Math.min(ratio*100,100).toFixed(1)}%;background:var(--grad-green)"></div></div>
        <div class="prog-pct ${cls}">${(ratio*100).toFixed(1)}%</div>
      </div>`;
    }).join('')||'<div style="color:var(--text3);font-size:12px;padding:8px 0">暂无收款计划</div>'}
  </div>
  <div class="prog-section">
    <div class="prog-title"><i data-lucide="arrow-up" style="width:13px;height:13px;margin-right:4px"></i>付款进度（对下）</div>
    ${finState.payments.map(r=>{
      const act=getActualPaidForPayment(r);
      const planSub=(+r.plan_cash||0)+(+r.plan_supply_chain||0);
      const ratio=planSub?act/planSub:0;
      const cls=ratio>=1?'ratio-red':ratio>=0.6?'ratio-amber':'ratio-green';
      return `<div class="prog-row" onclick="showPaymentDetailModal('${r.id}')" data-tip="${r.contract_name||'—'}: 实际支付 ${fmt(act)} / 计划 ${fmt(planSub)} 元${planSub?' ('+(ratio*100).toFixed(1)+'%)':''}">
        <div class="prog-name">${r.contract_name||'—'}</div>
        <div class="prog-meta">${fmt(act)} / ${fmt(planSub)} 元</div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${Math.min(ratio*100,100).toFixed(1)}%;background:var(--grad-blue)"></div></div>
        <div class="prog-pct ${cls}">${planSub?(ratio*100).toFixed(1)+'%':'—'}</div>
      </div>`;
    }).join('')||'<div style="color:var(--text3);font-size:12px;padding:8px 0">暂无付款计划</div>'}
  </div>
  <div id="trend-chart-placeholder"></div>
  <div id="trend-chart-area" style="display:none"></div>`;
  setTimeout(() => { if (typeof setupChartTipListeners === 'function') setupChartTipListeners(); }, 50);

  // 异步加载近6月趋势图（不阻塞主渲染）
  var trendMonths = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    trendMonths.push(d.toISOString().slice(0, 7));
  }
  buildTrendSVGData(trendMonths).then(function(data) {
    var ph = document.getElementById('trend-chart-placeholder');
    if (ph) {
      ph.innerHTML = buildTrendSVGStatic(trendMonths, data.recByMonth, data.payByMonth);
    }
  });
}

//  合同库
window._contractTab='up';
// ── 合同库 ──────────────────────────────────────────────────────────────────
window._contractTab  = 'up';
window._contractYear = new Date().getFullYear().toString();
window._revenueYear  = new Date().getFullYear().toString();

// 计算对上合同的所有营收指标
// 年累计 = actual_receipts 中 upstream_contract_id 匹配的当年收款汇总（自动，只读）
function computeContractRevenue(r, year){
  const taxRate    = +r.tax_rate||0;
  const exclTax    = r.amount / (1 + taxRate);
  const targetProf = exclTax * (+r.target_profit_rate||0);
  const measured   = +r.measured_revenue||0;

  const yearRevs = finState.actualReceipts
    .filter(m => m.upstream_contract_id === r.id && (m.year_month||'').startsWith(year+'-'));
  const yearCum  = yearRevs.reduce((s,m)=>s+(+m.amount||0), 0);

  const cumRev    = measured + yearCum;
  const remain    = exclTax - cumRev;
  const progress  = exclTax ? cumRev / exclTax : 0;
  const yearProfit= yearCum * (+r.target_profit_rate||0);

  return {exclTax, targetProf, measured, yearCum, cumRev, remain, progress, yearProfit};
}

function renderContracts(){
  const tab   = window._contractTab || 'up';
  const isUp  = tab === 'up';
  const year  = window._contractYear || new Date().getFullYear().toString();
  const revYear = window._revenueYear || new Date().getFullYear().toString();

  // Init pagination state
  if (!window._pageSize) window._pageSize = 20;
  if (!window._pageNum) window._pageNum = {};
  const pgKey = 'contract_' + tab;
  if (!window._pageNum[pgKey]) window._pageNum[pgKey] = 1;
  const pageSize = window._pageSize;
  const currentPage = window._pageNum[pgKey];

  // Init filter state
  if (!window._filters) window._filters = {};
  const f = window._filters;

  // 签约维度年份下拉
  const existYears = [...new Set(finState.contractsUp.map(r=>r.assessment_year||'').filter(Boolean))];
  const curY = new Date().getFullYear();
  for(let y=curY-2;y<=curY+2;y++) if(!existYears.includes(String(y))) existYears.push(String(y));
  existYears.sort();
  const yearOpts = existYears.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}年</option>`).join('');

  // 营收确认维度年份下拉
  const existRevYears = [...new Set(finState.contractsUp.map(r=>r.revenue_assessment_year||'').filter(Boolean))];
  for(let y=curY-2;y<=curY+2;y++) if(!existRevYears.includes(String(y))) existRevYears.push(String(y));
  existRevYears.sort();
  const revYearOpts = existRevYears.map(y=>`<option value="${y}" ${y===revYear?'selected':''}>${y}年</option>`).join('');

  // 对上合同：按两个考核周期筛选
  let rawRows = isUp
    ? finState.contractsUp.filter(r => {
        const matchSign = !r.assessment_year || r.assessment_year === year;
        const matchRev  = !r.revenue_assessment_year || r.revenue_assessment_year === revYear;
        return matchSign && matchRev;
      })
    : finState.contractsDown;

  // ── Apply text filters ──
  if (isUp) {
    const fn = (f.up_name || '').toLowerCase();
    const fc = (f.up_no || '').toLowerCase();
    const fcust = (f.up_customer || '').toLowerCase();
    const fstat = f.up_status || 'all';
    if (fn) rawRows = rawRows.filter(r => (r.name||'').toLowerCase().includes(fn));
    if (fc) rawRows = rawRows.filter(r => (r.main_contract_no||'').toLowerCase().includes(fc));
    if (fcust) rawRows = rawRows.filter(r => (r.customer_name||'').toLowerCase().includes(fcust));
    if (fstat !== 'all') rawRows = rawRows.filter(r => r.status === fstat);
  } else {
    const fn = (f.down_name || '').toLowerCase();
    const fs = (f.down_supplier || '').toLowerCase();
    const fl = (f.down_link || '').toLowerCase();
    if (fn) rawRows = rawRows.filter(r => (r.name||'').toLowerCase().includes(fn));
    if (fs) rawRows = rawRows.filter(r => (r.supplier_name||'').toLowerCase().includes(fs));
    if (fl) rawRows = rawRows.filter(r => {
      const linked = r.upstream_contract_id ? finState.contractsUp.find(x=>x.id===r.upstream_contract_id) : null;
      return linked ? (linked.name||'').toLowerCase().includes(fl) : false;
    });
  }

  // ── Pagination ──
  const total = rawRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) window._pageNum[pgKey] = totalPages;
  const p = Math.min(window._pageNum[pgKey], totalPages);
  const startIdx = (p - 1) * pageSize;
  const paged = rawRows.slice(startIdx, startIdx + pageSize);

  const tbody = paged.length ? paged.map((r,i)=>{
    const realIdx = startIdx + i + 1;
    if(isUp){
      const rv = computeContractRevenue(r, year);
      const progCls = rv.progress>=1?'ratio-red':rv.progress>=0.8?'ratio-amber':'ratio-green';
      return `<tr class="clickable" onclick="openEditContractModal('up','${r.id}')">
        <td style="color:var(--text3);width:28px;text-align:center">${realIdx}</td>
        <td style="min-width:150px">${escHtml(r.name)}</td>
        <td style="font-size:12px;color:var(--text2);min-width:100px">${escHtml(r.main_contract_no||'—')}</td>
        <td>${escHtml(r.customer_name||'—')}</td>
        <td class="num">${fmt(r.amount)}</td>
        <td class="num">${rv.exclTax?fmt(rv.exclTax):'—'}</td>
        <td class="num">${r.target_profit_rate?(+r.target_profit_rate*100).toFixed(1)+'%':'—'}</td>
        <td class="num">${rv.targetProf?fmt(rv.targetProf):'—'}</td>
        <td class="num">${fmt(rv.measured)}</td>
        <td class="num">${fmt(rv.yearCum)}</td>
        <td class="num">${fmt(rv.cumRev)}</td>
        <td class="num ${progCls}">${rv.exclTax?(rv.progress*100).toFixed(1)+'%':'—'}</td>
        <td class="num">${rv.yearProfit?fmt(rv.yearProfit):'—'}</td>
        <td><button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openRevenueModal('${r.id}')"><i data-lucide="bar-chart-3" style="width:13px;height:13px;margin-right:2px"></i>营收</button></td>
        <td onclick="event.stopPropagation()"><select class="status-inline ${r.status==='active'?'tag-active':'tag-settled'}" onchange="updateContractStatus('up','${r.id}',this)"><option value="active" ${r.status!=='settled'?'selected':''}>执行中</option><option value="settled" ${r.status==='settled'?'selected':''}>已结算</option></select></td>
      </tr>`;
    } else {
      const linked = r.upstream_contract_id ? finState.contractsUp.find(x=>x.id===r.upstream_contract_id) : null;
      return `<tr class="clickable" onclick="openEditContractModal('down','${r.id}')">
        <td style="color:var(--text3);width:28px;text-align:center">${realIdx}</td>
        <td>${escHtml(r.name)}</td>
        <td>${escHtml(r.supplier_name||'—')}</td>
        <td class="num">${fmt(r.amount)}</td>
        <td>${linked?`<span class="linked-badge">${escHtml(linked.name)}</span>`:'—'}</td>
        <td onclick="event.stopPropagation()"><select class="status-inline ${r.status==='active'?'tag-active':'tag-settled'}" onchange="updateContractStatus('down','${r.id}',this)"><option value="active" ${r.status!=='settled'?'selected':''}>执行中</option><option value="settled" ${r.status==='settled'?'selected':''}>已结算</option></select></td>
        <td style="font-size:12px;color:var(--text3)">${escHtml(r.remark||'—')}</td>
      </tr>`;
    }
  }).join('') : `<tr><td colspan="${isUp?15:7}"><div class="empty"><i data-lucide="file-text" class="empty-icon"></i>暂无合同，点击右上角新增</div></td></tr>`;

  // ── Pagination HTML ──
  let pageHTML = '';
  if (total > 20) {
    const sizeOpts = [20, 50, 100].map(s => `<option value="${s}" ${s===pageSize?'selected':''}>${s}条/页</option>`).join('');
    let pages = '';
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages <= 7 || i === 1 || i === totalPages || (i >= p-1 && i <= p+1)) {
        pages += `<button class="btn btn-xs ${i===p?'btn-primary':'btn-ghost'}" onclick="window._pageNum['${pgKey}']=${i};renderContracts()">${i}</button>`;
      } else if (i === 2 || i === totalPages-1) {
        pages += '<span style="color:var(--text3);padding:0 4px">…</span>';
      }
    }
    pageHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-top:1px solid var(--border);background:var(--surface2)">
      <div style="display:flex;align-items:center;gap:8px">
        <select class="form-select" style="width:auto;padding:4px 8px;font-size:11px" onchange="window._pageSize=+this.value;window._pageNum['${pgKey}']=1;renderContracts()">${sizeOpts}</select>
        <span style="font-size:11px;color:var(--text3)">共 ${total} 条</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="btn btn-xs btn-ghost" onclick="window._pageNum['${pgKey}']=1;renderContracts()" ${p===1?'disabled':''}>«</button>
        ${pages}
        <button class="btn btn-xs btn-ghost" onclick="window._pageNum['${pgKey}']=${totalPages};renderContracts()" ${p===totalPages?'disabled':''}>»</button>
      </div>
    </div>`;
  }

  // ── Filter row HTML ──
  let filterHTML = '';
  if (isUp) {
    filterHTML = `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <input class="form-input" id="f-up-name" placeholder="合同名称..." style="width:140px;padding:5px 10px;font-size:12px" value="${f.up_name||''}">
      <input class="form-input" id="f-up-no" placeholder="主合同编号..." style="width:130px;padding:5px 10px;font-size:12px" value="${f.up_no||''}">
      <input class="form-input" id="f-up-customer" placeholder="客户名称..." style="width:130px;padding:5px 10px;font-size:12px" value="${f.up_customer||''}">
      <select class="form-select" id="f-up-status" style="width:auto;padding:5px 10px;font-size:12px">
        <option value="all" ${f.up_status==='all'||!f.up_status?'selected':''}>全部状态</option>
        <option value="active" ${f.up_status==='active'?'selected':''}>执行中</option>
        <option value="settled" ${f.up_status==='settled'?'selected':''}>已结算</option>
      </select>
      <button class="btn btn-sm btn-primary" onclick="applyContractFilters()">查询</button>
      <button class="btn btn-sm btn-ghost" onclick="resetContractFilters()">重置</button>
      <span style="font-size:11px;color:var(--text3);margin-left:4px">${total} 条结果</span>
    </div>`;
  } else {
    filterHTML = `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <input class="form-input" id="f-down-name" placeholder="合同名称..." style="width:140px;padding:5px 10px;font-size:12px" value="${f.down_name||''}">
      <input class="form-input" id="f-down-supplier" placeholder="供应商名称..." style="width:130px;padding:5px 10px;font-size:12px" value="${f.down_supplier||''}">
      <input class="form-input" id="f-down-link" placeholder="关联对上合同..." style="width:150px;padding:5px 10px;font-size:12px" value="${f.down_link||''}">
      <button class="btn btn-sm btn-primary" onclick="applyContractFilters()">查询</button>
      <button class="btn btn-sm btn-ghost" onclick="resetContractFilters()">重置</button>
      <span style="font-size:11px;color:var(--text3);margin-left:4px">${total} 条结果</span>
    </div>`;
  }

  document.getElementById('main-content').innerHTML=`
  <div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-sm ${isUp?'btn-primary':'btn-ghost'}" onclick="window._contractTab='up';window._pageNum['contract_up']=window._pageNum['contract_up']||1;renderContracts()">对上合同（${finState.contractsUp.length}）</button>
    <button class="btn btn-sm ${!isUp?'btn-primary':'btn-ghost'}" onclick="window._contractTab='down';window._pageNum['contract_down']=window._pageNum['contract_down']||1;renderContracts()">对下合同（${finState.contractsDown.length}）</button>
    ${isUp?`<div style="margin-left:12px;display:flex;align-items:center;gap:6px">
      <span style="font-size:12px;color:var(--text3)">签约周期</span>
      <select class="form-select" style="width:130px;height:42px;font-size:14px;padding-right:28px" onchange="window._contractYear=this.value;window._pageNum['${pgKey}']=1;renderContracts()">${yearOpts}</select>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:12px;color:var(--text3)">营收周期</span>
      <select class="form-select" style="width:130px;height:42px;font-size:14px;padding-right:28px" onchange="window._revenueYear=this.value;window._pageNum['${pgKey}']=1;renderContracts()">${revYearOpts}</select>
    </div>`:''}
  </div>
  ${filterHTML}
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">${isUp?'对上合同库':'对下合同库'}</div>
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="downloadContractTemplate('${isUp?'up':'down'}')">↓ 模板</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">
          ↑ 导入 Excel
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="importContractsExcel(event,'${isUp?'up':'down'}')">
        </label>
        <button class="btn btn-ghost btn-sm" onclick="exportContractsExcel('${isUp?'up':'down'}')">↓ 导出</button>
        <span style="font-size:11px;color:var(--text3)">点击行编辑</span>
      </div>
    </div>
    <div class="table-scroll"><table style="width:auto;min-width:100%">
      <thead><tr>
        <th style="width:28px">#</th>
        <th style="min-width:150px">合同名称</th>
        ${isUp?'<th style="min-width:110px">主合同编号</th>':''}
        <th style="min-width:100px">${isUp?'客户名称':'供应商名称'}</th>
        <th class="num" style="min-width:90px">合同金额</th>
        ${isUp?`
        <th class="num" style="min-width:90px">不含税金额</th>
        <th class="num" style="min-width:90px">目标利润率</th>
        <th class="num" style="min-width:90px">反算合同额</th>
        <th class="num" style="min-width:90px">已计量营收</th>
        <th class="num" style="min-width:90px">年累计完成营收</th>
        <th class="num" style="min-width:90px">开累完成营收</th>
        <th class="num" style="min-width:90px">营收完成进度</th>
        <th class="num" style="min-width:90px">年完成毛利</th>
        <th style="width:70px">营收</th>
        <th>状态</th>
        `:`
        <th style="min-width:120px">关联对上合同</th>
        <th>状态</th>
        <th style="min-width:80px">备注</th>
        `}
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
    ${pageHTML}
  </div>`;
}

// ── 合同筛选 查询/重置 ──
window.applyContractFilters = function() {
  const isUp = window._contractTab === 'up';
  const pgKey = 'contract_' + window._contractTab;
  window._filters = window._filters || {};
  if (isUp) {
    window._filters.up_name = (document.getElementById('f-up-name')||{}).value || '';
    window._filters.up_no = (document.getElementById('f-up-no')||{}).value || '';
    window._filters.up_customer = (document.getElementById('f-up-customer')||{}).value || '';
    window._filters.up_status = (document.getElementById('f-up-status')||{}).value || 'all';
  } else {
    window._filters.down_name = (document.getElementById('f-down-name')||{}).value || '';
    window._filters.down_supplier = (document.getElementById('f-down-supplier')||{}).value || '';
    window._filters.down_link = (document.getElementById('f-down-link')||{}).value || '';
  }
  window._pageNum[pgKey] = 1;
  renderContracts();
};

window.resetContractFilters = function() {
  const isUp = window._contractTab === 'up';
  const pgKey = 'contract_' + window._contractTab;
  window._filters = window._filters || {};
  if (isUp) {
    window._filters.up_name = '';
    window._filters.up_no = '';
    window._filters.up_customer = '';
    window._filters.up_status = 'all';
  } else {
    window._filters.down_name = '';
    window._filters.down_supplier = '';
    window._filters.down_link = '';
  }
  window._pageNum[pgKey] = 1;
  renderContracts();
};

window.applySupplierFilter = function() {
  window._filters = window._filters || {};
  window._filters.supplier_name = (document.getElementById('f-supplier-name')||{}).value || '';
  renderSuppliers();
};

window.resetSupplierFilter = function() {
  window._filters = window._filters || {};
  window._filters.supplier_name = '';
  renderSuppliers();
};

// ── 客户筛选 查询/重置 ──
window.applyCustomerFilters = function() {
  window._filters = window._filters || {};
  window._filters.cust_name = (document.getElementById('f-cust-name')||{}).value || '';
  renderCustomers();
};

window.resetCustomerFilters = function() {
  window._filters = window._filters || {};
  window._filters.cust_name = '';
  renderCustomers();
};

function openAddContractModal(){openEditContractModal(window._contractTab||'up',null);}
function openEditContractModal(dir,id){
  const isUp = dir==='up';
  const arr  = isUp?finState.contractsUp:finState.contractsDown;
  const r    = id?arr.find(x=>x.id===id):null;
  const isEdit = !!r;
  const cuOpts = finState.customers.map(c=>`<option value="${c.id}" ${r&&r.customer_id===c.id?'selected':''}>${escHtml(c.name)}</option>`).join('');
  const suOpts = finState.suppliers.map(s=>`<option value="${s.id}" ${r&&r.supplier_id===s.id?'selected':''}>${escHtml(s.name)}</option>`).join('');
  const upOpts = finState.contractsUp.map(c=>`<option value="${c.id}" ${r&&r.upstream_contract_id===c.id?'selected':''}>${escHtml(c.name)}</option>`).join('');

  // 年份下拉（考核周期）
  const curY = new Date().getFullYear();
  const yearSel = [curY-1,curY,curY+1].map(y=>`<option value="${y}" ${(r?r.assessment_year:String(curY))===String(y)?'selected':''}>${y}年</option>`).join('');
  const revYearSel = [curY-1,curY,curY+1].map(y=>`<option value="${y}" ${(r?r.revenue_assessment_year:String(curY))===String(y)?'selected':''}>${y}年</option>`).join('');

  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑合同':'新增'+(isUp?'对上':'对下')+'合同'}</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    <div class="form-group">
      <label class="form-label">合同名称 *</label>
      <input class="form-input" id="ct-name" value="${r?r.name||'':''}">
    </div>
    ${isUp?`
    <div class="form-group">
      <label class="form-label">主合同编号</label>
      <input class="form-input" id="ct-mcno" placeholder="如 HT-2024-001（可空）" value="${r?r.main_contract_no||'':''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">客户</label>
        <select class="form-select" id="ct-cu" onchange="onContractCuChange()">
          <option value="">— 从客户库选择 —</option>${cuOpts}
        </select>
        <input class="form-input" id="ct-cu-txt" placeholder="或手动填写" value="${r?r.customer_name||'':''}" style="margin-top:6px">
      </div>
      <div class="form-group">
        <label class="form-label">签约日期</label>
        <input class="form-input" id="ct-date" type="date" value="${r?r.sign_date||'':''}">
      </div>
    </div>
    <div class="form-divider">税务与利润</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">税率（如 0.09 = 9%）</label>
        <input class="form-input" id="ct-taxrate" type="number" step="0.001" min="0" max="1" value="${r?r.tax_rate||'':''}" oninput="calcContractDerived()">
      </div>
      <div class="form-group">
        <label class="form-label">不含税金额（自动）</label>
        <div class="readonly-val" id="ct-excl-tax">—</div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">目标利润率（如 0.15 = 15%）</label>
        <input class="form-input" id="ct-profrate" type="number" step="0.001" min="0" max="1" value="${r?r.target_profit_rate||'':''}" oninput="calcContractDerived()">
      </div>
      <div class="form-group">
        <label class="form-label">反算合同额（自动）</label>
        <div class="readonly-val" id="ct-rev-amount">—</div>
        <div class="form-hint">= 不含税金额 × 目标利润率</div>
      </div>
    </div>
    <div class="form-divider">营收基础</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">签约考核周期</label>
        <select class="form-select" id="ct-year">${yearSel}</select>
      </div>
      <div class="form-group">
        <label class="form-label">已计量营收（历史累计）</label>
        <input class="form-input" id="ct-measured" type="number" step="0.01" value="${r?r.measured_revenue||0:0}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">营收考核周期</label>
        <select class="form-select" id="ct-rev-year">${revYearSel}</select>
      </div>
      <div class="form-group">
        <label class="form-label">&nbsp;</label>
        <div style="font-size:11px;color:var(--text3);padding:9px 0">营收确认维度</div>
      </div>
    </div>
    `:`
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">供应商</label>
        <select class="form-select" id="ct-su" onchange="onContractSuChange()">
          <option value="">— 从供应商库选择 —</option>${suOpts}
        </select>
        <input class="form-input" id="ct-su-txt" placeholder="或手动填写" value="${r?r.supplier_name||'':''}" style="margin-top:6px">
      </div>
      <div class="form-group">
        <label class="form-label">关联对上合同（可选）</label>
        <select class="form-select" id="ct-up">
          <option value="">— 不关联 —</option>${upOpts}
        </select>
      </div>
    </div>
    `}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">合同金额（元）</label>
        <input class="form-input" id="ct-amount" type="number" step="0.01" value="${r?r.amount||0:0}" oninput="calcContractDerived()">
      </div>
      <div class="form-group">
        <label class="form-label">合同状态</label>
        <select class="form-select" id="ct-status">
          <option value="active" ${!r||r.status==='active'?'selected':''}>执行中</option>
          <option value="settled" ${r&&r.status==='settled'?'selected':''}>已结算</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <input class="form-input" id="ct-remark" value="${r?r.remark||'':''}">
    </div>
  </div>
  <div class="modal-footer">
    <div style="display:flex;gap:6px">
      ${isEdit?`<button class="btn btn-danger btn-sm" onclick="deleteRow('${isUp?'contracts_upstream':'contracts_downstream'}','${r.id}')">删除</button>`:''}
      ${isEdit&&isUp?`<button class="btn btn-ghost btn-sm" onclick="closeModal();openRevenueModal('${r.id}')"><i data-lucide="bar-chart-3" style="width:13px;height:13px;margin-right:2px"></i>营收管理</button>`:''}
    </div>
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveContract('${dir}',${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>
    </div>
  </div>`,'modal-lg');

  // 初始化自动计算
  setTimeout(calcContractDerived, 30);
}

function calcContractDerived(){
  const amount  = +document.getElementById('ct-amount')?.value||0;
  const taxRate = +document.getElementById('ct-taxrate')?.value||0;
  const profRate= +document.getElementById('ct-profrate')?.value||0;
  const exclTax = taxRate ? amount/(1+taxRate) : 0;
  const revAmt  = exclTax * profRate;
  const et = document.getElementById('ct-excl-tax');
  const ra = document.getElementById('ct-rev-amount');
  if(et) et.textContent = exclTax ? fmt(exclTax)+' 元' : '—（请填税率）';
  if(ra) ra.textContent = revAmt  ? fmt(revAmt)+' 元'  : '—';
}

function onContractCuChange(){
  const v=document.getElementById('ct-cu').value;
  const c=finState.customers.find(x=>x.id===v);
  if(c)document.getElementById('ct-cu-txt').value=c.name;
}
function onContractSuChange(){
  const v=document.getElementById('ct-su').value;
  const s=finState.suppliers.find(x=>x.id===v);
  if(s)document.getElementById('ct-su-txt').value=s.name;
}

async function saveContract(dir,id,btn){
  const name=q('ct-name').trim();
  if(!name){document.getElementById('ct-name').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const isUp=dir==='up';
  let data={name,amount:+q('ct-amount')||0,status:q('ct-status'),remark:q('ct-remark')};
  if(isUp){
    const cuId=document.getElementById('ct-cu').value;
    data.customer_id   = cuId||null;
    data.customer_name = cuId?(finState.customers.find(c=>c.id===cuId)||{}).name||q('ct-cu-txt'):q('ct-cu-txt');
    data.sign_date       = q('ct-date')||null;
    data.assessment_year = document.getElementById('ct-year')?.value||null;
    data.revenue_assessment_year = document.getElementById('ct-rev-year')?.value||null;
    data.tax_rate          = +q('ct-taxrate')||null;
    data.target_profit_rate= +q('ct-profrate')||null;
    data.measured_revenue  = +q('ct-measured')||0;
    data.main_contract_no  = q('ct-mcno')||'';
  } else {
    const suId=document.getElementById('ct-su').value;
    data.supplier_id   = suId||null;
    data.supplier_name = suId?(finState.suppliers.find(s=>s.id===suId)||{}).name||q('ct-su-txt'):q('ct-su-txt');
    data.upstream_contract_id = document.getElementById('ct-up').value||null;
  }
  const tbl=isUp?'contracts_upstream':'contracts_downstream';
  const arr=isUp?finState.contractsUp:finState.contractsDown;
  if(id){
    await sb.from(tbl).update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=arr.findIndex(x=>x.id===id);
    if(i>=0)arr[i]={...arr[i],...data};
  } else {
    const row={id:(isUp?'cu':'cd')+uid(),...data,created_at:new Date().toISOString()};
    await sb.from(tbl).insert(row);
    arr.push(row);
  }
  setLoading(btn,false);closeModal();finRender();toast(`✓ ${id?'已更新':'已添加'}`);
  finLogAction(id?'更新'+(isUp?'对上合同':'对下合同'):'新增'+(isUp?'对上合同':'对下合同'), `「${name}」`);
}

// ── 营收管理子弹框 ────────────────────────────────────────────────────────────
function openRevenueModal(contractId){
  const r   = finState.contractsUp.find(x=>x.id===contractId);
  if(!r) return;

  // ── 回款进度数据 ──
  const allReceipts = finState.actualReceipts.filter(x => x.upstream_contract_id === contractId);
  const byMonth = {};
  allReceipts.forEach(rec => {
    byMonth[rec.year_month] = (byMonth[rec.year_month]||0) + (+rec.amount||0);
  });
  const totalReceived = allReceipts.reduce((s,x)=>s+(+x.amount||0), 0);
  const contractAmt   = +r.amount || 0;
  const remaining     = contractAmt - totalReceived;
  const pct           = contractAmt > 0 ? Math.min(100, (totalReceived/contractAmt*100)) : 0;

  const monthRows = Object.entries(byMonth)
    .sort((a,b)=>a[0]>b[0]?1:-1)
    .map(([ym,amt]) => `
      <tr>
        <td style="padding:6px 10px;font-size:12px;color:var(--text2)">${ym.replace('-','年').replace(/(\d+)$/,'$1月')}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;color:var(--green);font-family:var(--mono)">${fmt(amt)}</td>
      </tr>`).join('');

  // ── 营收管理 tab 内容 ──
  const revenueTabContent = buildRevenueTabContent(r);

  openModal(`${modalHeader('合同详情 · ' + r.name)}
    <div class="modal-tabs">
      <button class="modal-tab active" id="rev-tab-progress" onclick="switchRevTab('progress')">回款进度</button>
      <button class="modal-tab" id="rev-tab-revenue" onclick="switchRevTab('revenue')">营收管理</button>
    </div>
    <div class="modal-body">
      <div id="rev-pane-progress">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
          <div class="stat-card">
            <div class="stat-label">合同金额</div>
            <div class="stat-val" style="font-size:18px">${fmt(contractAmt)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">累计已收</div>
            <div class="stat-val" style="font-size:18px;color:var(--green)">${fmt(totalReceived)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">未收余额</div>
            <div class="stat-val" style="font-size:18px;color:${remaining>0?'var(--amber)':'var(--green)'}">${fmt(remaining)}</div>
          </div>
        </div>
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:6px">
            <span>回款进度</span><span style="color:var(--green);font-weight:600">${pct.toFixed(1)}%</span>
          </div>
          <div style="height:10px;background:var(--surface2);border-radius:5px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--green)':'var(--blue)'};border-radius:5px;transition:width .4s"></div>
          </div>
        </div>
        ${monthRows ? `
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-weight:600">月度回款明细</div>
        <div style="max-height:200px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              <th style="padding:6px 10px;font-size:11px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">月份</th>
              <th style="padding:6px 10px;font-size:11px;text-align:right;color:var(--text3);border-bottom:1px solid var(--border)">实收金额（元）</th>
            </tr></thead>
            <tbody>${monthRows}</tbody>
          </table>
        </div>` : `<div style="text-align:center;color:var(--text3);padding:20px;font-size:12px">暂无回款记录</div>`}
      </div>
      <div id="rev-pane-revenue" style="display:none">
        ${revenueTabContent}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
    </div>`);
}

function switchRevTab(tab) {
  ['progress','revenue'].forEach(t => {
    const btn  = document.getElementById('rev-tab-'+t);
    const pane = document.getElementById('rev-pane-'+t);
    if (btn)  btn.classList.toggle('active', t===tab);
    if (pane) pane.style.display = t===tab?'block':'none';
  });
}

function buildRevenueTabContent(r) {
  const year = window._contractYear || new Date().getFullYear().toString();
  const rv   = computeContractRevenue(r, year);

  const months = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
  const revMap = {};
  finState.monthlyRevenues
    .filter(m=>m.contract_id===r.id&&(m.year_month||'').startsWith(year+'-'))
    .forEach(m=>{ revMap[m.year_month] = m; });

  const mRows = months.map(ym=>{
    const d = revMap[ym] || {};
    return `<tr>
      <td style="padding:6px 10px;color:var(--text2);font-size:12px;width:85px;white-space:nowrap">${ym}</td>
      <td style="padding:4px 8px"><input class="form-input rev-amt" data-ym="${ym}" type="number" step="0.01" value="${d.amount||''}" placeholder="金额" style="width:100%;padding:5px 8px;font-size:12px;text-align:right;font-family:var(--mono)"></td>
      <td style="padding:4px 8px"><input class="form-input rev-cnt" data-ym="${ym}" type="number" step="1" value="${d.count||''}" placeholder="笔数" style="width:100%;padding:5px 8px;font-size:12px;text-align:center"></td>
      <td style="padding:4px 8px"><input class="form-input rev-detail" data-ym="${ym}" value="${d.detail||''}" placeholder="收款明细" style="width:100%;padding:5px 8px;font-size:12px"></td>
    </tr>`;
  }).join('');

  const totalManual = Object.values(revMap).reduce((s,m)=>s+(+m.amount||0),0);

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;padding:12px;background:var(--surface2);border-radius:6px;font-size:12px">
      <div><div style="color:var(--text3)">不含税金额</div><div style="font-weight:600">${fmt(rv.exclTax)} 元</div></div>
      <div><div style="color:var(--text3)">已计量营收</div><div style="font-weight:600">${fmt(rv.measured)} 元</div></div>
      <div><div style="color:var(--text3)">${year}年填报营收</div><div style="font-weight:600;color:var(--blue)" id="rev-total-display">${fmt(totalManual)} 元</div></div>
      <div><div style="color:var(--text3)">开累完成营收</div><div style="font-weight:600">${fmt(rv.cumRev)} 元</div></div>
      <div><div style="color:var(--text3)">剩余营收</div><div style="font-weight:600;color:${rv.remain<0?'var(--red)':'var(--text)'}">${fmt(rv.remain)} 元</div></div>
      <div><div style="color:var(--text3)">营收完成进度</div><div style="font-weight:600;color:${rv.progress>=1?'var(--red)':rv.progress>=0.8?'var(--amber)':'var(--green)'}">${rv.exclTax?(rv.progress*100).toFixed(1)+'%':'—'}</div></div>
      <div><div style="color:var(--text3)">年完成毛利</div><div style="font-weight:600;color:var(--green)">${fmt(rv.yearProfit)} 元</div></div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px;padding:7px 10px;background:var(--surface2);border-radius:6px">
      📝 以下数据为手工填报，修改后请点击「保存营收」按钮
    </div>
    <table style="width:100%;border-collapse:collapse" id="rev-table">
      <thead><tr>
        <th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">月份</th>
        <th style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">收款金额</th>
        <th style="padding:6px 10px;text-align:center;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">笔数</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">收款明细</th>
      </tr></thead>
      <tbody>${mRows}</tbody>
    </table>
    <div style="margin-top:12px;text-align:right">
      <button class="btn btn-primary" onclick="saveMonthlyRevenue('${r.id}','${year}',this)">💾 保存营收</button>
    </div>`;
}

async function saveMonthlyRevenue(contractId, year, btn){
  setLoading(btn, true);
  const amts = document.querySelectorAll('.rev-amt');
  const cnts = document.querySelectorAll('.rev-cnt');
  const dtls = document.querySelectorAll('.rev-detail');

  const ops = [];
  const newRecords = [];
  for(let i=0;i<amts.length;i++){
    const ym   = amts[i].dataset.ym;
    const amt  = +amts[i].value||0;
    const cnt  = +cnts[i].value||0;
    const dtl  = dtls[i].value.trim();
    if(!amt && !cnt && !dtl) continue; // skip empty rows

    const existing = finState.monthlyRevenues.find(m=>m.contract_id===contractId&&m.year_month===ym);
    const record = {
      contract_id: contractId,
      year_month: ym,
      amount: amt,
      count: cnt,
      detail: dtl,
      updated_at: new Date().toISOString()
    };
    if(existing){
      record.id = existing.id;
      ops.push(sb.from('contract_monthly_revenue').update(record).eq('id', existing.id));
    } else {
      record.id = 'mr'+uid();
      record.created_at = new Date().toISOString();
      ops.push(sb.from('contract_monthly_revenue').insert(record));
    }
    newRecords.push({existing, record});
  }

  if(!ops.length){
    setLoading(btn, false);
    toast('无数据需要保存');
    return;
  }

  const results = await Promise.all(ops);
  let ok=0, fail=0;
  results.forEach((res, idx)=>{
    if(res.error){ fail++; return; }
    const {existing, record} = newRecords[idx];
    if(existing){
      const i = finState.monthlyRevenues.findIndex(m=>m.id===existing.id);
      if(i>=0) finState.monthlyRevenues[i] = {...finState.monthlyRevenues[i], ...record};
    } else {
      finState.monthlyRevenues.push(record);
    }
    ok++;
  });

  setLoading(btn, false);
  if(fail>0) toast(`⚠ 保存完成：${ok} 条成功，${fail} 条失败`, 'warning');
  else toast(`✓ 已保存 ${ok} 条月度营收`, 'success');
  closeModal();
  finRender();
}


function renderCustomers(){
  // 初始化筛选状态
  window._filters = window._filters || {};
  const f = window._filters;
  const custName = (f.cust_name || '').toLowerCase();

  let rows = finState.customers;
  if (custName) {
    rows = rows.filter(r => r.name.toLowerCase().includes(custName) || (r.short_name || '').toLowerCase().includes(custName));
  }

  const tbody = rows.length ? rows.map((r, i) => {
    const allContracts    = finState.contractsUp.filter(c => c.customer_id === r.id);
    const activeContracts = allContracts.filter(c => c.status === 'active');
    const totalAmt        = allContracts.reduce((s, c) => s + (+c.amount || 0), 0);
    const activeCount     = activeContracts.length;
    return `<tr class="clickable" onclick="openEditCustomerModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i + 1}</td>
      <td style="font-weight:500">${escHtml(r.name)}</td>
      <td style="color:var(--text2)">${escHtml(r.short_name || '—')}</td>
      <td>${escHtml(r.contact || '—')}</td>
      <td style="font-family:var(--mono);font-size:12px">${escHtml(r.phone || '—')}</td>
      <td class="num">${allContracts.length || '—'}</td>
      <td class="num">${totalAmt ? fmt(totalAmt) + ' <span class="unit">元</span>' : '—'}</td>
      <td style="text-align:center">
        ${activeCount > 0
          ? `<button class="btn btn-ghost btn-xs" style="color:var(--blue)"
              onclick="event.stopPropagation();openCustomerContractsModal('${r.id}','${r.name.replace(/'/g, '\\\'')}')">${activeCount} 个</button>`
          : `<span style="color:var(--text3)">—</span>`}
      </td>
      <td style="font-size:12px;color:var(--text3)">${r.remark || '—'}</td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="9"><div class="empty"><i data-lucide="users" class="empty-icon"></i>${custName ? '无匹配客户' : '暂无客户，点击右上角新增'}</div></td></tr>`;

  // 筛选行
  const filterHTML = `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
    <input class="form-input" id="f-cust-name" placeholder="客户名称或简称..." style="width:200px;padding:5px 10px;font-size:12px" value="${f.cust_name || ''}">
    <button class="btn btn-sm btn-primary" onclick="applyCustomerFilters()">查询</button>
    <button class="btn btn-sm btn-ghost" onclick="resetCustomerFilters()">重置</button>
    <span style="font-size:11px;color:var(--text3);margin-left:4px">${rows.length} 条结果</span>
  </div>`;

  document.getElementById('main-content').innerHTML = `
  ${filterHTML}
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">客户库</div>
      <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="downloadCustomerTemplate()">↓ 模板</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">
          ↑ 导入 Excel
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="importCustomersExcel(event)">
        </label>
        <button class="btn btn-ghost btn-sm" onclick="exportCustomersExcel()">↓ 导出</button>
        <span style="font-size:11px;color:var(--text3)">点击「执行中」查看合同明细</span>
      </div>
    </div>
    <div class="table-scroll"><table style="width:auto;min-width:100%">
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="min-width:140px">客户名称</th>
        <th style="min-width:90px">简称</th>
        <th style="min-width:90px">联系人</th>
        <th style="min-width:110px">联系电话</th>
        <th class="num" style="min-width:90px">累签合同数</th>
        <th class="num" style="min-width:120px">累签合同金额</th>
        <th style="min-width:90px;text-align:center">执行中合同</th>
        <th>备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
  </div>`;
}

// 执行中合同弹框列表
function openCustomerContractsModal(customerId, customerName){
  const actives = finState.contractsUp.filter(c=>c.customer_id===customerId&&c.status==='active');
  const rows = actives.map((c,i)=>{
    const rv = computeContractRevenue(c, window._contractYear||new Date().getFullYear().toString());
    return `<tr class="clickable" onclick="closeModal();window._contractTab='up';switchTab('contracts');setTimeout(()=>openEditContractModal('up','${c.id}'),100)">
      <td style="color:var(--text3);width:28px;text-align:center">${i+1}</td>
      <td style="font-weight:500">${escHtml(c.name)}</td>
      <td class="num">${fmt(c.amount)} 元</td>
      <td class="num">${rv.exclTax?fmt(rv.exclTax)+' 元':'—'}</td>
      <td class="num" style="color:${rv.progress>=0.8?'var(--amber)':'var(--green)'}">${rv.exclTax?(rv.progress*100).toFixed(1)+'%':'—'}</td>
      <td>${c.sign_date||'—'}</td>
    </tr>`;
  }).join('');

  openModal(`
  <div class="modal-header">
    <div class="modal-title">执行中合同 — ${customerName}（${actives.length} 个）</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body" style="padding-top:8px">
    <table>
      <thead><tr>
        <th style="width:28px">#</th>
        <th>合同名称</th>
        <th class="num" style="min-width:90px">合同金额</th>
        <th class="num" style="min-width:90px">不含税金额</th>
        <th class="num" style="min-width:90px">营收完成进度</th>
        <th>签约日期</th>
      </tr></thead>
      <tbody>${rows||`<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">暂无数据</td></tr>`}</tbody>
    </table>
    <div style="font-size:11px;color:var(--text3);margin-top:10px">点击合同行跳转至合同库编辑</div>
  </div>
  <div class="modal-footer"><div></div>
    <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
  </div>`);
}

function openAddCustomerModal(){openEditCustomerModal(null);}
function openEditCustomerModal(id){
  const r=id?finState.customers.find(x=>x.id===id):null;
  const isEdit=!!r;

  // 编辑弹框内也显示统计（只读）
  let statsHtml='';
  if(isEdit){
    const all    = finState.contractsUp.filter(c=>c.customer_id===r.id);
    const active = all.filter(c=>c.status==='active');
    const total  = all.reduce((s,c)=>s+(+c.amount||0),0);
    statsHtml=`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;padding:10px 12px;background:var(--surface2);border-radius:6px;font-size:12px">
      <div><div style="color:var(--text3)">累签合同数</div><div style="font-weight:600">${all.length}</div></div>
      <div><div style="color:var(--text3)">累签合同金额</div><div style="font-weight:600">${total?fmt(total)+' 元':'—'}</div></div>
      <div><div style="color:var(--text3)">执行中合同</div>
        ${active.length>0
          ?`<button class="btn btn-ghost btn-xs" style="color:var(--blue);padding:0;height:auto"
              onclick="closeModal();openCustomerContractsModal('${r.id}','${r.name.replace(/'/g,'\\\'')}')">${active.length} 个 →</button>`
          :`<div style="font-weight:600">—</div>`}
      </div>
    </div>`;
  }

  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑客户':'新增客户'}</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    ${statsHtml}
    <div class="form-row">
      <div class="form-group"><label class="form-label">客户名称 *</label><input class="form-input" id="cu-name" value="${r?r.name||'':''}"></div>
      <div class="form-group"><label class="form-label">简称</label><input class="form-input" id="cu-short" value="${r?r.short_name||'':''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">联系人</label><input class="form-input" id="cu-contact" value="${r?r.contact||'':''}"></div>
      <div class="form-group"><label class="form-label">联系电话</label><input class="form-input" id="cu-phone" value="${r?r.phone||'':''}"></div>
    </div>
    <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="cu-remark" value="${r?r.remark||'':''}"></div>
  </div>
  <div class="modal-footer">
    ${isEdit?`<button class="btn btn-danger btn-sm" onclick="deleteRow('customers','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveCustomer(${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>
    </div>
  </div>`);
}
async function saveCustomer(id,btn){
  const name=q('cu-name').trim();
  if(!name){document.getElementById('cu-name').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const data={name,short_name:q('cu-short'),contact:q('cu-contact'),phone:q('cu-phone'),remark:q('cu-remark')};
  if(id){
    await sb.from('customers').update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=finState.customers.findIndex(x=>x.id===id);
    if(i>=0)finState.customers[i]={...finState.customers[i],...data};
  } else {
    const row={id:'cu'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('customers').insert(row);
    finState.customers.push(row);
  }
  setLoading(btn,false);closeModal();finRender();toast(`✓ ${id?'已更新':'已添加'}`);
  finLogAction(id?'更新客户':'新增客户', `「${name}」`);
}

//  供应商库
function renderSuppliers(){
  window._filters = window._filters || {};
  const fName = (window._filters.supplier_name || '').toLowerCase();

  let rows = finState.suppliers;
  if (fName) rows = rows.filter(r => (r.name||'').toLowerCase().includes(fName));

  const total = rows.length;
  const tbody = rows.length ? rows.map((r,i)=>`
    <tr class="clickable" onclick="openEditSupplierModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td style="font-weight:500">${escHtml(r.name)}</td>
      <td style="color:var(--text2)">${escHtml(r.short_name||'—')}</td>
      <td>${escHtml(r.contact||'—')}</td>
      <td style="font-family:var(--mono);font-size:12px">${escHtml(r.phone||'—')}</td>
      <td style="font-size:12px;color:var(--text3)">${escHtml(r.remark||'—')}</td>
    </tr>`).join('')
    :`<tr><td colspan="6"><div class="empty"><i data-lucide="building" class="empty-icon"></i>暂无供应商，点击右上角新增</div></td></tr>`;

  const filterHTML = `<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
    <input class="form-input" id="f-supplier-name" placeholder="供应商名称..." style="width:200px;padding:5px 10px;font-size:12px" value="${window._filters.supplier_name||''}">
    <button class="btn btn-sm btn-primary" onclick="applySupplierFilter()">查询</button>
    <button class="btn btn-sm btn-ghost" onclick="resetSupplierFilter()">重置</button>
    <span style="font-size:11px;color:var(--text3);margin-left:4px">${total} 条结果</span>
  </div>`;

  document.getElementById('main-content').innerHTML=`
  ${filterHTML}
  <div class="table-wrap">
    <div class="table-toolbar"><div class="table-title">供应商库</div><div style="margin-left:auto;font-size:11px;color:var(--text3)">点击行编辑</div></div>
    <div class="table-scroll"><table style="width:auto;min-width:100%">
      <thead><tr>
        <th style="width:32px">#</th><th style="min-width:160px">供应商名称</th>
        <th style="min-width:100px">简称</th><th style="min-width:100px">联系人</th>
        <th style="min-width:120px">联系电话</th><th>备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
  </div>`;
}
function openAddSupplierModal(){openEditSupplierModal(null);}
function openEditSupplierModal(id){
  const r=id?finState.suppliers.find(x=>x.id===id):null;
  const isEdit=!!r;
  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑供应商':'新增供应商'}</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    <div class="form-row">
      <div class="form-group"><label class="form-label">供应商名称 *</label><input class="form-input" id="su-name" value="${r?r.name||'':''}"></div>
      <div class="form-group"><label class="form-label">简称</label><input class="form-input" id="su-short" value="${r?r.short_name||'':''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">联系人</label><input class="form-input" id="su-contact" value="${r?r.contact||'':''}"></div>
      <div class="form-group"><label class="form-label">联系电话</label><input class="form-input" id="su-phone" value="${r?r.phone||'':''}"></div>
    </div>
    <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="su-remark" value="${r?r.remark||'':''}"></div>
  </div>
  <div class="modal-footer">
    ${isEdit?`<button class="btn btn-danger btn-sm" onclick="deleteRow('suppliers','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveSupplier(${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>
    </div>
  </div>`);
}
async function saveSupplier(id,btn){
  const name=q('su-name').trim();
  if(!name){document.getElementById('su-name').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const data={name,short_name:q('su-short'),contact:q('su-contact'),phone:q('su-phone'),remark:q('su-remark')};
  if(id){
    await sb.from('suppliers').update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=finState.suppliers.findIndex(x=>x.id===id);
    if(i>=0)finState.suppliers[i]={...finState.suppliers[i],...data};
  } else {
    const row={id:'su'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('suppliers').insert(row);
    finState.suppliers.push(row);
  }
  setLoading(btn,false);closeModal();finRender();toast(`✓ ${id?'已更新':'已添加'}`);
  finLogAction(id?'更新供应商':'新增供应商', `「${name}」`);
}

//  删除通用 
async function deleteRow(table,id){
  showConfirm('确认删除', '确认删除该条记录？此操作不可撤销。', async function() {
    await sb.from(table).delete().eq('id',id);
    const tblMap={
      payment_plans:'payments', receipt_records:'receipts',
      actual_receipts:'actualReceipts', actual_payments:'actualPayments',
      contracts_upstream:'contractsUp', contracts_downstream:'contractsDown',
      customers:'customers', suppliers:'suppliers'
    };
    const key=tblMap[table];
    if(key&&finState[key])finState[key]=finState[key].filter(x=>x.id!==id);
    closeModal();finRender();toast('已删除', 'success');
  }, {danger: true, confirmLabel: '删除'});
}

//  Excel 导出（第4步完成完整版，此处为预留入口）

// ── 合同状态内联更新 ──────────────────────────────────────────────────────────
async function updateContractStatus(dir, id, sel){
  const status = sel.value;
  const tbl = dir==='up' ? 'contracts_upstream' : 'contracts_downstream';
  const arr = dir==='up' ? finState.contractsUp : finState.contractsDown;
  // 立即更新样式
  sel.className = `status-inline ${status==='active'?'tag-active':'tag-settled'}`;
  const {error} = await sb.from(tbl)
    .update({status, updated_at: new Date().toISOString()}).eq('id', id);
  if(error){ toast('✗ 状态更新失败', 'error'); return; }
  const item = arr.find(x=>x.id===id);
  if(item) item.status = status;
  toast(`✓ 状态已更新为「${status==='active'?'执行中':'已结算'}」`);
  finLogAction('更新合同状态', `合同 ${id} → ${status}`);
}


// ─── 近6月收付趋势图 ──────────────────────────────────────────
async function buildTrendSVGData(months) {
  var recRes, payRes;
  try {
    var results = await Promise.all([
      sb.from('actual_receipts').select('year_month,amount').in('year_month', months),
      sb.from('actual_payments').select('year_month,amount').in('year_month', months)
    ]);
    recRes = results[0];
    payRes = results[1];
  } catch(e) {
    recRes = { data: [] };
    payRes = { data: [] };
  }
  var recByMonth = {};
  var payByMonth = {};
  months.forEach(function(m) { recByMonth[m] = 0; payByMonth[m] = 0; });
  (recRes.data || []).forEach(function(r) { recByMonth[r.year_month] = (recByMonth[r.year_month]||0) + (+r.amount||0); });
  (payRes.data || []).forEach(function(r) { payByMonth[r.year_month] = (payByMonth[r.year_month]||0) + (+r.amount||0); });
  return { recByMonth: recByMonth, payByMonth: payByMonth };
}

function buildTrendSVGStatic(months, recByMonth, payByMonth) {
  var W = 560, H = 160;
  var PAD = { l: 50, r: 20, t: 16, b: 28 };
  var innerW = W - PAD.l - PAD.r;
  var innerH = H - PAD.t - PAD.b;
  var allVals = [];
  Object.keys(recByMonth).forEach(function(k) { allVals.push(recByMonth[k]); });
  Object.keys(payByMonth).forEach(function(k) { allVals.push(payByMonth[k]); });
  var maxVal = Math.max.apply(null, allVals.concat([1]));

  var xStep = innerW / (months.length - 1);
  function scaleY(v) { return PAD.t + innerH - (v / maxVal) * innerH; }
  function scaleX(i) { return PAD.l + i * xStep; }

  var recPoints = months.map(function(m, i) { return scaleX(i) + ',' + scaleY(recByMonth[m]); }).join(' ');
  var payPoints = months.map(function(m, i) { return scaleX(i) + ',' + scaleY(payByMonth[m]); }).join(' ');

  var xLabels = months.map(function(m, i) {
    var mon = parseInt(m.split('-')[1]);
    return '<text x="' + scaleX(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--text3)">' + mon + '月</text>';
  }).join('');

  var yMax = (maxVal / 10000).toFixed(1);
  var yMid = (maxVal / 10000 / 2).toFixed(1);

  var dots = function(points, color, clickType) {
    var pts = points.split(' ');
    return pts.map(function(p) {
      var parts = p.split(',');
      return '<circle cx="' + parts[0] + '" cy="' + parts[1] + '" r="8" fill="transparent" stroke="none" style="cursor:pointer" onclick="showTrendDayDetail(\'' + clickType + '\')"/>' +
        '<circle cx="' + parts[0] + '" cy="' + parts[1] + '" r="3.5" fill="' + color + '" stroke="var(--bg)" stroke-width="1.5" style="pointer-events:none"/>';
    }).join('');
  };

  return '<div class="chart-card" style="padding:16px 18px;margin-top:14px">' +
    '<div class="chart-title" style="margin-bottom:12px">近 6 月收付趋势' +
      '<span style="font-size:11px;font-weight:400;color:var(--text3)"> 万元</span>' +
      '<span style="float:right;display:flex;gap:12px;font-size:11px;font-weight:400">' +
        '<span style="display:flex;align-items:center;gap:4px">' +
          '<span style="width:12px;height:2px;background:#27ae60;display:inline-block;border-radius:1px"></span>实际收款' +
        '</span>' +
        '<span style="display:flex;align-items:center;gap:4px">' +
          '<span style="width:12px;height:2px;background:#2e7dd1;display:inline-block;border-radius:1px"></span>实际支付' +
        '</span>' +
      '</span>' +
    '</div>' +
    '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible">' +
      '<line x1="' + PAD.l + '" y1="' + PAD.t + '" x2="' + PAD.l + '" y2="' + (PAD.t + innerH) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<line x1="' + PAD.l + '" y1="' + (PAD.t + innerH) + '" x2="' + (PAD.l + innerW) + '" y2="' + (PAD.t + innerH) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<line x1="' + PAD.l + '" y1="' + scaleY(maxVal / 2) + '" x2="' + (PAD.l + innerW) + '" y2="' + scaleY(maxVal / 2) + '" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>' +
      '<text x="' + (PAD.l - 4) + '" y="' + (PAD.t + 4) + '" text-anchor="end" font-size="10" fill="var(--text3)">' + yMax + '</text>' +
      '<text x="' + (PAD.l - 4) + '" y="' + (scaleY(maxVal / 2) + 4) + '" text-anchor="end" font-size="10" fill="var(--text3)">' + yMid + '</text>' +
      '<text x="' + (PAD.l - 4) + '" y="' + (PAD.t + innerH + 4) + '" text-anchor="end" font-size="10" fill="var(--text3)">0</text>' +
      '<polyline points="' + recPoints + '" fill="none" stroke="#27ae60" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<polyline points="' + payPoints + '" fill="none" stroke="#2e7dd1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots(recPoints, '#27ae60', 'rec') +
      dots(payPoints, '#2e7dd1', 'pay') +
      xLabels +
    '</svg>' +
  '</div>';
}

// ─── Dashboard click-to-detail modals ─────────────────────────────────────────
function showFinSummaryModal() {
  var c = computeTotals();
  var sum = finState.summary || {};
  var actRec = finState.actualReceipts.reduce(function(s,r){return s+(+r.amount||0);},0);
  var actPay = finState.actualPayments.reduce(function(s,r){return s+(+r.amount||0);},0);
  var header = '<tr style="background:var(--surface2)"><td colspan="3"><b>资金计划明细 · ' + fmtMon(currentMonth) + '</b></td></tr>';
  var rows = [
    ['一、固定支出','',''],
    ['人工费',fmt(sum.labor_cost||0)+' 万',fmt(sum.actual_labor||0)+' 万'],
    ['部门费用',fmt(sum.dept_cost||0)+' 万',fmt(sum.actual_dept||0)+' 万'],
    ['摊销',fmt(sum.amortization||0)+' 万',fmt(sum.actual_amortization||0)+' 万'],
    ['公司锁定',fmt(sum.company_lock||0)+' 万',fmt(sum.actual_company_lock||0)+' 万'],
    ['还本付息',fmt(sum.debt_service||0)+' 万',fmt(sum.actual_debt_service||0)+' 万'],
    ['支出小计',fmt(c.totalExp||0)+' 万',''],
    ['二、资金筹措','',''],
    ['股东注资',fmt(sum.shareholder_injection||0)+' 万','—'],
    ['股东借款',fmt(sum.shareholder_loan||0)+' 万','—'],
    ['流动资金贷款',fmt(sum.working_capital_loan||0)+' 万','—'],
    ['供应链金融',fmt(sum.supply_chain_finance||0)+' 万','—'],
    ['筹措小计',fmt(c.funding||0)+' 万',''],
    ['三、资金溢缺',fmt(c.surplus||0)+' 万',''],
    ['实际收款',fmt(actRec)+' 万',''],
    ['实际付款',fmt(actPay)+' 万',''],
  ];
  var tbody = rows.map(function(r){
    var cls = r[0].indexOf('一、')===0||r[0].indexOf('二、')===0||r[0].indexOf('三、')===0 ? 'style="font-weight:600;background:var(--surface2)"' : '';
    return '<tr '+cls+'><td>'+r[0]+'</td><td style="text-align:right;font-family:var(--mono)">'+r[1]+'</td><td style="text-align:right;font-family:var(--mono);color:var(--text3)">'+(r[2]||'')+'</td></tr>';
  }).join('');
  openModal(modalHeader('资金计划明细 · '+fmtMon(currentMonth)) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<table class="data-table" style="width:100%"><thead><tr><th>项目</th><th style="text-align:right">计划数（万元）</th><th style="text-align:right">实际数（万元）</th></tr></thead><tbody>'+tbody+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showPlanIncomeModal() {
  var rows = finState.receipts.length
    ? finState.receipts.map(function(r){
        var ratio = r.contract_amount ? ((+r.cumulative_received||0)/(+r.contract_amount)*100).toFixed(1) : 0;
        return '<tr><td>'+escHtml(r.contract_name||'—')+'</td><td>'+escHtml(r.customer_name||'—')+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(r.contract_amount)+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(r.cumulative_received)+'</td><td style="text-align:right;font-family:var(--mono)">'+ratio+'%</td></tr>';
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">暂无收款计划</td></tr>';
  openModal(modalHeader('计划收入明细 · '+fmtMon(currentMonth)) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<table class="data-table" style="width:100%"><thead><tr><th>合同名称</th><th>客户</th><th style="text-align:right">合同金额</th><th style="text-align:right">累计收款</th><th style="text-align:right">收款率</th></tr></thead><tbody>'+rows+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showPlanExpenseModal() {
  var rows = finState.payments.length
    ? finState.payments.map(function(r){
        var planSub = (+r.plan_cash||0)+(+r.plan_supply_chain||0);
        var act = finState.actualPayments.filter(function(p){return p.downstream_contract_id===r.downstream_contract_id;}).reduce(function(s,p){return s+(+p.amount||0);},0);
        var ratio = planSub ? (act/planSub*100).toFixed(1) : 0;
        return '<tr><td>'+escHtml(r.contract_name||'—')+'</td><td>'+escHtml(r.supplier_name||'—')+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(planSub)+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(act)+'</td><td style="text-align:right;font-family:var(--mono)">'+ratio+'%</td></tr>';
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px">暂无付款计划</td></tr>';
  openModal(modalHeader('计划支出明细 · '+fmtMon(currentMonth)) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<table class="data-table" style="width:100%"><thead><tr><th>合同名称</th><th>供应商</th><th style="text-align:right">计划金额</th><th style="text-align:right">实际支付</th><th style="text-align:right">支付率</th></tr></thead><tbody>'+rows+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showCashFlowModal() {
  var prevMon = prevMonthOf(currentMonth);
  var prevBalance = computePrevBalance();
  var actRec = finState.actualReceipts.reduce(function(s,r){return s+(+r.amount||0);},0);
  var actPay = finState.actualPayments.reduce(function(s,r){return s+(+r.amount||0);},0);
  var rtcf = computeRealTimeCashFlow();
  var html = '<table class="data-table" style="width:100%;margin-bottom:16px">' +
    '<tr><td style="font-weight:600">上月完成净额</td><td style="text-align:right;font-family:var(--mono);font-weight:600">'+fmt(prevBalance)+'</td><td style="font-size:11px;color:var(--text3)">'+fmtMon(prevMon)+' 上月实际收付差额</td></tr>' +
    '<tr><td>当月实际收款</td><td style="text-align:right;font-family:var(--mono);color:#27ae60">+ '+fmt(actRec)+'</td><td style="font-size:11px;color:var(--text3)">'+fmtMon(currentMonth)+' 所有实际收款汇总</td></tr>' +
    '<tr><td>当月实际付款</td><td style="text-align:right;font-family:var(--mono);color:#e74c3c">- '+fmt(actPay)+'</td><td style="font-size:11px;color:var(--text3)">'+fmtMon(currentMonth)+' 所有实际付款汇总</td></tr>' +
    '<tr style="background:var(--surface2)"><td style="font-weight:600">实时现金流</td><td style="text-align:right;font-family:var(--mono);font-weight:600;color:'+(rtcf>=0?'#27ae60':'#e74c3c')+'">'+fmt(rtcf)+'</td><td style="font-size:11px;color:var(--text3)">上月净额 + 当月实收 - 当月实付</td></tr>' +
    '</table>';
  openModal(modalHeader('实时现金流计算明细') +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' + html +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showFlowRatioModal() {
  var actRec = finState.actualReceipts.reduce(function(s,r){return s+(+r.amount||0);},0);
  var actPay = finState.actualPayments.reduce(function(s,r){return s+(+r.amount||0);},0);
  var total = actRec + actPay || 1;
  var recPct = (actRec/total*100).toFixed(1);
  var payPct = (actPay/total*100).toFixed(1);
  var recRows = finState.actualReceipts.length
    ? finState.actualReceipts.map(function(r){return '<tr><td>'+escHtml(r.contract_name||'—')+'</td><td>'+escHtml(r.customer_name||'—')+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(r.amount)+'</td><td>'+escHtml(r.receipt_date||'—')+'</td></tr>';}).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px">暂无收款记录</td></tr>';
  var payRows = finState.actualPayments.length
    ? finState.actualPayments.map(function(r){return '<tr><td>'+escHtml(r.contract_name||'—')+'</td><td>'+escHtml(r.supplier_name||'—')+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(r.amount)+'</td><td>'+escHtml(r.payment_date||'—')+'</td></tr>';}).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:24px">暂无付款记录</td></tr>';
  openModal(modalHeader('收付明细 · '+fmtMon(currentMonth)) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<div style="display:flex;gap:20px;margin-bottom:16px">' +
      '<div style="flex:1;text-align:center;padding:16px;background:var(--surface2);border-radius:8px"><div style="font-size:24px;font-family:var(--mono);color:#27ae60;font-weight:600">'+fmt(actRec)+'</div><div style="font-size:12px;color:var(--text3);margin-top:4px">实际收款 ('+recPct+'%)</div></div>' +
      '<div style="flex:1;text-align:center;padding:16px;background:var(--surface2);border-radius:8px"><div style="font-size:24px;font-family:var(--mono);color:#2e7dd1;font-weight:600">'+fmt(actPay)+'</div><div style="font-size:12px;color:var(--text3);margin-top:4px">实际付款 ('+payPct+'%)</div></div>' +
    '</div>' +
    '<div style="font-weight:600;margin-bottom:8px">收款记录</div>' +
    '<table class="data-table" style="width:100%"><thead><tr><th>合同</th><th>客户</th><th style="text-align:right">金额</th><th>日期</th></tr></thead><tbody>'+recRows+'</tbody></table>' +
    '<div style="font-weight:600;margin:16px 0 8px">付款记录</div>' +
    '<table class="data-table" style="width:100%"><thead><tr><th>合同</th><th>供应商</th><th style="text-align:right">金额</th><th>日期</th></tr></thead><tbody>'+payRows+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showMoMComparisonModal() {
  var prevMon = prevMonthOf(currentMonth);
  var actRec = finState.actualReceipts.reduce(function(s,r){return s+(+r.amount||0);},0);
  var actPay = finState.actualPayments.reduce(function(s,r){return s+(+r.amount||0);},0);
  var prevRec = finState.prevActualReceipts.reduce(function(s,r){return s+(+r.amount||0);},0);
  var prevPay = finState.prevActualPayments.reduce(function(s,r){return s+(+r.amount||0);},0);
  var recChange = prevRec ? ((actRec-prevRec)/prevRec*100).toFixed(1) : null;
  var payChange = prevPay ? ((actPay-prevPay)/prevPay*100).toFixed(1) : null;
  openModal(modalHeader('月度环比 · '+fmtMon(currentMonth)+' vs '+fmtMon(prevMon)) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<table class="data-table" style="width:100%"><thead><tr><th>指标</th><th style="text-align:right">'+fmtMon(prevMon)+'</th><th style="text-align:right">'+fmtMon(currentMonth)+'</th><th style="text-align:right">环比</th></tr></thead><tbody>' +
    '<tr><td>实际收款</td><td style="text-align:right;font-family:var(--mono)">'+fmt(prevRec)+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(actRec)+'</td><td style="text-align:right;font-family:var(--mono);color:'+(recChange===null?'var(--text3)':recChange>=0?'#27ae60':'#e74c3c')+'">'+(recChange===null?'—':(recChange>=0?'+'+recChange:recChange)+'%')+'</td></tr>' +
    '<tr><td>实际付款</td><td style="text-align:right;font-family:var(--mono)">'+fmt(prevPay)+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(actPay)+'</td><td style="text-align:right;font-family:var(--mono);color:'+(payChange===null?'var(--text3)':payChange<=0?'#27ae60':'#e74c3c')+'">'+(payChange===null?'—':(payChange<=0?payChange:'+'+payChange)+'%')+'</td></tr>' +
    '</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showCompletionRateModal() {
  var c = computeTotals();
  var actRec = finState.actualReceipts.reduce(function(s,r){return s+(+r.amount||0);},0);
  var actPay = finState.actualPayments.reduce(function(s,r){return s+(+r.amount||0);},0);
  var recRatio = c.planRec ? (actRec/c.planRec*100).toFixed(1) : 0;
  var payRatio = c.planPay ? (actPay/c.planPay*100).toFixed(1) : 0;
  var recRemain = c.planRec ? (c.planRec - actRec) : 0;
  var payRemain = c.planPay ? (c.planPay - actPay) : 0;
  openModal(modalHeader('收付款完成率明细 · '+fmtMon(currentMonth)) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<table class="data-table" style="width:100%"><thead><tr><th>指标</th><th style="text-align:right">计划</th><th style="text-align:right">实际</th><th style="text-align:right">完成率</th><th style="text-align:right">剩余</th></tr></thead><tbody>' +
    '<tr><td>收款</td><td style="text-align:right;font-family:var(--mono)">'+fmt(c.planRec)+'</td><td style="text-align:right;font-family:var(--mono);color:#27ae60">'+fmt(actRec)+'</td><td style="text-align:right;font-family:var(--mono);font-weight:600">'+recRatio+'%</td><td style="text-align:right;font-family:var(--mono);color:'+(recRemain>0?'var(--red)':'var(--green)')+'">'+fmt(recRemain)+'</td></tr>' +
    '<tr><td>付款</td><td style="text-align:right;font-family:var(--mono)">'+fmt(c.planPay)+'</td><td style="text-align:right;font-family:var(--mono);color:#2e7dd1">'+fmt(actPay)+'</td><td style="text-align:right;font-family:var(--mono);font-weight:600">'+payRatio+'%</td><td style="text-align:right;font-family:var(--mono);color:'+(payRemain>0?'var(--red)':'var(--green)')+'">'+fmt(payRemain)+'</td></tr>' +
    '</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showReceiptDetailModal(recordId) {
  var plan = finState.receipts.find(function(r){return r.id===recordId;});
  if (!plan) { toast('未找到收款计划', 'error'); return; }
  var ratio = plan.contract_amount ? ((+plan.cumulative_received||0)/(+plan.contract_amount)*100).toFixed(1) : 0;
  var actuals = finState.actualReceipts.filter(function(r){return r.upstream_contract_id===plan.upstream_contract_id;});
  var actualTotal = actuals.reduce(function(s,r){return s+(+r.amount||0);},0);
  var summary = '<table class="data-table" style="width:100%;margin-bottom:16px">' +
    '<tr><td style="font-weight:600">合同名称</td><td>'+escHtml(plan.contract_name||'—')+'</td></tr>' +
    '<tr><td style="font-weight:600">客户</td><td>'+escHtml(plan.customer_name||'—')+'</td></tr>' +
    '<tr><td style="font-weight:600">合同金额</td><td style="font-family:var(--mono)">'+fmt(plan.contract_amount)+' 元</td></tr>' +
    '<tr><td style="font-weight:600">累计收款</td><td style="font-family:var(--mono);color:#27ae60">'+fmt(plan.cumulative_received)+' 元 ('+ratio+'%)</td></tr>' +
    '<tr><td style="font-weight:600">计划收款（本期）</td><td style="font-family:var(--mono)">'+fmt(plan.plan_amount)+' 元</td></tr>' +
    '</table>';
  var detailRows = actuals.length
    ? actuals.map(function(r){return '<tr><td>'+escHtml(r.receipt_date||'—')+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(r.amount)+'</td><td>'+escHtml(r.remark||'—')+'</td></tr>';}).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:20px">暂无实际收款记录</td></tr>';
  openModal(modalHeader('收款详情 · '+escHtml(plan.contract_name||'—')) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    summary +
    '<div style="font-weight:600;margin-bottom:8px">实际收款明细</div>' +
    '<table class="data-table" style="width:100%"><thead><tr><th>收款日期</th><th style="text-align:right">金额（元）</th><th>备注</th></tr></thead><tbody>'+detailRows+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showPaymentDetailModal(planId) {
  var plan = finState.payments.find(function(r){return r.id===planId;});
  if (!plan) { toast('未找到付款计划', 'error'); return; }
  var planSub = (+plan.plan_cash||0)+(+plan.plan_supply_chain||0);
  var actuals = finState.actualPayments.filter(function(r){return r.downstream_contract_id===plan.downstream_contract_id;});
  var actualTotal = actuals.reduce(function(s,r){return s+(+r.amount||0);},0);
  var ratio = planSub ? (actualTotal/planSub*100).toFixed(1) : 0;
  var summary = '<table class="data-table" style="width:100%;margin-bottom:16px">' +
    '<tr><td style="font-weight:600">合同名称</td><td>'+escHtml(plan.contract_name||'—')+'</td></tr>' +
    '<tr><td style="font-weight:600">供应商</td><td>'+escHtml(plan.supplier_name||'—')+'</td></tr>' +
    '<tr><td style="font-weight:600">合同金额</td><td style="font-family:var(--mono)">'+fmt(plan.contract_amount)+' 元</td></tr>' +
    '<tr><td style="font-weight:600">计划现金</td><td style="font-family:var(--mono)">'+fmt(plan.plan_cash)+' 元</td></tr>' +
    '<tr><td style="font-weight:600">计划供应链</td><td style="font-family:var(--mono)">'+fmt(plan.plan_supply_chain)+' 元</td></tr>' +
    '<tr><td style="font-weight:600">实际支付合计</td><td style="font-family:var(--mono);color:#2e7dd1">'+fmt(actualTotal)+' 元 ('+ratio+'%)</td></tr>' +
    '</table>';
  var detailRows = actuals.length
    ? actuals.map(function(r){return '<tr><td>'+escHtml(r.payment_date||'—')+'</td><td style="text-align:right;font-family:var(--mono)">'+fmt(r.amount)+'</td><td>'+escHtml(r.remark||'—')+'</td></tr>';}).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:20px">暂无实际支付记录</td></tr>';
  openModal(modalHeader('付款详情 · '+escHtml(plan.contract_name||'—')) +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    summary +
    '<div style="font-weight:600;margin-bottom:8px">实际支付明细</div>' +
    '<table class="data-table" style="width:100%"><thead><tr><th>支付日期</th><th style="text-align:right">金额（元）</th><th>备注</th></tr></thead><tbody>'+detailRows+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}

function showTrendDayDetail(clickType) {
  var label = clickType === 'rec' ? '收款' : '付款';
  var dataSource = clickType === 'rec' ? finState.actualReceipts : finState.actualPayments;
  var trendMonths = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    trendMonths.push(d.toISOString().slice(0, 7));
  }
  var monthTotals = {};
  trendMonths.forEach(function(m){ monthTotals[m] = 0; });
  dataSource.forEach(function(r){
    var ym = (r.year_month||'').substring(0,7);
    if (monthTotals.hasOwnProperty(ym)) monthTotals[ym] += (+r.amount||0);
  });
  var rows = trendMonths.map(function(m){
    var val = monthTotals[m];
    var mon = parseInt(m.split('-')[1]);
    return '<tr><td>'+m+' ('+mon+'月)</td><td style="font-family:var(--mono);text-align:right;font-weight:600">'+(val/10000).toFixed(1)+'</td><td style="font-family:var(--mono);text-align:right;color:var(--text3)">'+fmt(val)+'</td></tr>';
  }).join('');
  openModal(modalHeader('近6月'+label+'趋势明细') +
    '<div class="modal-body" style="padding:16px 20px"><div style="max-height:65vh;overflow:auto">' +
    '<table class="data-table" style="width:100%"><thead><tr><th>月份</th><th style="text-align:right">万元</th><th style="text-align:right">元</th></tr></thead><tbody>'+rows+'</tbody></table>' +
    '</div></div>' +
    '<div class="modal-footer"><div></div><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>');
}
