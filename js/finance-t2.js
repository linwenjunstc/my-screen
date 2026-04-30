/* ════════════════════════════════════════════════
 * finance-t2.js  —  T2 对上收款台账
 * ════════════════════════════════════════════════ */

function renderReceipts(){
  const rows=finState.receipts;
  const tot={contract:0,output:0,prev:0,plan:0,cum:0};
  rows.forEach(r=>{
    tot.contract+=+r.contract_amount||0; tot.output+=+r.confirmed_output||0;
    tot.prev+=+r.prev_received||0; tot.plan+=+r.plan_amount||0;
    tot.cum+=+r.cumulative_received||0;
  });
  const tbody=rows.length?rows.map((r,i)=>`
    <tr class="clickable" onclick="openEditReceiptModal('${r.id}')">
      <td style="color:var(--text3);width:32px;text-align:center">${i+1}</td>
      <td>
        ${r.contract_name||'—'}
        ${r.upstream_contract_id?'<span class="linked-badge">已关联合同</span>':''}
      </td>
      <td>${r.customer_name||'—'}</td>
      <td class="num">${fmt(r.contract_amount)} <span class="unit">元</span></td>
      <td class="num">${fmt(r.confirmed_output)} <span class="unit">元</span></td>
      <td class="num">${fmt(r.prev_received)} <span class="unit">元</span></td>
      <td class="num">${fmt(r.plan_amount)} <span class="unit">元</span></td>
      <td class="num" style="font-weight:500">${fmt(r.cumulative_received)} <span class="unit">元</span></td>
      <td>${ratioCell(r.cumulative_received,r.contract_amount)}</td>
      <td style="font-size:12px;color:${r.next_expected_date&&new Date(r.next_expected_date)<new Date()?'var(--red)':'var(--text3)'}">
        ${r.next_expected_date||'—'}
      </td>
      <td style="font-size:12px;color:var(--text3)">${r.remark||'—'}</td>
    </tr>`).join('')
    :`<tr><td colspan="11"><div class="empty"><i data-lucide="download" class="empty-icon"></i>暂无数据，点击右上角新增</div></td></tr>`;

  document.getElementById('main-content').innerHTML=`
  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">对上收款台账</div>
      <div style="margin-left:auto;font-size:11px;color:var(--text3)">点击行编辑</div>
    </div>
    <div class="table-scroll">
    <table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th style="min-width:160px">项目/合同名称</th>
        <th style="min-width:110px">客户名称</th>
        <th class="num">合同金额（元）</th>
        <th class="num">确认产值（元）</th>
        <th class="num">截至上期累计已回款（元）</th>
        <th class="num">本月计划回款（元）</th>
        <th class="num">本期累计已回款（元）</th>
        <th style="min-width:120px">收款比例</th>
        <th style="min-width:110px">预计下次收款</th>
        <th style="min-width:80px">备注</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      ${rows.length?`<tfoot><tr class="tfoot-row">
        <td colspan="3">合计</td>
        <td>${fmt(tot.contract)} 元</td>
        <td>${fmt(tot.output)} 元</td>
        <td>${fmt(tot.prev)} 元</td>
        <td>${fmt(tot.plan)} 元</td>
        <td>${fmt(tot.cum)} 元</td>
        <td colspan="3"></td>
      </tr></tfoot>`:''}
    </table>
    </div>
  </div>`;
}

