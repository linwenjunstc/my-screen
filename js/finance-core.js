/* ════════════════════════════════════════════════
 * finance-core.js  —  finState / init / auth / loadAll / helpers / tab routing
 * ════════════════════════════════════════════════ */

// postMessage patch removed — PM already has it

const SB_URL='https://rfjrkcclhvuldenpdlye.supabase.co';
const SB_KEY='sb_publishable_a29IWCUpjugzMqx6VGnNhw_bpU9Grpi';
// sb removed — using PM's shared client
let currentTab='t1', currentMonth='';
let finState={
  payments:[], receipts:[], extras:[], actualReceipts:[], actualPayments:[],
  summary:{}, prevSummary:{}, prevPayments:[], prevReceipts:[],
  prevActualReceipts:[], prevActualPayments:[],
  config:{company_name:'',dept_name:''},
  customers:[], suppliers:[], contractsUp:[], contractsDown:[],
  monthlyRevenues:[]    // contract_monthly_revenue 全量
};

//  Auth 
async function initFinance(){
  if (!currentUser) { location.href = 'login.html'; return; }
  initMonthPicker();
  document.getElementById('header-sub').textContent = '';
  await loadAll();
  finInitRealtime();
}
// isAdmin removed — using PM's
function canEdit(row){return isAdmin()||(row&&row.creator_id===currentUser.id);}
// uid removed — using PM's
function q(id){try{return(document.getElementById(id)||{}).value||'';}catch(e){return '';}}

//  Month 
function initMonthPicker(){
  const now=new Date();
  const sel=document.getElementById('month-select');
  sel.innerHTML='';
  for(let i=-6;i<=2;i++){
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    const val=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt=document.createElement('option');
    opt.value=val;
    opt.textContent=`${d.getFullYear()}年${d.getMonth()+1}月`;
    if(i===0)opt.selected=true;
    sel.appendChild(opt);
  }
  currentMonth=sel.value;
}
function onMonthChange(v){currentMonth=v;loadAll();}
function prevMonthOf(ym){
  const[y,m]=ym.split('-').map(Number);
  const d=new Date(y,m-2,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtMon(ym){
  if(!ym)return '';
  const[y,m]=ym.split('-');
  return `${y}年${parseInt(m)}月`;
}

//  Data loading 
async function loadAll(){
  const pm=prevMonthOf(currentMonth);
  const[p,r,e,ar,ap,s,ps,pp,pr,par,pap,cfg,cu,su,cup,cdn,mr]=await Promise.all([
    sb.from('payment_plans').select('*').eq('year_month',currentMonth).order('created_at'),
    sb.from('receipt_records').select('*').eq('year_month',currentMonth).order('created_at'),
    sb.from('extra_expenses').select('*').eq('year_month',currentMonth).order('expense_date'),
    sb.from('actual_receipts').select('*').eq('year_month',currentMonth).order('receipt_date'),
    sb.from('actual_payments').select('*').eq('year_month',currentMonth).order('payment_date'),
    sb.from('finance_summary').select('*').eq('year_month',currentMonth).maybeSingle(),
    sb.from('finance_summary').select('*').eq('year_month',pm).maybeSingle(),
    sb.from('payment_plans').select('*').eq('year_month',pm),
    sb.from('receipt_records').select('*').eq('year_month',pm),
    sb.from('actual_receipts').select('*').eq('year_month',pm),
    sb.from('actual_payments').select('*').eq('year_month',pm),
    sb.from('finance_config').select('*').eq('id','default').maybeSingle(),
    sb.from('customers').select('*').order('name'),
    sb.from('suppliers').select('*').order('name'),
    sb.from('contracts_upstream').select('*').order('created_at'),
    sb.from('contracts_downstream').select('*').order('created_at'),
    sb.from('contract_monthly_revenue').select('*').order('year_month')
  ]);
  finState.payments=p.data||[];       finState.receipts=r.data||[];
  finState.extras=e.data||[];         finState.actualReceipts=ar.data||[];
  finState.actualPayments=ap.data||[];finState.summary=s.data||{};
  finState.prevSummary=ps.data||{};   finState.prevPayments=pp.data||[];
  finState.prevReceipts=pr.data||[];  finState.prevActualReceipts=par.data||[];
  finState.prevActualPayments=pap.data||[];
  finState.config=cfg.data||{company_name:'',dept_name:''};
  finState.customers=cu.data||[];     finState.suppliers=su.data||[];
  finState.contractsUp=cup.data||[];  finState.contractsDown=cdn.data||[];
  finState.monthlyRevenues=mr.data||[];

  // ── 数据权限过滤（三级，基于 creator_id） ──
  if (currentUser && currentUser.role !== 'super_admin') {
    var superAdminIds = state.members.filter(function(m) { return m.role === 'super_admin'; }).map(function(m) { return m.id; });
    function finFilter(records) {
      if (!records || !records.length) return records;
      if (currentUser.role === 'admin') {
        return records.filter(function(r) { return !r.creator_id || !superAdminIds.includes(r.creator_id); });
      } else {
        return records.filter(function(r) { return !r.creator_id || r.creator_id === currentUser.id; });
      }
    }
    finState.payments = finFilter(finState.payments);
    finState.receipts = finFilter(finState.receipts);
    finState.extras = finFilter(finState.extras);
    finState.actualReceipts = finFilter(finState.actualReceipts);
    finState.actualPayments = finFilter(finState.actualPayments);
    finState.prevPayments = finFilter(finState.prevPayments);
    finState.prevReceipts = finFilter(finState.prevReceipts);
    finState.prevActualReceipts = finFilter(finState.prevActualReceipts);
    finState.prevActualPayments = finFilter(finState.prevActualPayments);
    finState.contractsUp = finFilter(finState.contractsUp);
    finState.contractsDown = finFilter(finState.contractsDown);
  }

  if(finState.config.dept_name)
    document.getElementById('sb-dept-name').textContent=finState.config.dept_name;
  const[yr,mn]=currentMonth.split('-');
  document.getElementById('header-sub').textContent=`${yr}年${parseInt(mn)}月`;
  finRender();
}
function finInitRealtime(){
  sb.channel('fin-rt3')
    .on('postgres_changes',{event:'*',schema:'public',table:'payment_plans'},()=>loadAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'receipt_records'},()=>loadAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'extra_expenses'},()=>loadAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'actual_receipts'},()=>loadAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'actual_payments'},()=>loadAll())
    .on('postgres_changes',{event:'*',schema:'public',table:'finance_summary'},()=>loadAll())
    .subscribe();
}

