/* ════════════════════════════════════════════════
 * finance-base.js  —  资金看板 / 合同库 / 客户库 / 供应商库 / deleteRow / logAction / modal utils
 * ════════════════════════════════════════════════ */

function renderDashboard(){
  const c=computeTotals();
  const actRec=state.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const actPay=state.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const recRatio=c.planRec?((actRec/c.planRec)*100).toFixed(1):0;
  const payRatio=c.planPay?((actPay/c.planPay)*100).toFixed(1):0;
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
function renderContracts(){
  const tab=window._contractTab||'up';
  const isUp=tab==='up';
  const rows=isUp?state.contractsUp:state.contractsDown;
  const tbody=rows.length?rows.map((r,i)=>{
    if(isUp){
      return `<tr class="clickable" onclick="openEditContractModal('up','${r.id}')">
        <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
        <td>${r.name}</td>
        <td>${r.customer_name||'—'}</td>
        <td class="num">${fmt(r.amount)} <span class="unit">元</span></td>
        <td>${r.sign_date||'—'}</td>
        <td><span class="tag ${r.status==='active'?'tag-active':'tag-settled'}">${r.status==='active'?'执行中':'已结算'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
      </tr>`;
    } else {
      const linked=r.upstream_contract_id?state.contractsUp.find(x=>x.id===r.upstream_contract_id):null;
      return `<tr class="clickable" onclick="openEditContractModal('down','${r.id}')">
        <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
        <td>${r.name}</td>
        <td>${r.supplier_name||'—'}</td>
        <td class="num">${fmt(r.amount)} <span class="unit">元</span></td>
        <td>${linked?`<span class="linked-badge">${linked.name}</span>`:'—'}</td>
        <td><span class="tag ${r.status==='active'?'tag-active':'tag-settled'}">${r.status==='active'?'执行中':'已结算'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
      </tr>`;
    }
  }).join(''):`<tr><td colspan="7"><div class="empty"><div class="empty-icon">📄</div>暂无合同，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
  <div style="display:flex;gap:6px;margin-bottom:12px">
    <button class="btn btn-sm ${isUp?'btn-primary':'btn-ghost'}" onclick="window._contractTab='up';renderContracts()">对上合同（${state.contractsUp.length}）</button>
    <button class="btn btn-sm ${!isUp?'btn-primary':'btn-ghost'}" onclick="window._contractTab='down';renderContracts()">对下合同（${state.contractsDown.length}）</button>
  </div>
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">${isUp?'对上合同库':'对下合同库'}</div>
      <div style="margin-left:auto;font-size:11px;color:var(--text3)">点击行编辑</div>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="min-width:160px">合同名称</th>
        <th style="min-width:110px">${isUp?'客户名称':'供应商名称'}</th>
        <th class="num">合同金额（元）</th>
        <th style="min-width:120px">${isUp?'签约日期':'关联对上合同'}</th>
        <th>状态</th>
        <th style="min-width:80px">备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
  </div>`;
}

function openAddContractModal(){openEditContractModal(window._contractTab||'up',null);}
function openEditContractModal(dir,id){
  const isUp=dir==='up';
  const arr=isUp?state.contractsUp:state.contractsDown;
  const r=id?arr.find(x=>x.id===id):null;
  const isEdit=!!r;
  const cuOpts=state.customers.map(c=>`<option value="${c.id}" ${r&&r.customer_id===c.id?'selected':''}>${c.name}</option>`).join('');
  const suOpts=state.suppliers.map(s=>`<option value="${s.id}" ${r&&r.supplier_id===s.id?'selected':''}>${s.name}</option>`).join('');
  const upOpts=state.contractsUp.map(c=>`<option value="${c.id}" ${r&&r.upstream_contract_id===c.id?'selected':''}>${c.name}</option>`).join('');

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
    </div>`:
    `<div class="form-row">
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
    </div>`}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">合同金额（元）</label>
        <input class="form-input" id="ct-amount" type="number" step="0.01" value="${r?r.amount||0:0}">
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
    ${isEdit?`<button class="btn btn-danger btn-sm" onclick="deleteRow('${isUp?'contracts_upstream':'contracts_downstream'}','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveContract('${dir}',${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>
    </div>
  </div>`);
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
    data.customer_id=cuId||null;
    data.customer_name=cuId?(state.customers.find(c=>c.id===cuId)||{}).name||q('ct-cu-txt'):q('ct-cu-txt');
    data.sign_date=q('ct-date')||null;
  } else {
    const suId=document.getElementById('ct-su').value;
    data.supplier_id=suId||null;
    data.supplier_name=suId?(state.suppliers.find(s=>s.id===suId)||{}).name||q('ct-su-txt'):q('ct-su-txt');
    data.upstream_contract_id=document.getElementById('ct-up').value||null;
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

//  客户库 
function renderCustomers(){
  const rows=state.customers;
  const tbody=rows.length?rows.map((r,i)=>`
    <tr class="clickable" onclick="openEditCustomerModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td style="font-weight:500">${r.name}</td>
      <td style="color:var(--text2)">${r.short_name||'—'}</td>
      <td>${r.contact||'—'}</td>
      <td style="font-family:var(--mono);font-size:12px">${r.phone||'—'}</td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
    </tr>`).join('')
    :`<tr><td colspan="6"><div class="empty"><div class="empty-icon">👤</div>暂无客户，点击右上角新增</div></td></tr>`;
  document.getElementById('main-content').innerHTML=`
  <div class="table-wrap">
    <div class="table-toolbar"><div class="table-title">客户库</div><div style="margin-left:auto;font-size:11px;color:var(--text3)">点击行编辑</div></div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th style="width:32px">#</th><th style="min-width:160px">客户名称</th>
        <th style="min-width:100px">简称</th><th style="min-width:100px">联系人</th>
        <th style="min-width:120px">联系电话</th><th>备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
  </div>`;
}
function openAddCustomerModal(){openEditCustomerModal(null);}
function openEditCustomerModal(id){
  const r=id?state.customers.find(x=>x.id===id):null;
  const isEdit=!!r;
  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑客户':'新增客户'}</div>
    <button class="modal-close" onclick="closeModal()">×</button>
  </div>
  <div class="modal-body">
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
