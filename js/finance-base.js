/* ════════════════════════════════════════════════
 * finance-base.js  —  资金看板 / 合同库 / 客户库 / 供应商库 / deleteRow / logAction / modal utils
 * ════════════════════════════════════════════════ */

function renderDashboard(){
  const c=computeTotals();
  const actRec=state.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const actPay=state.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const recRatio=c.planRec?((actRec/c.planRec)*100).toFixed(1):0;
  const payRatio=c.planPay?((actPay/c.planPay)*100).toFixed(1):0;
  const rtcf=computeRealTimeCashFlow();   // null = 上月未录入
  const rtcfVal=rtcf===null?'<span style="color:var(--text3)">—</span>'
    :`<span style="color:${rtcf>=0?'var(--green)':'var(--red)'}">${fmt(rtcf)}</span>`;
  const prevMon=prevMonthOf(currentMonth);
  document.getElementById('main-content').innerHTML=`
  <div class="stat-grid">
    <div class="stat-card ${c.surplus>=0?'positive':'warning'}">
      <div class="stat-label">资金溢缺</div>
      <div class="stat-val">${fmt(c.surplus)}</div>
      <div class="stat-sub">计划 · 万元</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">计划收入</div>
      <div class="stat-val">${fmt(c.planRec)}</div>
      <div class="stat-sub">实收 ${fmt(actRec)} · ${recRatio}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">计划支出</div>
      <div class="stat-val">${fmt(c.planPay)}</div>
      <div class="stat-sub">实支 ${fmt(actPay)} · ${payRatio}%</div>
    </div>
    <div class="stat-card ${rtcf===null?'':'rtcf-card'}">
      <div class="stat-label">实时现金流
        <span class="stat-hint" title="上月完成净额 + 当月实收 − 当月实付">ⓘ</span>
      </div>
      <div class="stat-val">${rtcfVal}</div>
      <div class="stat-sub">${rtcf===null?'待录入 '+fmtMon(prevMon)+' 完成情况':'上月净额 '+fmt(computePrevBalance())+' + 当月收付差 '+fmt(actRec-actPay)}</div>
    </div>
  </div>
  <div class="prog-section">
    <div class="prog-title">📥 收款进度（对上）</div>
    ${state.receipts.map(r=>{
      const ratio=r.contract_amount?(+r.cumulative_received||0)/(+r.contract_amount):0;
      const cls=ratio>=1?'ratio-red':ratio>=0.8?'ratio-amber':'ratio-green';
      return `<div class="prog-row">
        <div class="prog-name">${r.contract_name||'—'}</div>
        <div class="prog-meta">${fmt(r.cumulative_received)} / ${fmt(r.contract_amount)} 元</div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${Math.min(ratio*100,100).toFixed(1)}%;background:var(--${cls==='ratio-green'?'green':cls==='ratio-amber'?'amber':'red'})"></div></div>
        <div class="prog-pct ${cls}">${(ratio*100).toFixed(1)}%</div>
      </div>`;
    }).join('')||'<div style="color:var(--text3);font-size:12px;padding:8px 0">暂无收款计划</div>'}
  </div>
  <div class="prog-section">
    <div class="prog-title">📤 付款进度（对下）</div>
    ${state.payments.map(r=>{
      const act=getActualPaidForPayment(r);
      const planSub=(+r.plan_cash||0)+(+r.plan_supply_chain||0);
      const ratio=planSub?act/planSub:0;
      const cls=ratio>=1?'ratio-red':ratio>=0.8?'ratio-amber':'ratio-green';
      return `<div class="prog-row">
        <div class="prog-name">${r.contract_name||'—'}</div>
        <div class="prog-meta">${fmt(act)} / ${fmt(planSub)} 元</div>
        <div class="prog-bar-wrap"><div class="prog-bar" style="width:${Math.min(ratio*100,100).toFixed(1)}%;background:var(--${cls==='ratio-green'?'green':cls==='ratio-amber'?'amber':'red'})"></div></div>
        <div class="prog-pct ${cls}">${planSub?(ratio*100).toFixed(1)+'%':'—'}</div>
      </div>`;
    }).join('')||'<div style="color:var(--text3);font-size:12px;padding:8px 0">暂无付款计划</div>'}
  </div>`;
}

