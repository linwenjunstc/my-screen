/* ════════════════════════════════════════════════
 * finance-t5t6.js  —  T5 收款偏差分析  +  T6 付款偏差分析
 * 逻辑：自动抓取上月计划数据 vs 实际数据，手动填写差异原因，持久化保存
 * ════════════════════════════════════════════════ */

// ══════════════════════════════════════════════
//  T5 实际收款明细（收款偏差分析）
// ══════════════════════════════════════════════
async function renderT5(){
  const el = document.getElementById('main-content');
  const prevMon = prevMonthOf(currentMonth);

  el.innerHTML = '<div style="color:var(--text3);padding:32px 16px;text-align:center">⏳ 正在加载 ' + fmtMon(prevMon) + ' 收款数据…</div>';

  const prevReceipts = state.prevReceipts || [];
  const prevActuals  = state.prevActualReceipts || [];

  const vRes = await sb.from('receipt_variance').select('*').eq('year_month', prevMon);
  const varMap = {};
  (vRes.data || []).forEach(function(v){ varMap[v.receipt_record_id] = v; });

  if(!prevReceipts.length){
    el.innerHTML = '<div class="table-wrap"><div class="table-toolbar"><div class="table-title">收款偏差分析（表五）</div><div style="margin-left:auto;font-size:11px;color:var(--text3)">分析上月：' + fmtMon(prevMon) + '</div></div><div class="empty"><div class="empty-icon">📋</div><div>' + fmtMon(prevMon) + ' 暂无对上收款计划数据</div><div style="font-size:12px;color:var(--text3);margin-top:6px">请先在「对上收款台账（T2）」中录入 ' + fmtMon(prevMon) + ' 的数据</div></div></div>';
    return;
  }

  function getActualForRec(rec){
    if(rec.upstream_contract_id){
      return prevActuals.filter(function(a){ return a.upstream_contract_id === rec.upstream_contract_id; }).reduce(function(s,a){ return s + (+a.amount||0); }, 0);
    }
    return prevActuals.filter(function(a){ return a.contract_name === rec.contract_name; }).reduce(function(s,a){ return s + (+a.amount||0); }, 0);
  }

  var rows = prevReceipts.map(function(rec){
    var actual   = getActualForRec(rec);
    var plan     = +rec.plan_amount || 0;
    var variance = varMap[rec.id] || {};
    return { rec: rec, actual: actual, plan: plan, variance: variance };
  });

  var planTotal   = rows.reduce(function(s,r){ return s + r.plan; }, 0);
  var actualTotal = rows.reduce(function(s,r){ return s + r.actual; }, 0);
  var totalDevNum = planTotal ? ((actualTotal - planTotal) / planTotal * 100) : null;
  var totalDevStr = totalDevNum !== null ? (totalDevNum >= 0 ? '+' : '') + totalDevNum.toFixed(1) + '%' : '—';
  var totalDevStyle = totalDevNum === null ? '' : totalDevNum >= 0 ? 'color:var(--green);font-weight:600' : 'color:var(--red);font-weight:600';

  var tbody = rows.map(function(r, i){
    var rec = r.rec, actual = r.actual, plan = r.plan, variance = r.variance;
    var dev = plan ? ((actual - plan) / plan * 100) : null;
    var devStr = dev !== null ? (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%' : '—';
    var devStyle = dev === null ? '' : dev >= 0 ? 'color:var(--green);font-weight:600' : 'color:var(--red);font-weight:600';
    var reason = (variance.difference_reason || '').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return '<tr>'
      + '<td style="color:var(--text3);width:28px;text-align:center">' + (i+1) + '</td>'
      + '<td style="min-width:140px;font-weight:500">' + (rec.contract_name||'—') + '</td>'
      + '<td style="min-width:100px">' + (rec.customer_name||'—') + '</td>'
      + '<td class="num">' + fmt(rec.contract_amount) + '</td>'
      + '<td class="num" style="color:var(--amber)">' + fmt(plan) + '</td>'
      + '<td class="num" style="color:var(--green)">' + fmt(actual) + '</td>'
      + '<td class="num" style="' + devStyle + '">' + devStr + '</td>'
      + '<td style="min-width:180px;padding:4px 8px"><input class="form-input" style="height:28px;font-size:12px;padding:0 8px;width:100%" id="t5r-' + rec.id + '" value="' + reason + '" placeholder="填写差异原因…"></td>'
      + '</tr>';
  }).join('');

  el.innerHTML = '<div class="table-wrap">'
    + '<div class="table-toolbar"><div class="table-title">收款偏差分析（表五）</div>'
    + '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">'
    + '<span style="font-size:11px;color:var(--text3)">分析上月：' + fmtMon(prevMon) + ' · 差异原因填完后点保存</span>'
    + '<button class="btn btn-primary btn-sm" onclick="saveT5Variances(this)">💾 保存差异原因</button>'
    + '</div></div>'
    + '<div style="font-size:11px;color:var(--teal);margin:0 0 10px;padding:7px 12px;background:var(--teal-bg);border:1px solid var(--teal-border);border-radius:6px">'
    + 'ℹ 计划数来自 ' + fmtMon(prevMon) + ' 对上收款台账（T2）；实际回款来自 actual_receipts 按合同汇总</div>'
    + '<div class="table-scroll"><table>'
    + '<thead><tr>'
    + '<th style="width:28px">#</th>'
    + '<th style="min-width:140px">合同 / 项目名称</th>'
    + '<th style="min-width:100px">客户名称</th>'
    + '<th class="num">合同金额（元）</th>'
    + '<th class="num" style="color:var(--amber)">上月计划回款（元）</th>'
    + '<th class="num" style="color:var(--green)">实际回款（元）</th>'
    + '<th class="num">回款偏差率</th>'
    + '<th style="min-width:180px">差异原因</th>'
    + '</tr></thead>'
    + '<tbody>' + tbody + '</tbody>'
    + '<tfoot><tr class="tfoot-row">'
    + '<td colspan="3">合计</td><td></td>'
    + '<td>' + fmt(planTotal) + '</td>'
    + '<td>' + fmt(actualTotal) + '</td>'
    + '<td style="' + totalDevStyle + '">' + totalDevStr + '</td>'
    + '<td></td>'
    + '</tr></tfoot>'
    + '</table></div></div>';

  window._t5Rows   = rows;
  window._t5VarMap = varMap;
}

async function saveT5Variances(btn){
  var rows = window._t5Rows || [];
  if(!rows.length){ toast('暂无数据'); return; }
  setLoading(btn, true);
  var prevMon = prevMonthOf(currentMonth);

  var ops = rows.map(function(r){
    var rec      = r.rec;
    var existing = (window._t5VarMap || {})[rec.id];
    var reason   = (document.getElementById('t5r-' + rec.id) || {}).value || '';
    var row = {
      id:                existing ? existing.id : 'rv' + uid(),
      year_month:        prevMon,
      receipt_record_id: rec.id,
      contract_name:     rec.contract_name   || '',
      customer_name:     rec.customer_name   || '',
      contract_amount:   +rec.contract_amount || 0,
      plan_amount:       +rec.plan_amount     || 0,
      actual_amount:     r.actual,
      difference_reason: reason,
      creator_id:        currentUser.id,
      creator_name:      currentUser.name,
      updated_at:        new Date().toISOString()
    };
    if(!existing) row.created_at = new Date().toISOString();
    return sb.from('receipt_variance').upsert(row);
  });

  var results = await Promise.all(ops);
  var errs = results.filter(function(r){ return r.error; });
  setLoading(btn, false);
  if(errs.length){ toast('✗ 保存失败：' + errs[0].error.message); return; }
  toast('✓ 差异原因已保存');
  logAction('保存收款偏差分析', fmtMon(prevMon) + ' 收款偏差分析已保存');
  renderT5();
}


// ══════════════════════════════════════════════
//  T6 实际支付明细（付款偏差分析）
// ══════════════════════════════════════════════
async function renderT6(){
  var el = document.getElementById('main-content');
  var prevMon = prevMonthOf(currentMonth);

  el.innerHTML = '<div style="color:var(--text3);padding:32px 16px;text-align:center">⏳ 正在加载 ' + fmtMon(prevMon) + ' 付款数据…</div>';

  var prevPayments = state.prevPayments || [];

  var vRes = await sb.from('payment_variance').select('*').eq('year_month', prevMon);
  var varMap = {};
  (vRes.data || []).forEach(function(v){ varMap[v.payment_plan_id] = v; });

  if(!prevPayments.length){
    el.innerHTML = '<div class="table-wrap"><div class="table-toolbar"><div class="table-title">付款偏差分析（表六）</div><div style="margin-left:auto;font-size:11px;color:var(--text3)">分析上月：' + fmtMon(prevMon) + '</div></div><div class="empty"><div class="empty-icon">📋</div><div>' + fmtMon(prevMon) + ' 暂无对下付款计划数据</div><div style="font-size:12px;color:var(--text3);margin-top:6px">请先在「对下付款计划（T3）」中录入 ' + fmtMon(prevMon) + ' 的数据</div></div></div>';
    return;
  }

  var rows = prevPayments.map(function(pay){
    return { pay: pay, variance: varMap[pay.id] || {} };
  });

  var planCashTotal  = rows.reduce(function(s,r){ return s + (+r.pay.plan_cash||0); }, 0);
  var planChainTotal = rows.reduce(function(s,r){ return s + (+r.pay.plan_supply_chain||0); }, 0);
  var planTotal      = planCashTotal + planChainTotal;
  var actCashTotal   = rows.reduce(function(s,r){ return s + (+r.variance.actual_cash||0); }, 0);
  var actChainTotal  = rows.reduce(function(s,r){ return s + (+r.variance.actual_supply_chain||0); }, 0);
  var actTotal       = actCashTotal + actChainTotal;
  var totalDevNum    = planTotal ? ((actTotal - planTotal) / planTotal * 100) : null;
  var totalDevStr    = totalDevNum !== null ? (totalDevNum >= 0 ? '+' : '') + totalDevNum.toFixed(1) + '%' : '—';
  var totalDevStyle  = totalDevNum === null ? '' : totalDevNum <= 0 ? 'color:var(--green);font-weight:600' : 'color:var(--red);font-weight:600';

  var tbody = rows.map(function(r, i){
    var pay = r.pay, variance = r.variance;
    var planCash  = +pay.plan_cash || 0;
    var planChain = +pay.plan_supply_chain || 0;
    var planSub   = planCash + planChain;
    var actCash   = +variance.actual_cash || 0;
    var actChain  = +variance.actual_supply_chain || 0;
    var actSub    = actCash + actChain;
    var dev = planSub ? ((actSub - planSub) / planSub * 100) : null;
    var devStr = dev !== null ? (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%' : '—';
    var devStyle = dev === null ? '' : dev <= 0 ? 'color:var(--green);font-weight:600' : 'color:var(--red);font-weight:600';
    var reason = (variance.difference_reason || '').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return '<tr>'
      + '<td style="color:var(--text3);width:28px;text-align:center">' + (i+1) + '</td>'
      + '<td style="min-width:120px;font-weight:500">' + (pay.contract_name||'—') + '</td>'
      + '<td style="min-width:100px">' + (pay.supplier_name||'—') + '</td>'
      + '<td class="num">' + fmt(pay.contract_amount) + '</td>'
      + '<td style="font-size:12px;color:var(--text3);min-width:80px">' + (pay.remark||'—') + '</td>'
      + '<td class="num" style="background:rgba(251,191,36,.06)">' + fmt(planCash) + '</td>'
      + '<td class="num" style="background:rgba(251,191,36,.06)">' + fmt(planChain) + '</td>'
      + '<td class="num" style="background:rgba(251,191,36,.06);font-weight:600">' + fmt(planSub) + '</td>'
      + '<td class="num" style="background:rgba(52,211,153,.06)"><input type="number" step="0.01" min="0" class="form-input" style="height:26px;font-size:12px;padding:0 6px;width:90px;text-align:right;background:transparent;border-color:var(--border2)" id="t6c-' + pay.id + '" value="' + (actCash||'') + '" placeholder="0" oninput="updateT6Row(\'' + pay.id + '\',' + planSub + ')"></td>'
      + '<td class="num" style="background:rgba(52,211,153,.06)"><input type="number" step="0.01" min="0" class="form-input" style="height:26px;font-size:12px;padding:0 6px;width:90px;text-align:right;background:transparent;border-color:var(--border2)" id="t6h-' + pay.id + '" value="' + (actChain||'') + '" placeholder="0" oninput="updateT6Row(\'' + pay.id + '\',' + planSub + ')"></td>'
      + '<td class="num" id="t6s-' + pay.id + '" style="background:rgba(52,211,153,.06);font-weight:600;color:' + (actSub ? 'var(--green)' : 'var(--text3)') + '">' + fmt(actSub) + '</td>'
      + '<td class="num" id="t6d-' + pay.id + '" style="' + devStyle + '">' + devStr + '</td>'
      + '<td style="min-width:160px;padding:4px 8px"><input class="form-input" style="height:28px;font-size:12px;padding:0 8px;width:100%" id="t6r-' + pay.id + '" value="' + reason + '" placeholder="填写差异原因…"></td>'
      + '</tr>';
  }).join('');

  el.innerHTML = '<div class="table-wrap">'
    + '<div class="table-toolbar"><div class="table-title">付款偏差分析（表六）</div>'
    + '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">'
    + '<span style="font-size:11px;color:var(--text3)">分析上月：' + fmtMon(prevMon) + ' · 填写实际金额及差异原因后保存</span>'
    + '<button class="btn btn-primary btn-sm" onclick="saveT6Variances(this)">💾 保存</button>'
    + '</div></div>'
    + '<div style="font-size:11px;color:var(--teal);margin:0 0 10px;padding:7px 12px;background:var(--teal-bg);border:1px solid var(--teal-border);border-radius:6px">'
    + 'ℹ 计划数来自 ' + fmtMon(prevMon) + ' 对下付款计划（T3）；实际支付现金 / 供应链请手动填写</div>'
    + '<div class="table-scroll"><table>'
    + '<colgroup><col style="width:28px"><col style="min-width:120px"><col style="min-width:100px"><col><col style="min-width:80px"><col><col><col><col><col><col><col><col style="min-width:160px"></colgroup>'
    + '<thead>'
    + '<tr>'
    + '<th rowspan="2">#</th>'
    + '<th rowspan="2">合同 / 项目名称</th>'
    + '<th rowspan="2">供应商名称</th>'
    + '<th rowspan="2" class="num">合同金额（元）</th>'
    + '<th rowspan="2">用途</th>'
    + '<th colspan="3" style="text-align:center;background:rgba(251,191,36,.08);border-bottom:1px solid var(--border)">上月计划支付（元）</th>'
    + '<th colspan="3" style="text-align:center;background:rgba(52,211,153,.08);border-bottom:1px solid var(--border)">实际支付（元）</th>'
    + '<th rowspan="2" class="num">偏差率</th>'
    + '<th rowspan="2">差异原因</th>'
    + '</tr>'
    + '<tr>'
    + '<th class="num" style="background:rgba(251,191,36,.06)">现金</th>'
    + '<th class="num" style="background:rgba(251,191,36,.06)">供应链</th>'
    + '<th class="num" style="background:rgba(251,191,36,.06)">小计</th>'
    + '<th class="num" style="background:rgba(52,211,153,.06)">现金</th>'
    + '<th class="num" style="background:rgba(52,211,153,.06)">供应链</th>'
    + '<th class="num" style="background:rgba(52,211,153,.06)">小计</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody>' + tbody + '</tbody>'
    + '<tfoot><tr class="tfoot-row">'
    + '<td colspan="4">合计</td><td></td>'
    + '<td>' + fmt(planCashTotal) + '</td>'
    + '<td>' + fmt(planChainTotal) + '</td>'
    + '<td>' + fmt(planTotal) + '</td>'
    + '<td id="t6-tot-cash">' + fmt(actCashTotal) + '</td>'
    + '<td id="t6-tot-chain">' + fmt(actChainTotal) + '</td>'
    + '<td id="t6-tot-sub">' + fmt(actTotal) + '</td>'
    + '<td id="t6-tot-dev" style="' + totalDevStyle + '">' + totalDevStr + '</td>'
    + '<td></td>'
    + '</tr></tfoot>'
    + '</table></div></div>';

  window._t6Rows      = rows;
  window._t6VarMap    = varMap;
  window._t6PlanTotal = planTotal;
}

function updateT6Row(payId, planSub){
  var cEl = document.getElementById('t6c-' + payId);
  var hEl = document.getElementById('t6h-' + payId);
  if(!cEl || !hEl) return;
  var actCash  = +cEl.value || 0;
  var actChain = +hEl.value || 0;
  var actSub   = actCash + actChain;

  var sEl = document.getElementById('t6s-' + payId);
  if(sEl){ sEl.textContent = fmt(actSub); sEl.style.color = actSub ? 'var(--green)' : 'var(--text3)'; }

  var dev = planSub ? ((actSub - planSub) / planSub * 100) : null;
  var dEl = document.getElementById('t6d-' + payId);
  if(dEl){
    dEl.textContent = dev !== null ? (dev >= 0 ? '+' : '') + dev.toFixed(1) + '%' : '—';
    dEl.style.color = dev === null ? '' : dev <= 0 ? 'var(--green)' : 'var(--red)';
    dEl.style.fontWeight = dev !== null ? '600' : '';
  }

  var rows = window._t6Rows || [];
  var totCash = 0, totChain = 0;
  rows.forEach(function(r){
    totCash  += +((document.getElementById('t6c-' + r.pay.id) || {}).value || r.variance.actual_cash        || 0);
    totChain += +((document.getElementById('t6h-' + r.pay.id) || {}).value || r.variance.actual_supply_chain || 0);
  });
  var totSub = totCash + totChain;
  function set(id, v){ var e = document.getElementById(id); if(e) e.textContent = fmt(v); }
  set('t6-tot-cash', totCash);
  set('t6-tot-chain', totChain);
  set('t6-tot-sub', totSub);

  var planTotal  = window._t6PlanTotal || 0;
  var totDevEl   = document.getElementById('t6-tot-dev');
  if(totDevEl){
    var d = planTotal ? ((totSub - planTotal) / planTotal * 100).toFixed(1) : null;
    totDevEl.textContent  = d !== null ? (parseFloat(d) >= 0 ? '+' : '') + d + '%' : '—';
    totDevEl.style.color  = d === null ? '' : parseFloat(d) <= 0 ? 'var(--green)' : 'var(--red)';
    totDevEl.style.fontWeight = d !== null ? '600' : '';
  }
}

async function saveT6Variances(btn){
  var rows = window._t6Rows || [];
  if(!rows.length){ toast('暂无数据'); return; }
  setLoading(btn, true);
  var prevMon = prevMonthOf(currentMonth);

  var ops = rows.map(function(r){
    var pay      = r.pay;
    var existing = (window._t6VarMap || {})[pay.id];
    var actCash  = +((document.getElementById('t6c-' + pay.id) || {}).value || 0);
    var actChain = +((document.getElementById('t6h-' + pay.id) || {}).value || 0);
    var reason   = (document.getElementById('t6r-' + pay.id) || {}).value || '';
    var row = {
      id:                  existing ? existing.id : 'pv' + uid(),
      year_month:          prevMon,
      payment_plan_id:     pay.id,
      contract_name:       pay.contract_name     || '',
      supplier_name:       pay.supplier_name     || '',
      contract_amount:     +pay.contract_amount   || 0,
      purpose:             pay.remark            || '',
      plan_cash:           +pay.plan_cash          || 0,
      plan_supply_chain:   +pay.plan_supply_chain   || 0,
      actual_cash:         actCash,
      actual_supply_chain: actChain,
      difference_reason:   reason,
      creator_id:          currentUser.id,
      creator_name:        currentUser.name,
      updated_at:          new Date().toISOString()
    };
    if(!existing) row.created_at = new Date().toISOString();
    return sb.from('payment_variance').upsert(row);
  });

  var results = await Promise.all(ops);
  var errs = results.filter(function(r){ return r.error; });
  setLoading(btn, false);
  if(errs.length){ toast('✗ 保存失败：' + errs[0].error.message); return; }
  toast('✓ 已保存');
  logAction('保存付款偏差分析', fmtMon(prevMon) + ' 付款偏差分析已保存');
  renderT6();
}
