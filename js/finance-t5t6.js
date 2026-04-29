/* ════════════════════════════════════════════════
 * finance-t5t6.js  —  T5 实际收款  +  T6 实际支付
 * ════════════════════════════════════════════════ */

function renderT5(){
  const rows=state.actualReceipts;
  const total=rows.reduce((s,r)=>s+(+r.amount||0),0);
  const tbody=rows.length?rows.map((r,i)=>`
    <tr class="clickable" onclick="openEditT5Modal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td>${r.receipt_date||'—'}</td>
      <td>
        ${r.contract_name||'—'}
        ${r.upstream_contract_id?'<span class="linked-badge">已关联合同</span>':''}
      </td>
      <td>${r.customer_name||'—'}</td>
      <td class="num" style="font-weight:500;color:var(--green)">${fmt(r.amount)} <span class="unit">元</span></td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
    </tr>`).join('')
    :`<tr><td colspan="6"><div class="empty"><div class="empty-icon">📋</div>暂无数据，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">实际收款明细（表五）</div>
      <div style="font-size:11px;color:var(--text3);margin-left:auto">月初填上月实际数 · 合计自动汇入完成情况</div>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="min-width:100px">收款日期</th>
        <th style="min-width:160px">合同/项目名称</th>
        <th style="min-width:110px">客户名称</th>
        <th class="num">收款金额（元）</th>
        <th style="min-width:80px">备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      ${rows.length?`<tfoot><tr class="tfoot-row">
        <td colspan="4">合计</td>
        <td>${fmt(total)} 元</td>
        <td></td>
      </tr></tfoot>`:''}
    </table></div>
  </div>`;
}