//  合同库 
window._contractTab='up';
// ── 合同库 ──────────────────────────────────────────────────────────────────
window._contractTab  = 'up';
window._contractYear = new Date().getFullYear().toString();

// 计算对上合同的所有营收指标
// 年累计 = actual_receipts 中 upstream_contract_id 匹配的当年收款汇总（自动，只读）
function computeContractRevenue(r, year){
  const taxRate    = +r.tax_rate||0;
  const exclTax    = r.amount / (1 + taxRate);
  const targetProf = exclTax * (+r.target_profit_rate||0);
  const measured   = +r.measured_revenue||0;

  const yearRevs = state.actualReceipts
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

  // 考核周期年份下拉（取已存在年份 + 前后各2年）
  const existYears = [...new Set(state.contractsUp.map(r=>r.assessment_year||'').filter(Boolean))];
  const curY = new Date().getFullYear();
  for(let y=curY-2;y<=curY+2;y++) if(!existYears.includes(String(y))) existYears.push(String(y));
  existYears.sort();
  const yearOpts = existYears.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}年</option>`).join('');

  // 对上合同：按考核周期筛选
  const rawRows = isUp
    ? state.contractsUp.filter(r => !r.assessment_year || r.assessment_year === year)
    : state.contractsDown;

  const tbody = rawRows.length ? rawRows.map((r,i)=>{
    if(isUp){
      const rv = computeContractRevenue(r, year);
      const progCls = rv.progress>=1?'ratio-red':rv.progress>=0.8?'ratio-amber':'ratio-green';
      return `<tr class="clickable" onclick="openEditContractModal('up','${r.id}')">
        <td style="color:var(--text3);width:28px;text-align:center">${i+1}</td>
        <td style="min-width:150px">${r.name}</td>
        <td style="font-size:12px;color:var(--text2);min-width:100px">${r.main_contract_no||'—'}</td>
        <td>${r.customer_name||'—'}</td>
        <td class="num">${fmt(r.amount)}</td>
        <td class="num">${rv.exclTax?fmt(rv.exclTax):'—'}</td>
        <td class="num">${r.target_profit_rate?(+r.target_profit_rate*100).toFixed(1)+'%':'—'}</td>
        <td class="num">${rv.targetProf?fmt(rv.targetProf):'—'}</td>
        <td class="num">${fmt(rv.measured)}</td>
        <td class="num">${fmt(rv.yearCum)}</td>
        <td class="num">${fmt(rv.cumRev)}</td>
        <td class="num ${progCls}">${rv.exclTax?(rv.progress*100).toFixed(1)+'%':'—'}</td>
        <td class="num">${rv.yearProfit?fmt(rv.yearProfit):'—'}</td>
        <td><button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openRevenueModal('${r.id}')">📊 营收</button></td>
        <td onclick="event.stopPropagation()"><select class="status-inline ${r.status==='active'?'tag-active':'tag-settled'}" onchange="updateContractStatus('up','${r.id}',this)"><option value="active" ${r.status!=='settled'?'selected':''}>执行中</option><option value="settled" ${r.status==='settled'?'selected':''}>已结算</option></select></td>
      </tr>`;
    } else {
      const linked = r.upstream_contract_id ? state.contractsUp.find(x=>x.id===r.upstream_contract_id) : null;
      return `<tr class="clickable" onclick="openEditContractModal('down','${r.id}')">
        <td style="color:var(--text3);width:28px;text-align:center">${i+1}</td>
        <td>${r.name}</td>
        <td>${r.supplier_name||'—'}</td>
        <td class="num">${fmt(r.amount)}</td>
        <td>${linked?`<span class="linked-badge">${linked.name}</span>`:'—'}</td>
        <td onclick="event.stopPropagation()"><select class="status-inline ${r.status==='active'?'tag-active':'tag-settled'}" onchange="updateContractStatus('down','${r.id}',this)"><option value="active" ${r.status!=='settled'?'selected':''}>执行中</option><option value="settled" ${r.status==='settled'?'selected':''}>已结算</option></select></td>
        <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
      </tr>`;
    }
  }).join('') : `<tr><td colspan="${isUp?15:7}"><div class="empty"><div class="empty-icon">📄</div>暂无合同，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
  <div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-sm ${isUp?'btn-primary':'btn-ghost'}" onclick="window._contractTab='up';renderContracts()">对上合同（${state.contractsUp.length}）</button>
    <button class="btn btn-sm ${!isUp?'btn-primary':'btn-ghost'}" onclick="window._contractTab='down';renderContracts()">对下合同（${state.contractsDown.length}）</button>
    ${isUp?`<div style="margin-left:12px;display:flex;align-items:center;gap:6px">
      <span style="font-size:12px;color:var(--text3)">考核周期</span>
      <select class="form-select" style="width:90px;height:28px;font-size:12px" onchange="window._contractYear=this.value;renderContracts()">${yearOpts}</select>
    </div>`:''}
  </div>
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
    <div class="table-scroll"><table>
      <thead><tr>
        <th style="width:28px">#</th>
        <th style="min-width:150px">合同名称</th>
        ${isUp?'<th style="min-width:110px">主合同编号</th>':''}
        <th style="min-width:100px">${isUp?'客户名称':'供应商名称'}</th>
        <th class="num">合同金额</th>
        ${isUp?`
        <th class="num">不含税金额</th>
        <th class="num">目标利润率</th>
        <th class="num">反算合同额</th>
        <th class="num">已计量营收</th>
        <th class="num">年累计完成营收</th>
        <th class="num">开累完成营收</th>
        <th class="num">营收完成进度</th>
        <th class="num">年完成毛利</th>
        <th style="width:70px">营收</th>
        `:`
        <th style="min-width:120px">关联对上合同</th>
        <th style="min-width:80px">备注</th>
        `}
        <th>状态</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
  </div>`;
}

function openAddContractModal(){openEditContractModal(window._contractTab||'up',null);}
function openEditContractModal(dir,id){
  const isUp = dir==='up';
  const arr  = isUp?state.contractsUp:state.contractsDown;
  const r    = id?arr.find(x=>x.id===id):null;
  const isEdit = !!r;
  const cuOpts = state.customers.map(c=>`<option value="${c.id}" ${r&&r.customer_id===c.id?'selected':''}>${c.name}</option>`).join('');
  const suOpts = state.suppliers.map(s=>`<option value="${s.id}" ${r&&r.supplier_id===s.id?'selected':''}>${s.name}</option>`).join('');
  const upOpts = state.contractsUp.map(c=>`<option value="${c.id}" ${r&&r.upstream_contract_id===c.id?'selected':''}>${c.name}</option>`).join('');

  // 年份下拉（考核周期）
  const curY = new Date().getFullYear();
  const yearSel = [curY-1,curY,curY+1].map(y=>`<option value="${y}" ${(r?r.assessment_year:String(curY))===String(y)?'selected':''}>${y}年</option>`).join('');

  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑合同':'新增'+(isUp?'对上':'对下')+'合同'}</div>
    <button class="modal-close" onclick="closeModal()">×</button>
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
        <label class="form-label">考核周期（自然年）</label>
        <select class="form-select" id="ct-year">${yearSel}</select>
      </div>
      <div class="form-group">
        <label class="form-label">已计量营收（历史累计）</label>
        <input class="form-input" id="ct-measured" type="number" step="0.01" value="${r?r.measured_revenue||0:0}">
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
      ${isEdit&&isUp?`<button class="btn btn-ghost btn-sm" onclick="closeModal();openRevenueModal('${r.id}')">📊 营收管理</button>`:''}
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
  const c=state.customers.find(x=>x.id===v);
  if(c)document.getElementById('ct-cu-txt').value=c.name;
}
function onContractSuChange(){
  const v=document.getElementById('ct-su').value;
  const s=state.suppliers.find(x=>x.id===v);
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
    data.customer_name = cuId?(state.customers.find(c=>c.id===cuId)||{}).name||q('ct-cu-txt'):q('ct-cu-txt');
    data.sign_date       = q('ct-date')||null;
    data.assessment_year = document.getElementById('ct-year')?.value||null;
    data.tax_rate          = +q('ct-taxrate')||null;
    data.target_profit_rate= +q('ct-profrate')||null;
    data.measured_revenue  = +q('ct-measured')||0;
    data.main_contract_no  = q('ct-mcno')||'';
  } else {
    const suId=document.getElementById('ct-su').value;
    data.supplier_id   = suId||null;
    data.supplier_name = suId?(state.suppliers.find(s=>s.id===suId)||{}).name||q('ct-su-txt'):q('ct-su-txt');
    data.upstream_contract_id = document.getElementById('ct-up').value||null;
  }
  const tbl=isUp?'contracts_upstream':'contracts_downstream';
  const arr=isUp?state.contractsUp:state.contractsDown;
  if(id){
    await sb.from(tbl).update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=arr.findIndex(x=>x.id===id);
    if(i>=0)arr[i]={...arr[i],...data};
  } else {
    const row={id:(isUp?'cu':'cd')+uid(),...data,created_at:new Date().toISOString()};
    await sb.from(tbl).insert(row);
    arr.push(row);
  }
  setLoading(btn,false);closeModal();render();toast(`✓ ${id?'已更新':'已添加'}`);
  logAction(id?'更新'+(isUp?'对上合同':'对下合同'):'新增'+(isUp?'对上合同':'对下合同'), `「${name}」`);
}

// ── 营收管理子弹框 ────────────────────────────────────────────────────────────
function openRevenueModal(contractId){
  const r   = state.contractsUp.find(x=>x.id===contractId);
  if(!r) return;
  const year = window._contractYear || new Date().getFullYear().toString();
  const rv   = computeContractRevenue(r, year);

  const months = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
  const monthRows = months.map(ym=>{
    const recs = state.actualReceipts.filter(m=>m.upstream_contract_id===contractId&&m.year_month===ym);
    const amt  = recs.reduce((s,m)=>s+(+m.amount||0),0);
    return `<tr>
      <td style="padding:7px 12px;color:var(--text2);font-size:12px;width:90px">${ym}</td>
      <td style="padding:7px 12px;text-align:right;font-family:var(--mono);font-size:12px;color:${amt?'var(--green)':'var(--text3)'}">
        ${amt ? fmt(amt)+' 元' : '—'}
      </td>
      <td style="padding:7px 12px;font-size:11px;color:var(--text3)">${recs.length ? recs.length+'条' : ''}</td>
      <td style="padding:7px 12px;font-size:11px;color:var(--text3)">
        ${recs.map(rec=>`${rec.receipt_date||ym} · ${fmt(rec.amount)}元`).join('<br>')||'—'}
      </td>
    </tr>`;
  }).join('');

  const totalActual = state.actualReceipts
    .filter(m=>m.upstream_contract_id===contractId&&(m.year_month||'').startsWith(year+'-'))
    .reduce((s,m)=>s+(+m.amount||0),0);
  const totalCount = state.actualReceipts
    .filter(m=>m.upstream_contract_id===contractId&&(m.year_month||'').startsWith(year+'-')).length;

  openModal(`
  <div class="modal-header">
    <div class="modal-title">📊 收款情况 — ${r.name}</div>
    <button class="modal-close" onclick="closeModal()">×</button>
  </div>
  <div class="modal-body">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;padding:12px;background:var(--surface2);border-radius:6px;font-size:12px">
      <div><div style="color:var(--text3)">不含税金额</div><div style="font-weight:600">${fmt(rv.exclTax)} 元</div></div>
      <div><div style="color:var(--text3)">已计量营收</div><div style="font-weight:600">${fmt(rv.measured)} 元</div></div>
      <div><div style="color:var(--text3)">${year}年实际收款</div><div style="font-weight:600;color:var(--blue)">${fmt(totalActual)} 元</div></div>
      <div><div style="color:var(--text3)">开累完成营收</div><div style="font-weight:600">${fmt(rv.cumRev)} 元</div></div>
      <div><div style="color:var(--text3)">剩余营收</div><div style="font-weight:600;color:${rv.remain<0?'var(--red)':'var(--text)'}">${fmt(rv.remain)} 元</div></div>
      <div><div style="color:var(--text3)">营收完成进度</div><div style="font-weight:600;color:${rv.progress>=1?'var(--red)':rv.progress>=0.8?'var(--amber)':'var(--green)'}">${rv.exclTax?(rv.progress*100).toFixed(1)+'%':'—'}</div></div>
      <div><div style="color:var(--text3)">年完成毛利</div><div style="font-weight:600;color:var(--green)">${fmt(rv.yearProfit)} 元</div></div>
    </div>
    <div style="font-size:11px;color:var(--teal);margin-bottom:12px;padding:7px 10px;background:var(--teal-bg);border:1px solid var(--teal-border);border-radius:6px">
      ℹ 数据自动来源于表五「实际收款明细」中关联本合同的记录，如需录入请前往表五
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:7px 12px;text-align:left;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">月份</th>
        <th style="padding:7px 12px;text-align:right;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">收款金额</th>
        <th style="padding:7px 12px;text-align:left;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">笔数</th>
        <th style="padding:7px 12px;text-align:left;font-size:11px;color:var(--text2);background:var(--surface2);border-bottom:1px solid var(--border)">收款明细</th>
      </tr></thead>
      <tbody>${monthRows}</tbody>
      <tfoot><tr style="background:var(--surface2)">
        <td style="padding:8px 12px;font-weight:600;border-top:2px solid var(--border)">合计</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600;font-family:var(--mono);border-top:2px solid var(--border);color:var(--green)">${fmt(totalActual)} 元</td>
        <td style="padding:8px 12px;border-top:2px solid var(--border);color:var(--text3);font-size:11px">${totalCount} 条</td>
        <td style="border-top:2px solid var(--border)"></td>
      </tr></tfoot>
    </table>
  </div>
  <div class="modal-footer"><div></div>
    <div class="modal-footer-right">
      <button class="btn btn-ghost btn-sm" onclick="closeModal();switchTab('t5')">前往表五录入</button>
      <button class="btn btn-ghost" onclick="closeModal()">关闭</button>
    </div>
  </div>`,'modal-lg');
}


function renderCustomers(){
  const rows=state.customers;
  const tbody=rows.length?rows.map((r,i)=>{
    // 实时从合同库计算三个统计字段
    const allContracts    = state.contractsUp.filter(c=>c.customer_id===r.id);
    const activeContracts = allContracts.filter(c=>c.status==='active');
    const totalAmt        = allContracts.reduce((s,c)=>s+(+c.amount||0),0);
    const activeCount     = activeContracts.length;
    return `<tr class="clickable" onclick="openEditCustomerModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td style="font-weight:500">${r.name}</td>
      <td style="color:var(--text2)">${r.short_name||'—'}</td>
      <td>${r.contact||'—'}</td>
      <td style="font-family:var(--mono);font-size:12px">${r.phone||'—'}</td>
      <td class="num">${allContracts.length||'—'}</td>
      <td class="num">${totalAmt?fmt(totalAmt)+' <span class="unit">元</span>':'—'}</td>
      <td style="text-align:center">
        ${activeCount>0
          ?`<button class="btn btn-ghost btn-xs" style="color:var(--blue)"
              onclick="event.stopPropagation();openCustomerContractsModal('${r.id}','${r.name.replace(/'/g,'\\\'')}')">${activeCount} 个</button>`
          :`<span style="color:var(--text3)">—</span>`}
      </td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
    </tr>`;
  }).join('')
  :`<tr><td colspan="9"><div class="empty"><div class="empty-icon">👤</div>暂无客户，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
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
    <div class="table-scroll"><table>
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
  const actives = state.contractsUp.filter(c=>c.customer_id===customerId&&c.status==='active');
  const rows = actives.map((c,i)=>{
    const rv = computeContractRevenue(c, window._contractYear||new Date().getFullYear().toString());
    return `<tr class="clickable" onclick="closeModal();window._contractTab='up';switchTab('contracts');setTimeout(()=>openEditContractModal('up','${c.id}'),100)">
      <td style="color:var(--text3);width:28px;text-align:center">${i+1}</td>
      <td style="font-weight:500">${c.name}</td>
      <td class="num">${fmt(c.amount)} 元</td>
      <td class="num">${rv.exclTax?fmt(rv.exclTax)+' 元':'—'}</td>
      <td class="num" style="color:${rv.progress>=0.8?'var(--amber)':'var(--green)'}">${rv.exclTax?(rv.progress*100).toFixed(1)+'%':'—'}</td>
      <td>${c.sign_date||'—'}</td>
    </tr>`;
  }).join('');

  openModal(`
  <div class="modal-header">
    <div class="modal-title">执行中合同 — ${customerName}（${actives.length} 个）</div>
    <button class="modal-close" onclick="closeModal()">×</button>
  </div>
  <div class="modal-body" style="padding-top:8px">
    <table>
      <thead><tr>
        <th style="width:28px">#</th>
        <th>合同名称</th>
        <th class="num">合同金额</th>
        <th class="num">不含税金额</th>
        <th class="num">营收完成进度</th>
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
  const r=id?state.customers.find(x=>x.id===id):null;
  const isEdit=!!r;

  // 编辑弹框内也显示统计（只读）
  let statsHtml='';
  if(isEdit){
    const all    = state.contractsUp.filter(c=>c.customer_id===r.id);
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
    <button class="modal-close" onclick="closeModal()">×</button>
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
    const i=state.customers.findIndex(x=>x.id===id);
    if(i>=0)state.customers[i]={...state.customers[i],...data};
  } else {
    const row={id:'cu'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('customers').insert(row);
    state.customers.push(row);
  }
  setLoading(btn,false);closeModal();render();toast(`✓ ${id?'已更新':'已添加'}`);
  logAction(id?'更新客户':'新增客户', `「${name}」`);
}

//  供应商库 
function renderSuppliers(){
  const rows=state.suppliers;
  const tbody=rows.length?rows.map((r,i)=>`
    <tr class="clickable" onclick="openEditSupplierModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td style="font-weight:500">${r.name}</td>
      <td style="color:var(--text2)">${r.short_name||'—'}</td>
      <td>${r.contact||'—'}</td>
      <td style="font-family:var(--mono);font-size:12px">${r.phone||'—'}</td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
    </tr>`).join('')
    :`<tr><td colspan="6"><div class="empty"><div class="empty-icon">🏢</div>暂无供应商，点击右上角新增</div></td></tr>`;
  document.getElementById('main-content').innerHTML=`
  <div class="table-wrap">
    <div class="table-toolbar"><div class="table-title">供应商库</div><div style="margin-left:auto;font-size:11px;color:var(--text3)">点击行编辑</div></div>
    <div class="table-scroll"><table>
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
  const r=id?state.suppliers.find(x=>x.id===id):null;
  const isEdit=!!r;
  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑供应商':'新增供应商'}</div>
    <button class="modal-close" onclick="closeModal()">×</button>
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
    const i=state.suppliers.findIndex(x=>x.id===id);
    if(i>=0)state.suppliers[i]={...state.suppliers[i],...data};
  } else {
    const row={id:'su'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('suppliers').insert(row);
    state.suppliers.push(row);
  }
  setLoading(btn,false);closeModal();render();toast(`✓ ${id?'已更新':'已添加'}`);
  logAction(id?'更新供应商':'新增供应商', `「${name}」`);
}