function openAddReceiptModal(){openEditReceiptModal(null);}
function openEditReceiptModal(id){
  const r=id?finState.receipts.find(x=>x.id===id):null;
  const isEdit=!!r;
  const canE=!isEdit||canEdit(r);
  const cuOpts=finState.customers.map(c=>
    `<option value="${c.id}" ${r&&r.customer_id===c.id?'selected':''}>${c.name}</option>`
  ).join('');
  const upOpts=finState.contractsUp.map(c=>
    `<option value="${c.id}" ${r&&r.upstream_contract_id===c.id?'selected':''}>${c.name}（${c.customer_name||''}）</option>`
  ).join('');

  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isEdit?'编辑收款记录':'新增收款记录'}</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    <div class="form-divider">关联合同 / 客户</div>
    <div class="form-group">
      <label class="form-label">选择对上合同（可选，自动带入合同名称和金额）</label>
      <select class="form-select" id="r-cup" onchange="onReceiptContractChange()" ${!canE?'disabled':''}>
        <option value="">— 不关联，手动填写 —</option>${upOpts}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">客户名称</label>
        <select class="form-select" id="r-cust" ${!canE?'disabled':''}>
          <option value="">— 从客户库选择 —</option>${cuOpts}
        </select>
        <input class="form-input" id="r-cust-txt" placeholder="或手动填写" value="${r?r.customer_name||'':''}" style="margin-top:6px" ${!canE?'disabled':''}>
      </div>
      <div class="form-group">
        <label class="form-label">项目/合同名称 *</label>
        <input class="form-input" id="r-cname" value="${r?r.contract_name||'':''}" placeholder="合同名称" ${!canE?'disabled':''}>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">合同总额（元）</label><input class="form-input" id="r-total" type="number" step="0.01" value="${r?r.contract_amount||0:0}" ${!canE?'disabled':''}></div>
      <div class="form-group"><label class="form-label">确认产值（元）</label><input class="form-input" id="r-output" type="number" step="0.01" value="${r?r.confirmed_output||0:0}" ${!canE?'disabled':''}></div>
    </div>
    <div class="form-divider">收款数据（单位：元）</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">截至上期累计已回款</label><input class="form-input" id="r-prev" type="number" step="0.01" value="${r?r.prev_received||0:0}" ${!canE?'disabled':''}></div>
      <div class="form-group"><label class="form-label">本月计划回款</label><input class="form-input" id="r-plan" type="number" step="0.01" value="${r?r.plan_amount||0:0}" ${!canE?'disabled':''}></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">本期累计已回款</label><input class="form-input" id="r-cum" type="number" step="0.01" value="${r?r.cumulative_received||0:0}" ${!canE?'disabled':''}></div>
      <div class="form-group"><label class="form-label">预计下次收款日期</label><input class="form-input" id="r-date" type="date" value="${r?r.next_expected_date||'':''}" ${!canE?'disabled':''}></div>
    </div>
    <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="r-remark" value="${r?r.remark||'':''}" ${!canE?'disabled':''}></div>
  </div>
  <div class="modal-footer">
    ${isEdit&&canE?`<button class="btn btn-danger btn-sm" onclick="deleteRow('receipt','${r.id}')">删除</button>`:'<div></div>'}
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      ${canE?`<button class="btn btn-primary" onclick="saveReceipt(${isEdit?`'${r.id}'`:'null'},this)">${isEdit?'保存':'创建'}</button>`:''}
    </div>
  </div>`,'modal-lg');

  if(r&&r.customer_id)
    setTimeout(()=>{try{document.getElementById('r-cust').value=r.customer_id;}catch(e){}},50);
}
function onReceiptContractChange(){
  const sel=document.getElementById('r-cup');
  if(!sel.value)return;
  const c=finState.contractsUp.find(x=>x.id===sel.value);
  if(!c)return;
  document.getElementById('r-cname').value=c.name;
  document.getElementById('r-total').value=c.amount||0;
  if(c.customer_id)document.getElementById('r-cust').value=c.customer_id;
  if(c.customer_name)document.getElementById('r-cust-txt').value=c.customer_name;
}
async function saveReceipt(id,btn){
  const name=q('r-cname').trim();
  if(!name){document.getElementById('r-cname').style.borderColor='var(--red)';return;}
  setLoading(btn,true);
  const custId=document.getElementById('r-cust').value;
  const custName=custId?(finState.customers.find(c=>c.id===custId)||{}).name||q('r-cust-txt'):q('r-cust-txt');
  const data={
    year_month:currentMonth, contract_name:name,
    customer_id:custId||null, customer_name:custName,
    upstream_contract_id:document.getElementById('r-cup').value||null,
    contract_amount:+q('r-total')||0, confirmed_output:+q('r-output')||0,
    prev_received:+q('r-prev')||0, plan_amount:+q('r-plan')||0,
    cumulative_received:+q('r-cum')||0, next_expected_date:q('r-date')||null,
    remark:q('r-remark'), creator_id:currentUser.id, creator_name:currentUser.name
  };
  if(id){
    await sb.from('receipt_records').update({...data,updated_at:new Date().toISOString()}).eq('id',id);
    const i=finState.receipts.findIndex(x=>x.id===id);
    if(i>=0)finState.receipts[i]={...finState.receipts[i],...data};
  } else {
    const row={id:'rr'+uid(),...data,created_at:new Date().toISOString()};
    await sb.from('receipt_records').insert(row);
    finState.receipts.push(row);
  }
  setLoading(btn,false);closeModal();finRender();toast(`✓ ${id?'已更新':'已添加'}`);
  finLogAction(id?'更新收款记录':'新增收款记录', `${id?'更新':'新增'}收款「${name}」${data.plan_amount?'，本月计划 '+fmt(data.plan_amount)+' 元':''}`);
}