function openAddT5Modal(){openEditT5Modal(null);}
function openEditT5Modal(id){
  const r=id?state.actualReceipts.find(x=>x.id===id):null;
  const isEdit=!!r;
  const canE=!isEdit||canEdit(r);
  const cuOpts=state.customers.map(c=>`<option value="${c.id}" ${r&&r.customer_name===c.name?'selected':''}>${c.name}</option>`).join('');
  const upOpts=state.contractsUp.map(c=>`<option value="${c.id}" ${r&&r.upstream_contract_id===c.id?'selected':''}>${c.name}（${c.customer_name||''}）</option>`).join('');
  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑收款明细':'新增收款明细'}</div>
    <button class="modal-close" onclick="closeModal()">×</button>
  </div>
  <div class="modal-body">
    <div class="form-group">
      <label class="form-label">关联对上合同（可选）</label>
      <select class="form-select" id="t5-cup" onchange="onT5ContractChange()" ${!canE?'disabled':''}>
        <option value="">— 手动填写 —</option>${upOpts}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">合同/项目名称 *</label>
        <input class="form-input" id="t5-cname" value="${r?r.contract_name||'':''}" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">客户名称</label>
        <select class="form-select" id="t5-cust" ${!canE?'disabled':''}>
          <option value="">— 从客户库选 —</option>${cuOpts}
        </select>
        <input class="form-input" id="t5-cust-txt" placeholder="或手动填写" value="${r?r.customer_name||'':''}" style="margin-top:6px" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">收款日期</label>
        <input class="form-input" id="t5-date" type="date" value="${r?r.receipt_date||'':''}" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">收款金额（元）*</label>
        <input class="form-input" id="t5-amount" type="number" step="0.01" value="${r?r.amount||0:0}" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <input class="form-input" id="t5-remark" value="${r?r.remark||'':''}" ${!canE?'disabled':''}>
    </div>
  </div>
  <div class="modal-footer">
    ${isEdit&&canE?`<button class="btn btn-danger btn-sm" onclick="deleteRow('actual_receipts','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      ${canE?`<button class="btn btn-primary" onclick="saveT5(${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>`:''}
    </div>
  </div>`);
  if(r&&r.upstream_contract_id)
    setTimeout(()=>{try{document.getElementById('t5-cup').value=r.upstream_contract_id;}catch(e){}},50);
}
function onT5ContractChange(){
  const sel=document.getElementById('t5-cup');
  if(!sel.value)return;
  const c=state.contractsUp.find(x=>x.id===sel.value);
  if(!c)return;
  document.getElementById('t5-cname').value=c.name;
  if(c.customer_name)document.getElementById('t5-cust-txt').value=c.customer_name;
}
async function saveT5(id,btn){
  const name=q('t5-cname').trim();
  if(!name){document.getElementById('t5-cname').style.borderColor='var(--red)';return;}
  const amt=+q('t5-amount');
  if(!amt){document.getElementById('t5-amount').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const custSel=document.getElementById('t5-cust').value;
  const custName=custSel?(state.customers.find(c=>c.id===custSel)||{}).name||q('t5-cust-txt'):q('t5-cust-txt');
  const data={
    year_month:currentMonth, contract_name:name,
    customer_name:custName,
    upstream_contract_id:document.getElementById('t5-cup').value||null,
    receipt_date:q('t5-date')||null, amount:amt,
    remark:q('t5-remark'),
    creator_id:currentUser.id, creator_name:currentUser.name
  };
  if(id){
    await sb.from('actual_receipts').update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=state.actualReceipts.findIndex(x=>x.id===id);
    if(i>=0)state.actualReceipts[i]={...state.actualReceipts[i],...data};
  } else {
    const row={id:'ar'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('actual_receipts').insert(row);
    state.actualReceipts.push(row);
  }
  setLoading(btn,false);closeModal();render();toast(`✓ ${id?'已更新':'已添加'}`);
  logAction(id?'更新实际收款':'新增实际收款', `${id?'更新':'新增'}收款「${name}」，金额 ${amt} 元`);
}

//  实际支付明细 T6 
function renderT6(){
  const rows=state.actualPayments;
  const total=rows.reduce((s,r)=>s+(+r.amount||0),0);
  const tbody=rows.length?rows.map((r,i)=>`
    <tr class="clickable" onclick="openEditT6Modal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td>${r.payment_date||'—'}</td>
      <td>
        ${r.contract_name||'—'}
        ${r.downstream_contract_id?'<span class="linked-badge">已关联合同</span>':''}
      </td>
      <td>${r.supplier_name||'—'}</td>
      <td class="num" style="font-weight:500;color:var(--red)">${fmt(r.amount)} <span class="unit">元</span></td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
    </tr>`).join('')
    :`<tr><td colspan="6"><div class="empty"><div class="empty-icon">📋</div>暂无数据，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">实际支付明细（表六）</div>
      <div style="font-size:11px;color:var(--text3);margin-left:auto">月初填上月实际数 · 合计自动汇入完成情况及付款计划</div>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="min-width:100px">支付日期</th>
        <th style="min-width:160px">合同/项目名称</th>
        <th style="min-width:110px">供应商名称</th>
        <th class="num">支付金额（元）</th>
        <th style="min-width:80px">备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      ${rows.length?`<tfoot><tr class="tfoot-row">
        <td colspan="4">合计</td>
        <td>${fmt(total)} 元</td>
        <td></td>
      </tr></tfoot>`:''}
    </table></div>
  </div>`;
}

function openAddT6Modal(){openEditT6Modal(null);}
function openEditT6Modal(id){
  const r=id?state.actualPayments.find(x=>x.id===id):null;
  const isEdit=!!r;
  const canE=!isEdit||canEdit(r);
  const suOpts=state.suppliers.map(s=>`<option value="${s.id}" ${r&&r.supplier_name===s.name?'selected':''}>${s.name}</option>`).join('');
  const dnOpts=state.contractsDown.map(c=>`<option value="${c.id}" ${r&&r.downstream_contract_id===c.id?'selected':''}>${c.name}（${c.supplier_name||''}）</option>`).join('');
  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑支付明细':'新增支付明细'}</div>
    <button class="modal-close" onclick="closeModal()">×</button>
  </div>
  <div class="modal-body">
    <div class="form-group">
      <label class="form-label">关联对下合同（可选，关联后自动汇入对应付款计划行）</label>
      <select class="form-select" id="t6-cdn" onchange="onT6ContractChange()" ${!canE?'disabled':''}>
        <option value="">— 手动填写 —</option>${dnOpts}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">合同/项目名称 *</label>
        <input class="form-input" id="t6-cname" value="${r?r.contract_name||'':''}" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">供应商名称</label>
        <select class="form-select" id="t6-sup" ${!canE?'disabled':''}>
          <option value="">— 从供应商库选 —</option>${suOpts}
        </select>
        <input class="form-input" id="t6-sup-txt" placeholder="或手动填写" value="${r?r.supplier_name||'':''}" style="margin-top:6px" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">支付日期</label>
        <input class="form-input" id="t6-date" type="date" value="${r?r.payment_date||'':''}" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">支付金额（元）*</label>
        <input class="form-input" id="t6-amount" type="number" step="0.01" value="${r?r.amount||0:0}" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <input class="form-input" id="t6-remark" value="${r?r.remark||'':''}" ${!canE?'disabled':''}>
    </div>
  </div>
  <div class="modal-footer">
    ${isEdit&&canE?`<button class="btn btn-danger btn-sm" onclick="deleteRow('actual_payments','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      ${canE?`<button class="btn btn-primary" onclick="saveT6(${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>`:''}
    </div>
  </div>`);
  if(r&&r.downstream_contract_id)
    setTimeout(()=>{try{document.getElementById('t6-cdn').value=r.downstream_contract_id;}catch(e){}},50);
}
function onT6ContractChange(){
  const sel=document.getElementById('t6-cdn');
  if(!sel.value)return;
  const c=state.contractsDown.find(x=>x.id===sel.value);
  if(!c)return;
  document.getElementById('t6-cname').value=c.name;
  if(c.supplier_name)document.getElementById('t6-sup-txt').value=c.supplier_name;
}
async function saveT6(id,btn){
  const name=q('t6-cname').trim();
  if(!name){document.getElementById('t6-cname').style.borderColor='var(--red)';return;}
  const amt=+q('t6-amount');
  if(!amt){document.getElementById('t6-amount').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const supSel=document.getElementById('t6-sup').value;
  const supName=supSel?(state.suppliers.find(s=>s.id===supSel)||{}).name||q('t6-sup-txt'):q('t6-sup-txt');
  const data={
    year_month:currentMonth, contract_name:name,
    supplier_name:supName,
    downstream_contract_id:document.getElementById('t6-cdn').value||null,
    payment_date:q('t6-date')||null, amount:amt,
    remark:q('t6-remark'),
    creator_id:currentUser.id, creator_name:currentUser.name
  };
  if(id){
    await sb.from('actual_payments').update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=state.actualPayments.findIndex(x=>x.id===id);
    if(i>=0)state.actualPayments[i]={...state.actualPayments[i],...data};
  } else {
    const row={id:'ap'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('actual_payments').insert(row);
    state.actualPayments.push(row);
  }
  setLoading(btn,false);closeModal();render();toast(`✓ ${id?'已更新':'已添加'}`);
  logAction(id?'更新实际支付':'新增实际支付', `${id?'更新':'新增'}支付「${name}」，金额 ${amt} 元`);
}

//  资金看板 