//  Computed 
function getLinkedPrevReceived(pay){
  // 对下付款的「截至上期累计已收款」= 关联对上合同的 prev_received
  if(!pay.downstream_contract_id)return null;
  const cdn=finState.contractsDown.find(c=>c.id===pay.downstream_contract_id);
  if(!cdn||!cdn.upstream_contract_id)return null;
  const recRow=finState.receipts.find(r=>r.upstream_contract_id===cdn.upstream_contract_id);
  return recRow!=null?+(recRow.prev_received||0):null;
}
function computePrevBalance(){
  // 优先用上月表五/表六实际数；无则退到计划数
  const t5=finState.prevActualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const t6=finState.prevActualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const ps=finState.prevSummary;
  if(t5>0||t6>0){
    const nonProj=(+ps.actual_labor||0)+(+ps.actual_dept||0)+(+ps.actual_amortization||0)+(+ps.actual_company_lock||0)+(+ps.actual_debt_service||0);
    return t5-(t6+nonProj);
  }
  const prevPlanPay=finState.prevPayments.reduce((s,r)=>s+(+r.plan_cash||0)+(+r.plan_supply_chain||0),0);
  const prevPlanRec=finState.prevReceipts.reduce((s,r)=>s+(+r.plan_amount||0),0);
  const prevPlanExp=prevPlanPay+(+ps.labor_cost||0)+(+ps.dept_cost||0)+(+ps.amortization||0)+(+ps.company_lock||0)+(+ps.debt_service||0);
  return prevPlanRec-prevPlanExp;
}
// 实时现金流：上月完成净额 + 当月实际收款 - 当月实际支付
// 仅当上月实际数据已录入时有效，否则返回 null（显示—）
function computeRealTimeCashFlow(){
  const prevT5=finState.prevActualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const prevT6=finState.prevActualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  if(prevT5===0&&prevT6===0) return null;  // 上月未录入，显示—
  const ps=finState.prevSummary;
  const prevNonProj=(+ps.actual_labor||0)+(+ps.actual_dept||0)+(+ps.actual_amortization||0)
                   +(+ps.actual_company_lock||0)+(+ps.actual_debt_service||0);
  const prevNet=prevT5-prevT6-prevNonProj;
  const curRec=finState.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const curPay=finState.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  return prevNet+curRec-curPay;
}
function computeTotals(){
  const sm=finState.summary;
  const planPay=finState.payments.reduce((s,r)=>s+(+r.plan_cash||0)+(+r.plan_supply_chain||0),0);
  const planRec=finState.receipts.reduce((s,r)=>s+(+r.plan_amount||0),0);
  const extraTot=finState.extras.reduce((s,r)=>s+(+r.amount||0),0);
  const prevBal=computePrevBalance();
  const totalExp=planPay+(+sm.labor_cost||0)+(+sm.dept_cost||0)+(+sm.amortization||0)+(+sm.company_lock||0)+(+sm.debt_service||0)+extraTot;
  const totalInc=planRec+prevBal;
  const surplus=totalInc-totalExp;
  const funding=(+sm.shareholder_injection||0)+(+sm.shareholder_loan||0)+(+sm.working_capital_loan||0)+(+sm.supply_chain_finance||0);
  return{planPay,planRec,extraTot,prevBal,totalExp,totalInc,surplus,funding};
}

