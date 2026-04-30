/* ════════════════════════════════════════════════
 * finance-t1.js  —  T1 月度资金计划
 * ════════════════════════════════════════════════ */

function renderT1(){
  const c=computeTotals();
  const sm=finState.summary;
  const[yr,mn]=currentMonth.split('-');
  const pmLabel=fmtMon(prevMonthOf(currentMonth));

  document.getElementById('main-content').innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div>
      <div style="font-size:14px;font-weight:600">月度资金计划</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">
        ${yr}年${parseInt(mn)}月 &nbsp;·&nbsp;
        ${finState.config.company_name||'—'} &nbsp;·&nbsp;
        ${finState.config.dept_name||'—'} &nbsp;·&nbsp; 单位：万元
      </div>
    </div>
    ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="openT1EditModal()">✎ 编辑固定项</button>`:''}
  </div>

  <div class="sec-card">
    <div class="sec-head">
      <div class="sec-head-title"><span class="sec-badge sb-expense">支出</span>计划支出金额</div>
    </div>
    <table class="t1-table"><tbody>
      <tr>
        <td style="width:36px;text-align:center;color:var(--text3)">1</td>
        <td style="color:var(--text2)">人工费用</td>
        <td class="t1-num">${fmt(sm.labor_cost||0)}</td>
        <td style="font-size:11px;color:var(--text3)">预估费用</td>
      </tr>
      <tr>
        <td style="text-align:center;color:var(--text3)">2</td>
        <td style="color:var(--text2)">项目支出 <span class="t1-auto">↑ 自动取对下付款合计</span></td>
        <td class="t1-num t1-auto">${fmt(c.planPay)}</td>
        <td style="font-size:11px;color:var(--text3)">与对下付款合计数一致</td>
      </tr>
      <tr>
        <td style="text-align:center;color:var(--text3)">3</td>
        <td style="color:var(--text2)">部门费用</td>
        <td class="t1-num">${fmt(sm.dept_cost||0)}</td>
        <td style="font-size:11px;color:var(--text3)">预估费用</td>
      </tr>
      <tr>
        <td style="text-align:center;color:var(--text3)">4</td>
        <td style="color:var(--text2)">摊销费用</td>
        <td class="t1-num">${fmt(sm.amortization||0)}</td>
        <td style="font-size:11px;color:var(--text3)">预估费用</td>
      </tr>
      <tr>
        <td style="text-align:center;color:var(--text3)">5</td>
        <td style="color:var(--text2)">公司锁定</td>
        <td class="t1-num">${fmt(sm.company_lock||0)}</td>
        <td></td>
      </tr>
      <tr>
        <td style="text-align:center;color:var(--text3)">6</td>
        <td style="color:var(--text2)">还本付息</td>
        <td class="t1-num">${fmt(sm.debt_service||0)}</td>
        <td></td>
      </tr>
      ${c.extraTot>0?`<tr>
        <td style="text-align:center;color:var(--text3)">+</td>
        <td style="color:var(--text2)">其他支出 <span class="t1-auto">(${finState.extras.length}项)</span></td>
        <td class="t1-num t1-auto">${fmt(c.extraTot)}</td>
        <td style="font-size:11px;color:var(--text3)">见资金看板</td>
      </tr>`:''}
    </tbody>
    <tfoot><tr class="t1-total">
      <td colspan="2" style="padding:9px 18px;font-weight:600">支出合计（万元）</td>
      <td class="t1-num">${fmt(c.totalExp)}</td>
      <td></td>
    </tr></tfoot>
    </table>
  </div>

  <div class="sec-card">
    <div class="sec-head">
      <div class="sec-head-title"><span class="sec-badge sb-income">收入</span>计划收入金额</div>
    </div>
    <table class="t1-table"><tbody>
      <tr>
        <td style="width:36px;text-align:center;color:var(--text3)">1</td>
        <td style="color:var(--text2)">项目回款 <span class="t1-auto">↑ 自动取对上收款合计</span></td>
        <td class="t1-num t1-auto">${fmt(c.planRec)}</td>
        <td style="font-size:11px;color:var(--text3)">与对上收款合计数一致</td>
      </tr>
      <tr>
        <td style="text-align:center;color:var(--text3)">2</td>
        <td style="color:var(--text2)">上月资金结余 <span class="t1-auto">↑ 自动结转 ${pmLabel}</span></td>
        <td class="t1-num t1-auto" style="color:${c.prevBal<0?'var(--red)':'var(--text3)'}">${fmt(c.prevBal)}</td>
        <td style="font-size:11px;color:var(--text3)">${c.prevBal<0?'⚠ 上月负结余':'自动带入'}</td>
      </tr>
    </tbody>
    <tfoot><tr class="t1-total">
      <td colspan="2" style="padding:9px 18px;font-weight:600">收入合计（万元）</td>
      <td class="t1-num">${fmt(c.totalInc)}</td>
      <td></td>
    </tr></tfoot>
    </table>
  </div>

  <div class="sec-card">
    <div class="sec-head">
      <div class="sec-head-title">
        <span class="sec-badge ${c.surplus>=0?'sb-income':'sb-expense'}">${c.surplus>=0?'盈余':'缺口'}</span>
        资金溢缺 = 收入合计 − 支出合计
      </div>
    </div>
    <table class="t1-table"><tbody>
      <tr>
        <td colspan="2" style="padding:12px 18px;font-size:14px;font-weight:600">资金溢缺（万元）</td>
        <td class="t1-num" style="font-size:16px;color:${c.surplus>=0?'var(--green)':'var(--red)'}">
          ${fmt(c.surplus)}
        </td>
        <td style="font-size:12px;color:${c.surplus>=0?'var(--green)':'var(--red)'}">
          ${c.surplus>=0?'资金充裕':'⚠ 资金缺口 '+fmt(Math.abs(c.surplus))+' 万元'}
        </td>
      </tr>
    </tbody></table>
  </div>

  <div class="sec-card">
    <div class="sec-head">
      <div class="sec-head-title"><span class="sec-badge sb-fund">筹集</span>资金筹集</div>
      ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="openT1EditModal('fund')">✎ 编辑</button>`:''}
    </div>
    <table class="t1-table"><tbody>
      <tr><td style="width:36px;text-align:center;color:var(--text3)">1</td><td style="color:var(--text2)">股东注资</td><td class="t1-num">${fmt(sm.shareholder_injection||0)}</td><td></td></tr>
      <tr><td style="text-align:center;color:var(--text3)">2</td><td style="color:var(--text2)">股东借款</td><td class="t1-num">${fmt(sm.shareholder_loan||0)}</td><td></td></tr>
      <tr><td style="text-align:center;color:var(--text3)">3</td><td style="color:var(--text2)">流动资金贷款</td><td class="t1-num">${fmt(sm.working_capital_loan||0)}</td><td></td></tr>
      <tr><td style="text-align:center;color:var(--text3)">4</td><td style="color:var(--text2)">供应链融资</td><td class="t1-num">${fmt(sm.supply_chain_finance||0)}</td><td></td></tr>
    </tbody>
    <tfoot><tr class="t1-total">
      <td colspan="2" style="padding:9px 18px;font-weight:600">合计（万元）</td>
      <td class="t1-num">${fmt(c.funding)}</td>
      <td></td>
    </tr></tfoot>
    </table>
  </div>

  <div style="font-size:11px;color:var(--text3);padding:6px 4px;line-height:1.9">
    注：1. 资金计划周期为每月25日至次月24日，请于每月25日前上报次月计划；<br>
    2. 资金溢缺 = 收入合计 − 支出合计；<br>
    3. 计划支出金额日期按照预估的支付时间填写
  </div>`;
}

//  T1 编辑弹框 
function openT1EditModal(section='expense'){
  const sm=finState.summary;
  const isFund=section==='fund';
  openModal(`
  <div class="modal-header">
    <div class="modal-title">${isFund?'编辑资金筹集':'编辑固定支出项'}</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    ${isFund?`
    <div class="form-row">
      <div class="form-group"><label class="form-label">股东注资（万元）</label><input class="form-input" id="t1-si" type="number" step="0.0001" value="${sm.shareholder_injection||0}"></div>
      <div class="form-group"><label class="form-label">股东借款（万元）</label><input class="form-input" id="t1-sl" type="number" step="0.0001" value="${sm.shareholder_loan||0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">流动资金贷款（万元）</label><input class="form-input" id="t1-wl" type="number" step="0.0001" value="${sm.working_capital_loan||0}"></div>
      <div class="form-group"><label class="form-label">供应链融资（万元）</label><input class="form-input" id="t1-sf" type="number" step="0.0001" value="${sm.supply_chain_finance||0}"></div>
    </div>
    `:` 
    <div class="form-row">
      <div class="form-group"><label class="form-label">人工费用（万元）</label><input class="form-input" id="t1-lc" type="number" step="0.0001" value="${sm.labor_cost||0}"></div>
      <div class="form-group"><label class="form-label">部门费用（万元）</label><input class="form-input" id="t1-dc" type="number" step="0.0001" value="${sm.dept_cost||0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">摊销费用（万元）</label><input class="form-input" id="t1-am" type="number" step="0.0001" value="${sm.amortization||0}"></div>
      <div class="form-group"><label class="form-label">公司锁定（万元）</label><input class="form-input" id="t1-cl" type="number" step="0.0001" value="${sm.company_lock||0}"></div>
    </div>
    <div class="form-group"><label class="form-label">还本付息（万元）</label><input class="form-input" id="t1-ds" type="number" step="0.0001" value="${sm.debt_service||0}"></div>
    `}
  </div>
  <div class="modal-footer">
    <div></div>
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveT1Fields('${section}',this)">保存</button>
    </div>
  </div>`);
}
async function saveT1Fields(sec,btn){
  setLoading(btn,true);
  let data={};
  if(sec==='fund'){
    data={shareholder_injection:+q('t1-si')||0,shareholder_loan:+q('t1-sl')||0,
      working_capital_loan:+q('t1-wl')||0,supply_chain_finance:+q('t1-sf')||0};
  } else {
    data={labor_cost:+q('t1-lc')||0,dept_cost:+q('t1-dc')||0,
      amortization:+q('t1-am')||0,company_lock:+q('t1-cl')||0,debt_service:+q('t1-ds')||0};
  }
  await upsertSummary(data);
  setLoading(btn,false);closeModal();finRender();toast('✓ 已保存', 'success');
}
async function upsertSummary(data,ym){
  ym=ym||currentMonth;
  const sm=ym===currentMonth?finState.summary:finState.prevSummary;
  const upd={...data,updated_at:new Date().toISOString()};
  if(sm.id){
    await sb.from('finance_summary').update(upd).eq('id',sm.id);
    Object.assign(sm,data);
  } else {
    const row={id:'fs'+uid(),year_month:ym,...data,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    await sb.from('finance_summary').insert(row);
    if(ym===currentMonth)finState.summary={...row};
    else finState.prevSummary={...row};
  }
}

//  对上收款台账 T2 
