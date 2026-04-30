/* ════════════════════════════════════════════════
 * finance-core.js  —  state / init / auth / loadAll / helpers / tab routing
 * ════════════════════════════════════════════════ */

;(function(){const o=window.postMessage.bind(window);window.postMessage=function(d,t,x){try{o(d,t,x)}catch(e){if(e.name!=='DataCloneError')throw e};};})();

const SB_URL='https://rfjrkcclhvuldenpdlye.supabase.co';
const SB_KEY='sb_publishable_a29IWCUpjugzMqx6VGnNhw_bpU9Grpi';
const sb=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}}});
const SESSION_MAX=8*3600*1000;

let currentUser=null, currentTab='t1', currentMonth='';
let state={
  payments:[], receipts:[], extras:[], actualReceipts:[], actualPayments:[],
  summary:{}, prevSummary:{}, prevPayments:[], prevReceipts:[],
  prevActualReceipts:[], prevActualPayments:[],
  config:{company_name:'',dept_name:''},
  customers:[], suppliers:[], contractsUp:[], contractsDown:[],
  monthlyRevenues:[]    // contract_monthly_revenue 全量
};

//  Auth 
async function init(){
  const saved=localStorage.getItem('pm_session');
  if(!saved){location.href='login.html';return;}
  let s;
  try{s=JSON.parse(saved);}catch(e){location.href='login.html';return;}
  if(!s.id||(s.loginAt&&Date.now()-s.loginAt>SESSION_MAX)){
    localStorage.removeItem('pm_session');location.href='login.html';return;
  }
  currentUser=s;
  document.getElementById('user-label').textContent=s.name;
  initMonthPicker();
  document.getElementById('page-loader').classList.add('fade-out');
  setTimeout(()=>document.getElementById('page-loader').style.display='none',350);
  document.getElementById('main-layout').style.display='flex';
  await loadAll();
  initRealtime();
}
function isAdmin(){return currentUser&&(currentUser.role==='admin'||currentUser.role==='super_admin');}
function canEdit(row){return isAdmin()||(row&&row.creator_id===currentUser.id);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
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
  state.payments=p.data||[];       state.receipts=r.data||[];
  state.extras=e.data||[];         state.actualReceipts=ar.data||[];
  state.actualPayments=ap.data||[];state.summary=s.data||{};
  state.prevSummary=ps.data||{};   state.prevPayments=pp.data||[];
  state.prevReceipts=pr.data||[];  state.prevActualReceipts=par.data||[];
  state.prevActualPayments=pap.data||[];
  state.config=cfg.data||{company_name:'',dept_name:''};
  state.customers=cu.data||[];     state.suppliers=su.data||[];
  state.contractsUp=cup.data||[];  state.contractsDown=cdn.data||[];
  state.monthlyRevenues=mr.data||[];
  if(state.config.dept_name)
    document.getElementById('sb-dept-name').textContent=state.config.dept_name;
  const[yr,mn]=currentMonth.split('-');
  document.getElementById('header-sub').textContent=`${yr}年${parseInt(mn)}月`;
  render();
}
function initRealtime(){
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
  const cdn=state.contractsDown.find(c=>c.id===pay.downstream_contract_id);
  if(!cdn||!cdn.upstream_contract_id)return null;
  const recRow=state.receipts.find(r=>r.upstream_contract_id===cdn.upstream_contract_id);
  return recRow!=null?+(recRow.prev_received||0):null;
}
function computePrevBalance(){
  // 优先用上月表五/表六实际数；无则退到计划数
  const t5=state.prevActualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const t6=state.prevActualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  const ps=state.prevSummary;
  if(t5>0||t6>0){
    const nonProj=(+ps.actual_labor||0)+(+ps.actual_dept||0)+(+ps.actual_amortization||0)+(+ps.actual_company_lock||0)+(+ps.actual_debt_service||0);
    return t5-(t6+nonProj);
  }
  const prevPlanPay=state.prevPayments.reduce((s,r)=>s+(+r.plan_cash||0)+(+r.plan_supply_chain||0),0);
  const prevPlanRec=state.prevReceipts.reduce((s,r)=>s+(+r.plan_amount||0),0);
  const prevPlanExp=prevPlanPay+(+ps.labor_cost||0)+(+ps.dept_cost||0)+(+ps.amortization||0)+(+ps.company_lock||0)+(+ps.debt_service||0);
  return prevPlanRec-prevPlanExp;
}
// 实时现金流：上月完成净额 + 当月实际收款 - 当月实际支付
// 仅当上月实际数据已录入时有效，否则返回 null（显示—）
function computeRealTimeCashFlow(){
  const prevT5=state.prevActualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const prevT6=state.prevActualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  if(prevT5===0&&prevT6===0) return null;  // 上月未录入，显示—
  const ps=state.prevSummary;
  const prevNonProj=(+ps.actual_labor||0)+(+ps.actual_dept||0)+(+ps.actual_amortization||0)
                   +(+ps.actual_company_lock||0)+(+ps.actual_debt_service||0);
  const prevNet=prevT5-prevT6-prevNonProj;
  const curRec=state.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  const curPay=state.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  return prevNet+curRec-curPay;
}
function computeTotals(){
  const sm=state.summary;
  const planPay=state.payments.reduce((s,r)=>s+(+r.plan_cash||0)+(+r.plan_supply_chain||0),0);
  const planRec=state.receipts.reduce((s,r)=>s+(+r.plan_amount||0),0);
  const extraTot=state.extras.reduce((s,r)=>s+(+r.amount||0),0);
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
function switchTab(tab){
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
  render();
}
function render(){
  const fn={t1:renderT1,receipt:renderReceipts,payment:renderPayments,
    t4:renderT4,t5:renderT5,t6:renderT6,
    dashboard:renderDashboard,contracts:renderContracts,
    customers:renderCustomers,suppliers:renderSuppliers};
  (fn[currentTab]||renderT1)();
  // 入场动画
  const mc=document.getElementById('main-content');
  if(mc){mc.classList.remove('view-pane');void mc.offsetWidth;mc.classList.add('view-pane');}
}
function openAddModal(){
  const fn={receipt:openAddReceiptModal,payment:openAddPaymentModal,
    contracts:openAddContractModal,customers:openAddCustomerModal,suppliers:openAddSupplierModal};
  if(fn[currentTab])fn[currentTab]();
}

//  月度资金计划 T1 
