/* ════════════════════════════════════════════════
 * finance-t3.js  —  T3 对下付款计划
 * ════════════════════════════════════════════════ */

// ── 对下付款计划 T3 ───────────────────────────────────────────────────────────
function getActualPaidForPayment(pay){
  if(!pay.downstream_contract_id) return +pay.actual_paid||0;
  return finState.actualPayments
    .filter(a=>a.downstream_contract_id===pay.downstream_contract_id)
    .reduce((s,a)=>s+(+a.amount||0),0);
}
function renderPayments(){
  const rows=finState.payments;
  const tot={contract:0,plan_cash:0,plan_supply:0,plan_sub:0,actual:0,cum:0};
  rows.forEach(r=>{
    const act=getActualPaidForPayment(r);
    tot.contract+=+r.contract_amount||0;
    tot.plan_cash+=+r.plan_cash||0;
    tot.plan_supply+=+r.plan_supply_chain||0;
    tot.plan_sub+=(+r.plan_cash||0)+(+r.plan_supply_chain||0);
    tot.actual+=act;
    tot.cum+=+r.cumulative_paid||0;
  });
  const tbody=rows.length?rows.map((r,i)=>{
    const planSub=(+r.plan_cash||0)+(+r.plan_supply_chain||0);
    const act=getActualPaidForPayment(r);
    const prevRec=getLinkedPrevReceived(r);
    return `<tr class="clickable" onclick="openEditPaymentModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td>
        ${r.contract_name||'—'}
        ${r.downstream_contract_id?'<span class="linked-badge">已关联合同</span>':''}
      </td>
      <td>${r.supplier_name||'—'}</td>
      <td class="num">${fmt(r.contract_amount)} <span class="unit">元</span></td>
      <td class="num" style="color:var(--text3);font-style:italic">
        ${prevRec!==null?fmt(prevRec)+' <span class="unit">元</span>':'<span style="color:var(--text3)">—</span>'}
      </td>
      <td class="num">${fmt(r.plan_cash)} <span class="unit">元</span></td>
      <td class="num">${fmt(r.plan_supply_chain)} <span class="unit">元</span></td>
      <td class="num" style="font-weight:500">${fmt(planSub)} <span class="unit">元</span></td>
      <td class="num" style="color:var(--blue)">${fmt(act)} <span class="unit">元</span></td>
      <td>${ratioCell(act,planSub)}</td>
      <td class="num">${fmt(r.cumulative_paid)} <span class="unit">元</span></td>
      <td>${ratioCell(r.cumulative_paid,r.contract_amount)}</td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
      <td style="text-align:center">
        <button class="quick-entry-btn"
          onclick="event.stopPropagation();openQuickPaymentEntry('${r.id}')"
          title="快速录入本月实际支付">+ 录入支付</button>
      </td>
    </tr>`;
  }).join('')
  :`<tr><td colspan="14"><div class="empty"><i data-lucide="send" class="empty-icon"></i>暂无数据，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">对下付款计划</div>
      <div style="margin-left:auto;font-size:11px;color:var(--text3)">点击行编辑 · 本月实际支付自动汇入表六</div>
    </div>
    <div class="table-scroll">
    <table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="min-width:160px">项目/合同名称</th>
        <th style="min-width:110px">供应商</th>
        <th class="num">合同金额（元）</th>
        <th class="num" style="min-width:120px">截至上期累计已收款（元）</th>
        <th class="num">本月计划现金（元）</th>
        <th class="num">本月计划供应链（元）</th>
        <th class="num">本月小计（元）</th>
        <th class="num">本月实际支付（元）</th>
        <th style="min-width:120px">本期支付比例</th>
        <th class="num">本期累计已支付（元）</th>
        <th style="min-width:120px">累计支付比例</th>
        <th style="min-width:80px">备注</th>
        <th style="min-width:90px;text-align:center">快捷录入</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      ${rows.length?`<tfoot><tr class="tfoot-row">
        <td colspan="3">合计</td>
        <td>${fmt(tot.contract)} 元</td>
        <td></td>
        <td>${fmt(tot.plan_cash)} 元</td>
        <td>${fmt(tot.plan_supply)} 元</td>
        <td>${fmt(tot.plan_sub)} 元</td>
        <td>${fmt(tot.actual)} 元</td>
        <td></td>
        <td>${fmt(tot.cum)} 元</td>
        <td colspan="3"></td>
      </tr></tfoot>`:''}
    </table>
    </div>
  </div>`;
}