//  删除通用 
async function deleteRow(table,id){
  if(!confirm('确认删除该条记录？此操作不可撤销。'))return;
  await sb.from(table).delete().eq('id',id);
  // 同步本地 state
  const tblMap={
    payment_plans:'payments', receipt_records:'receipts',
    actual_receipts:'actualReceipts', actual_payments:'actualPayments',
    contracts_upstream:'contractsUp', contracts_downstream:'contractsDown',
    customers:'customers', suppliers:'suppliers'
  };
  const key=tblMap[table];
  if(key&&state[key])state[key]=state[key].filter(x=>x.id!==id);
  closeModal();render();toast('✓ 已删除');
}

//  Excel 导出（第4步完成完整版，此处为预留入口）

// ── 合同状态内联更新 ──────────────────────────────────────────────────────────
async function updateContractStatus(dir, id, sel){
  const status = sel.value;
  const tbl = dir==='up' ? 'contracts_upstream' : 'contracts_downstream';
  const arr = dir==='up' ? state.contractsUp : state.contractsDown;
  // 立即更新样式
  sel.className = `status-inline ${status==='active'?'tag-active':'tag-settled'}`;
  const {error} = await sb.from(tbl)
    .update({status, updated_at: new Date().toISOString()}).eq('id', id);
  if(error){ toast('✗ 状态更新失败'); return; }
  const item = arr.find(x=>x.id===id);
  if(item) item.status = status;
  toast(`✓ 状态已更新为「${status==='active'?'执行中':'已结算'}」`);
  logAction('更新合同状态', `合同 ${id} → ${status}`);
}