//  Format helpers 
function fmt(n){
  if(n===null||n===undefined||n==='')return '—';
  const v=+n;if(isNaN(v))return '—';
  return v.toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});
}
function pctClass(ratio){return ratio>=1?'ratio-red':ratio>=0.8?'ratio-amber':'ratio-green';}
function ratioCell(paid,total){
  const ratio=total?(+paid||0)/(+total):0;
  const cls=pctClass(ratio);
  const w=Math.min(ratio*100,100).toFixed(1);
  const pctStr=total?((ratio)*100).toFixed(1)+'%':'0%';
  return `<div class="ratio-cell ${cls}"><div class="ratio-bar-wrap"><div class="ratio-bar" style="width:${w}%"></div></div><div class="ratio-text">${pctStr}</div></div>`;
}

//  Tab switching 
const TAB_TITLES={
  t1:'月度资金计划', receipt:'对上收款台账', payment:'对下付款计划',
  t4:'完成情况', t5:'实际收款明细', t6:'实际支付明细',
  dashboard:'资金看板', contracts:'合同库', customers:'客户库', suppliers:'供应商库'
};
const ADD_LABELS={
  receipt:'+ 新增收款记录', payment:'+ 新增付款明细',
  contracts:'+ 新增合同', customers:'+ 新增客户', suppliers:'+ 新增供应商'
};
// Tab → 菜单权限 key 映射
var TAB_PERM_MAP = {
  t1:'fin_t1', receipt:'fin_receipt', payment:'fin_payment',
  t4:'fin_t4', t5:'fin_t5', t6:'fin_t6', dashboard:'fin_dashboard',
  contracts:'base_contracts', customers:'base_customers', suppliers:'base_suppliers'
};

function switchTab(tab){
  // 权限守卫：无权限时拒绝切换
  var permKey = TAB_PERM_MAP[tab];
  var allowed = typeof getEffectiveMenuPerms === 'function' ? getEffectiveMenuPerms() : [];
  if (permKey && !allowed.includes(permKey)) {
    // 切换到第一个有权限的 Tab
    var tabs = ['t1','receipt','payment','t4','t5','t6','dashboard'];
    var found = false;
    for (var i = 0; i < tabs.length; i++) {
      var pk = TAB_PERM_MAP[tabs[i]];
      if (!pk || allowed.includes(pk)) { currentTab = tabs[i]; found = true; break; }
    }
    if (!found) return;
    tab = currentTab;
  }
  currentTab=tab;
  Object.keys(TAB_TITLES).forEach(t=>{
    const el=document.getElementById('tab-'+t);
    if(el)el.classList.toggle('active',t===tab);
  });
  document.getElementById('header-title').textContent=TAB_TITLES[tab]||tab;
  const addBtn=document.getElementById('add-btn');
  if(ADD_LABELS[tab]){addBtn.style.display='';addBtn.textContent=ADD_LABELS[tab];}
  else addBtn.style.display='none';
  // 基础库 Tab 隐藏导出按钮
  const exportBtn=document.getElementById('export-btn');
  if(exportBtn) exportBtn.style.display=['contracts','customers','suppliers'].includes(tab)?'none':'';
  finRender();
}
function finRender(){
  const fn={t1:renderT1,receipt:renderReceipts,payment:renderPayments,
    t4:renderT4,t5:renderT5,t6:renderT6,
    dashboard:renderDashboard,contracts:renderContracts,
    customers:renderCustomers,suppliers:renderSuppliers};
  (fn[currentTab]||renderT1)();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  const mc=document.getElementById('main-content');
  if(mc){mc.classList.remove('view-pane');void mc.offsetWidth;mc.classList.add('view-pane');}
}
function openAddModal(){
  const fn={receipt:openAddReceiptModal,payment:openAddPaymentModal,
    contracts:openAddContractModal,customers:openAddCustomerModal,suppliers:openAddSupplierModal};
  if(fn[currentTab])fn[currentTab]();
}

//  月度资金计划 T1 