function openAddPaymentModal(){openEditPaymentModal(null);}
function openEditPaymentModal(id){
  const r=id?finState.payments.find(x=>x.id===id):null;
  const isEdit=!!r;
  const canE=!isEdit||canEdit(r);
  const suOpts=finState.suppliers.map(s=>
    `<option value="${s.id}" ${r&&r.supplier_id===s.id?'selected':''}>${s.name}</option>`
  ).join('');
  const dnOpts=finState.contractsDown.map(c=>
    `<option value="${c.id}" ${r&&r.downstream_contract_id===c.id?'selected':''}>${c.name}（${c.supplier_name||''}）</option>`
  ).join('');
  // 截至上期累计已收款 from linked upstream
  const prevRec=r?getLinkedPrevReceived(r):null;
  const actPaid=r?getActualPaidForPayment(r):0;
  const planSub=r?((+r.plan_cash||0)+(+r.plan_supply_chain||0)):0;

  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑付款明细':'新增付款明细'}</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    <div class="form-divider">关联合同 / 供应商</div>
    <div class="form-group">
      <label class="form-label">选择对下合同（可选，自动带入合同名称、金额和供应商）</label>
      <select class="form-select" id="p-cdn" onchange="onPaymentContractChange()" ${!canE?'disabled':''}>
        <option value="">— 不关联，手动填写 —</option>${dnOpts}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">供应商</label>
        <select class="form-select" id="p-sup" ${!canE?'disabled':''}>
          <option value="">— 从供应商库选择 —</option>${suOpts}
        </select>
        <input class="form-input" id="p-sup-txt" placeholder="或手动填写" value="${r?r.supplier_name||'':''}'" style="margin-top:6px" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">项目/合同名称 *</label>
        <input class="form-input" id="p-cname" value="${r?r.contract_name||'':''}" placeholder="合同名称" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">合同金额（元）</label>
        <input class="form-input" id="p-total" type="number" step="0.01" value="${r?r.contract_amount||0:0}" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">截至上期累计已收款（元）</label>
        <div class="readonly-val" id="p-prev-rec">${prevRec!==null?fmt(prevRec)+' 元':'— 关联对上合同后自动带入'}</div>
        <div class="form-hint">自动取关联对上合同的「累计已回款」（只读）</div>
      </div>
    </div>
    <div class="form-divider">本月支付计划（单位：元）</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">本月计划支付（现金）</label>
        <input class="form-input" id="p-cash" type="number" step="0.01" value="${r?r.plan_cash||0:0}" onchange="calcPaymentRatio()" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">本月计划支付（供应链）</label>
        <input class="form-input" id="p-supply" type="number" step="0.01" value="${r?r.plan_supply_chain||0:0}" onchange="calcPaymentRatio()" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">本月小计（自动）</label>
        <div class="readonly-val" id="p-plan-sub">${fmt(planSub)} 元</div>
      </div>
      <div class="form-group">
        <label class="form-label">本月实际支付（元）</label>
        <div class="readonly-val" id="p-actual">${fmt(actPaid)} 元</div>
        <div class="form-hint">自动汇总表六同合同的实际支付记录（只读）</div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">本期支付比例（自动）</label>
        <div class="readonly-val" id="p-ratio-cur">${planSub?((actPaid/planSub)*100).toFixed(1)+'%':'—'}</div>
        <div class="form-hint">= 本月实际支付 ÷ 本月计划小计</div>
      </div>
      <div class="form-group">
        <label class="form-label">本期累计已支付（元）</label>
        <input class="form-input" id="p-cum" type="number" step="0.01" value="${r?r.cumulative_paid||0:0}" onchange="calcPaymentRatio()" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">累计支付比例（自动）</label>
        <div class="readonly-val" id="p-ratio-cum">${(r&&r.contract_amount&&r.cumulative_paid)?(((+r.cumulative_paid||0)/(+r.contract_amount||1))*100).toFixed(1)+'%':'—'}</div>
        <div class="form-hint">= 本期累计已支付 ÷ 合同金额</div>
      </div>
      <div class="form-group">
        <label class="form-label">备注</label>
        <input class="form-input" id="p-remark" value="${r?r.remark||'':''}" ${!canE?'disabled':''}>
      </div>
    </div>
  </div>
  <div class="modal-footer">
    ${isEdit&&canE?`<button class="btn btn-danger btn-sm" onclick="deleteRow('payment_plans','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      ${canE?`<button class="btn btn-primary" onclick="savePayment(${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>`:''}
    </div>
  </div>`,'modal-lg');

  if(r&&r.supplier_id)
    setTimeout(()=>{try{document.getElementById('p-sup').value=r.supplier_id;}catch(e){}},50);
}
function onPaymentContractChange(){
  const sel=document.getElementById('p-cdn');
  if(!sel.value){
    document.getElementById('p-prev-rec').textContent='— 关联对上合同后自动带入';
    return;
  }
  const c=finState.contractsDown.find(x=>x.id===sel.value);
  if(!c)return;
  document.getElementById('p-cname').value=c.name||'';
  document.getElementById('p-total').value=c.amount||0;
  if(c.supplier_id)document.getElementById('p-sup').value=c.supplier_id;
  if(c.supplier_name)document.getElementById('p-sup-txt').value=c.supplier_name;
  // 联动：找关联对上合同的 prev_received
  if(c.upstream_contract_id){
    const upRec=finState.receipts.find(r2=>r2.upstream_contract_id===c.upstream_contract_id);
    if(upRec)document.getElementById('p-prev-rec').textContent=fmt(upRec.prev_received||0)+' 元（来自对上合同）';
    else document.getElementById('p-prev-rec').textContent='— 本月未找到对应收款记录';
  }
  calcPaymentRatio();
}
function calcPaymentRatio(){
  const cash=+document.getElementById('p-cash')?.value||0;
  const supply=+document.getElementById('p-supply')?.value||0;
  const cum=+document.getElementById('p-cum')?.value||0;
  const total=+document.getElementById('p-total')?.value||0;
  const sub=cash+supply;
  const actEl=document.getElementById('p-actual');
  const actPaid=actEl?parseFloat(actEl.textContent)||0:0;
  const subEl=document.getElementById('p-plan-sub');
  if(subEl)subEl.textContent=fmt(sub)+' 元';
  const rcEl=document.getElementById('p-ratio-cur');
  if(rcEl)rcEl.textContent=sub?((actPaid/sub)*100).toFixed(1)+'%':'—';
  const rcumEl=document.getElementById('p-ratio-cum');
  if(rcumEl)rcumEl.textContent=total&&cum?((cum/total)*100).toFixed(1)+'%':'—';
}
async function savePayment(id,btn){
  const name=document.getElementById('p-cname').value.trim();
  if(!name){document.getElementById('p-cname').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const supId=document.getElementById('p-sup').value;
  const supName=supId?(finState.suppliers.find(s=>s.id===supId)||{}).name||q('p-sup-txt'):q('p-sup-txt');
  const data={
    year_month:currentMonth, contract_name:name,
    supplier_id:supId||null, supplier_name:supName,
    downstream_contract_id:document.getElementById('p-cdn').value||null,
    contract_amount:+q('p-total')||0,
    plan_cash:+q('p-cash')||0, plan_supply_chain:+q('p-supply')||0,
    cumulative_paid:+q('p-cum')||0,
    remark:q('p-remark'),
    creator_id:currentUser.id, creator_name:currentUser.name
  };
  if(id){
    await sb.from('payment_plans').update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=finState.payments.findIndex(x=>x.id===id);
    if(i>=0)finState.payments[i]={...finState.payments[i],...data};
  } else {
    const row={id:'pp'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('payment_plans').insert(row);
    finState.payments.push(row);
  }
  setLoading(btn,false);closeModal();finRender();toast(`✓ ${id?'已更新':'已添加'}`);
  finLogAction(id?'更新付款明细':'新增付款明细', `${id?'更新':'新增'}付款「${name}」`);
}

window.openQuickPaymentEntry = function(paymentPlanId) {
  var pay = finState.payments.find(function(p) { return p.id === paymentPlanId; });
  if (!pay) return;
  var today = new Date();
  var todayStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  var planTotal = (+pay.plan_cash || 0) + (+pay.plan_supply_chain || 0);

  openModal(modalHeader('录入实际支付') +
    '<div class="modal-body">' +
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--text2)">' +
        '<div style="font-weight:600;color:var(--text);margin-bottom:4px">' + escHtml(pay.contract_name || '—') + '</div>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
          '<span>供应商：' + escHtml(pay.supplier_name || '—') + '</span>' +
          '<span>本月计划：' + fmt(planTotal) + ' 元</span>' +
        '</div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">付款方式</label>' +
        '<div style="display:flex;gap:12px">' +
          '<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="radio" name="qp-type" value="cash" checked> 现金</label>' +
          '<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer"><input type="radio" name="qp-type" value="supply"> 供应链</label>' +
        '</div></div>' +
      '<div class="form-group"><label class="form-label">实际付款日期 <span style="color:var(--red)">*</span></label>' +
        '<input type="date" class="form-input" id="qp-date" value="' + todayStr + '"></div>' +
      '<div class="form-group"><label class="form-label">实际付款金额（元）<span style="color:var(--red)">*</span></label>' +
        '<input type="number" class="form-input" id="qp-amount" placeholder="请输入金额" min="0" step="0.01"></div>' +
      '<div class="form-group"><label class="form-label">备注</label>' +
        '<input type="text" class="form-input" id="qp-remark" placeholder="可选"></div>' +
    '</div>' +
    '<div class="modal-footer"><div></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn btn-ghost" onclick="closeModal()">取消</button>' +
        '<button class="btn btn-primary" onclick="saveQuickPaymentEntry(\'' + paymentPlanId + '\',this)">确认录入</button>' +
      '</div></div>');
};

window.saveQuickPaymentEntry = async function(paymentPlanId, btn) {
  var pay = finState.payments.find(function(p) { return p.id === paymentPlanId; });
  if (!pay) return;
  var payType = (document.querySelector('input[name="qp-type"]:checked') || {}).value || 'cash';
  var date = document.getElementById('qp-date') && document.getElementById('qp-date').value;
  var amount = parseFloat(document.getElementById('qp-amount') && document.getElementById('qp-amount').value);
  var remark = document.getElementById('qp-remark') ? document.getElementById('qp-remark').value : '';
  if (!date) { toast('请填写付款日期', 'warning'); return; }
  if (!amount || amount <= 0) { toast('请填写有效金额', 'warning'); return; }
  btn.disabled = true; btn.textContent = '保存中...';
  var typeLabel = payType === 'cash' ? '现金' : '供应链';
  try {
    var res = await sb.from('actual_payments').insert({
      id: uid(),
      year_month: currentMonth,
      payment_date: date,
      contract_name: pay.contract_name || '',
      supplier_name: pay.supplier_name || '',
      downstream_contract_id: pay.downstream_contract_id || null,
      amount: amount,
      remark: '[' + typeLabel + ']' + (remark ? ' ' + remark : '')
    });
    if (res.error) throw res.error;
    await finLogAction('新增实际支付', JSON.stringify({ contract: pay.contract_name, amount: amount, date: date, type: typeLabel }));
    toast('实际支付已录入', 'success');
    closeModal();
    await loadAll();
    switchTab('t6');
  } catch(e) {
    toast('录入失败：' + e.message, 'error');
    btn.disabled = false; btn.textContent = '确认录入';
  }
};

//  完成情况 T4 
