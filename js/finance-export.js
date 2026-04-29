/* ════════════════════════════════════════════════
 * finance-export.js  —  Excel导出 / 系统设置
 * ════════════════════════════════════════════════ */

function exportXlsx(){
  const wb=XLSX.utils.book_new();
  const c=computeTotals();
  const sm=state.summary;

  // Sheet1: 月度资金计划 T1
  const t1Data=[
    ['月度资金计划',`${fmtMon(currentMonth)}`,'',''],
    ['类别','项目','计划金额（元）','说明'],
    ['支出','人工费用',sm.labor_cost||0,''],
    ['支出','项目支出',c.planPay,'对下付款合计'],
    ['支出','部门费用',sm.dept_cost||0,''],
    ['支出','摊销费用',sm.amortization||0,''],
    ['支出','公司锁定',sm.company_lock||0,''],
    ['支出','还本付息',sm.debt_service||0,''],
    ['','支出合计',c.totalExp,''],
    ['收入','项目回款',c.planRec,'对上收款合计'],
    ['收入','上月结余',c.prevBal,'自动结转'],
    ['','收入合计',c.totalInc,''],
    ['','资金溢缺',c.surplus,'收入-支出'],
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t1Data),'月度资金计划');

  // Sheet2: 对上收款台账 T2
  const t2Head=['#','项目/合同名称','客户名称','合同金额','确认产值','截至上期累计已回款','本月计划回款','本期累计已回款','预计下次收款','备注'];
  const t2Data=[t2Head,...state.receipts.map((r,i)=>[i+1,r.contract_name,r.customer_name,r.contract_amount,r.confirmed_output,r.prev_received,r.plan_amount,r.cumulative_received,r.next_expected_date,r.remark])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t2Data),'对上收款台账');

  // Sheet3: 对下付款计划 T3
  const t3Head=['#','项目/合同名称','供应商','合同金额','本月计划现金','本月计划供应链','本月小计','本月实际支付','本期累计已支付','备注'];
  const t3Data=[t3Head,...state.payments.map((r,i)=>{
    const act=getActualPaidForPayment(r);
    return [i+1,r.contract_name,r.supplier_name,r.contract_amount,r.plan_cash,r.plan_supply_chain,(+r.plan_cash||0)+(+r.plan_supply_chain||0),act,r.cumulative_paid,r.remark];
  })];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t3Data),'对下付款计划');

  // Sheet4: 完成情况 T4
  const actRec=state.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const actPay=state.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const t4Data=[
    ['完成情况','计划','实际','差异'],
    ['项目回款',c.planRec,actRec,actRec-c.planRec],
    ['人工费用',sm.labor_cost||0,sm.actual_labor||0,(sm.actual_labor||0)-(sm.labor_cost||0)],
    ['项目支出',c.planPay,actPay,actPay-c.planPay],
    ['部门费用',sm.dept_cost||0,sm.actual_dept||0,(sm.actual_dept||0)-(sm.dept_cost||0)],
    ['摊销费用',sm.amortization||0,sm.actual_amortization||0,(sm.actual_amortization||0)-(sm.amortization||0)],
    ['公司锁定',sm.company_lock||0,sm.actual_company_lock||0,(sm.actual_company_lock||0)-(sm.company_lock||0)],
    ['还本付息',sm.debt_service||0,sm.actual_debt_service||0,(sm.actual_debt_service||0)-(sm.debt_service||0)],
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t4Data),'完成情况');

  // Sheet5: 实际收款明细 T5
  const t5Head=['#','收款日期','合同/项目名称','客户名称','收款金额','备注'];
  const t5Data=[t5Head,...state.actualReceipts.map((r,i)=>[i+1,r.receipt_date,r.contract_name,r.customer_name,r.amount,r.remark])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t5Data),'实际收款明细');

  // Sheet6: 实际支付明细 T6
  const t6Head=['#','支付日期','合同/项目名称','供应商名称','支付金额','备注'];
  const t6Data=[t6Head,...state.actualPayments.map((r,i)=>[i+1,r.payment_date,r.contract_name,r.supplier_name,r.amount,r.remark])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t6Data),'实际支付明细');

  XLSX.writeFile(wb,`资金计划_${currentMonth}.xlsx`);
  toast('✓ 已导出 Excel（6张 Sheet）');
  logAction('导出资金报表', `导出 ${fmtMon(currentMonth)} 资金计划 Excel`);
}
function openSettingsModal(){
  openModal(`<div class="modal-header"><div class="modal-title">系统配置</div><button class="modal-close" onclick="closeModal()">×</button></div>
  <div class="modal-body">
    <div class="form-group"><label class="form-label">公司名称</label><input class="form-input" id="cfg-company" value="${state.config.company_name||''}"></div>
    <div class="form-group"><label class="form-label">事业部名称</label><input class="form-input" id="cfg-dept" value="${state.config.dept_name||''}"></div>
  </div>
  <div class="modal-footer"><div></div><div class="modal-footer-right">
    <button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="saveSettings(this)">保存</button>
  </div></div>`);
}
async function saveSettings(btn){
  setLoading(btn,true);
  const d={id:'default',company_name:q('cfg-company'),dept_name:q('cfg-dept'),updated_at:new Date().toISOString()};
  await sb.from('finance_config').upsert(d);
  state.config=d;document.getElementById('sb-dept-name').textContent=d.dept_name||'资金计划模块';
  setLoading(btn,false);closeModal();toast('✓ 配置已保存');
}
//  操作日志（写入 projectManage 共用的 logs 表）
async function logAction(action, detail) {
  if (!currentUser) return;
  try {
    await sb.from('logs').insert({
      id: uid(), user_id: currentUser.id, user_name: currentUser.name,
      action, detail: detail || '', created_at: new Date().toISOString()
    });
  } catch(e) { /* 日志写入失败不影响主功能 */ }
}
function openModal(html,cls=''){
  const b=document.getElementById('modal-box');
  b.className='modal'+(cls?' '+cls:'');
  b.innerHTML=html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}
function toast(m){
  const el=document.getElementById('toast');
  el.textContent=m;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2500);
}
function setLoading(btn,on){
  if(!btn)return;
  if(on){btn._o=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spinner"></span>处理中...';}
  else{btn.disabled=false;if(btn._o!==undefined)btn.innerHTML=btn._o;}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
window.onload=init;
