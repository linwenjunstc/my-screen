/* ════════════════════════════════════════════════
 * finance-t4.js  —  T4 完成情况
 * ════════════════════════════════════════════════ */

function renderT4(){
  const sm=finState.summary;
  const c=computeTotals();
  // 表五合计（收入实际）
  const actRec=finState.actualReceipts.reduce((s,r)=>s+(+r.amount||0),0);
  // 表六合计（支出实际）
  const actPay=finState.actualPayments.reduce((s,r)=>s+(+r.amount||0),0);
  // 其他实际支出（来自 summary 的 actual_* 字段）
  const aLabor=+sm.actual_labor||0, aDept=+sm.actual_dept||0;
  const aAmort=+sm.actual_amortization||0, aLock=+sm.actual_company_lock||0;
  const aDebt=+sm.actual_debt_service||0;
  // 汇总
  const planExp=c.totalExp, planInc=c.totalInc;
  const actIncTotal=actRec+c.prevBal;
  const actExpTotal=actPay+aLabor+aDept+aAmort+aLock+aDebt;
  const planSurplus=c.surplus;
  const actSurplus=actIncTotal-actExpTotal;

  function cmpCell(plan,actual){
    const diff=actual-plan;
    const cls=diff>=0?'cmp-pos':'cmp-neg';
    return `<span class="num" style="font-family:var(--mono)">${fmt(actual)}</span>
      <span class="${cls}" style="font-size:11px;margin-left:6px">${diff>=0?'▲+':'▼'}${fmt(Math.abs(diff))}</span>`;
  }

  document.getElementById('main-content').innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div>
      <div style="font-size:14px;font-weight:600">完成情况</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">
        ${fmtMon(currentMonth)} · 实际数自动来源：收款→表五，支付→表六，其他→手动录入
      </div>
    </div>
    ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="openT4ActualEditModal()">✎ 编辑其他实际项</button>`:''}
  </div>

  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">收入完成情况</div>
      <span class="sec-badge sb-income">收入</span>
    </div>
    <table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th>项目</th>
        <th class="num">计划金额（元）</th>
        <th class="num">实际金额（元）</th>
        <th class="num" style="min-width:80px">差异</th>
        <th>数据来源</th>
      </tr></thead>
      <tbody>
        <tr>
          <td style="color:var(--text3);text-align:center">1</td>
          <td>项目回款</td>
          <td class="num">${fmt(c.planRec)}</td>
          <td colspan="2">${cmpCell(c.planRec,actRec)}</td>
          <td style="font-size:11px;color:var(--text3)">表五：实际收款明细（${finState.actualReceipts.length}条）</td>
        </tr>
        <tr>
          <td style="color:var(--text3);text-align:center">2</td>
          <td>上月结余（自动）</td>
          <td class="num" style="color:var(--text3)">${fmt(c.prevBal)}</td>
          <td class="num" style="color:var(--text3)">${fmt(c.prevBal)}</td>
          <td></td>
          <td style="font-size:11px;color:var(--text3)">自动结转</td>
        </tr>
      </tbody>
      <tfoot><tr class="tfoot-row">
        <td colspan="2">收入合计（元）</td>
        <td>${fmt(planInc)}</td>
        <td>${fmt(actIncTotal)}</td>
        <td><span class="${actIncTotal>=planInc?'cmp-pos':'cmp-neg'}">${actIncTotal>=planInc?'▲+':'▼'}${fmt(Math.abs(actIncTotal-planInc))}</span></td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>

  <div class="table-wrap">
    <div class="table-toolbar">
      <div class="table-title">支出完成情况</div>
      <span class="sec-badge sb-expense">支出</span>
    </div>
    <table>
      <thead><tr>
        <th style="width:32px">#</th>
        <th>项目</th>
        <th class="num">计划金额（元）</th>
        <th class="num">实际金额（元）</th>
        <th class="num" style="min-width:80px">差异（实际−计划）</th>
        <th>数据来源</th>
      </tr></thead>
      <tbody>
        <tr>
          <td style="color:var(--text3);text-align:center">1</td>
          <td>人工费用</td>
          <td class="num">${fmt(sm.labor_cost||0)}</td>
          <td colspan="2">${cmpCell(+sm.labor_cost||0,aLabor)}</td>
          <td style="font-size:11px;color:var(--text3)">手动录入</td>
        </tr>
        <tr>
          <td style="color:var(--text3);text-align:center">2</td>
          <td>项目支出（对下付款）</td>
          <td class="num">${fmt(c.planPay)}</td>
          <td colspan="2">${cmpCell(c.planPay,actPay)}</td>
          <td style="font-size:11px;color:var(--text3)">表六：实际支付明细（${finState.actualPayments.length}条）</td>
        </tr>
        <tr>
          <td style="color:var(--text3);text-align:center">3</td>
          <td>部门费用</td>
          <td class="num">${fmt(sm.dept_cost||0)}</td>
          <td colspan="2">${cmpCell(+sm.dept_cost||0,aDept)}</td>
          <td style="font-size:11px;color:var(--text3)">手动录入</td>
        </tr>
        <tr>
          <td style="color:var(--text3);text-align:center">4</td>
          <td>摊销费用</td>
          <td class="num">${fmt(sm.amortization||0)}</td>
          <td colspan="2">${cmpCell(+sm.amortization||0,aAmort)}</td>
          <td style="font-size:11px;color:var(--text3)">手动录入</td>
        </tr>
        <tr>
          <td style="color:var(--text3);text-align:center">5</td>
          <td>公司锁定</td>
          <td class="num">${fmt(sm.company_lock||0)}</td>
          <td colspan="2">${cmpCell(+sm.company_lock||0,aLock)}</td>
          <td style="font-size:11px;color:var(--text3)">手动录入</td>
        </tr>
        <tr>
          <td style="color:var(--text3);text-align:center">6</td>
          <td>还本付息</td>
          <td class="num">${fmt(sm.debt_service||0)}</td>
          <td colspan="2">${cmpCell(+sm.debt_service||0,aDebt)}</td>
          <td style="font-size:11px;color:var(--text3)">手动录入</td>
        </tr>
      </tbody>
      <tfoot><tr class="tfoot-row">
        <td colspan="2">支出合计（元）</td>
        <td>${fmt(planExp)}</td>
        <td>${fmt(actExpTotal)}</td>
        <td><span class="${actExpTotal<=planExp?'cmp-pos':'cmp-neg'}">${actExpTotal<=planExp?'▼节省':'▲超支'}${fmt(Math.abs(actExpTotal-planExp))}</span></td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>

  <div class="sec-card">
    <div class="sec-head">
      <div class="sec-head-title">
        <span class="sec-badge ${actSurplus>=0?'sb-income':'sb-expense'}">${actSurplus>=0?'结余':'缺口'}</span>
        资金溢缺完成情况
      </div>
    </div>
    <table class="t1-table"><tbody>
      <tr>
        <td style="width:120px;color:var(--text2)">计划溢缺</td>
        <td class="t1-num" style="color:${planSurplus>=0?'var(--green)':'var(--red)'}">${fmt(planSurplus)} 元</td>
        <td style="width:120px;color:var(--text2)">实际溢缺</td>
        <td class="t1-num" style="color:${actSurplus>=0?'var(--green)':'var(--red)'}">
          ${fmt(actSurplus)} 元
          <span class="${(actSurplus-planSurplus)>=0?'cmp-pos':'cmp-neg'}" style="font-size:11px;margin-left:8px">
            ${(actSurplus-planSurplus)>=0?'▲+':'▼'}${fmt(Math.abs(actSurplus-planSurplus))}
          </span>
        </td>
      </tr>
    </tbody></table>
  </div>`;
}

function openT4ActualEditModal(){
  const sm=finState.summary;
  openModal(`
  <div class="modal-header">
    <div class="modal-title">编辑其他实际支出项</div>
    <button class="modal-close" onclick="closeModal()"><i data-lucide="x"></i></button>
  </div>
  <div class="modal-body">
    <div class="form-hint" style="margin-bottom:12px">项目支付实际 = 表六自动汇总；下方填写其他科目实际数（万元）</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">人工费用实际（万元）</label><input class="form-input" id="t4-al" type="number" step="0.0001" value="${sm.actual_labor||0}"></div>
      <div class="form-group"><label class="form-label">部门费用实际（万元）</label><input class="form-input" id="t4-ad" type="number" step="0.0001" value="${sm.actual_dept||0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">摊销费用实际（万元）</label><input class="form-input" id="t4-aa" type="number" step="0.0001" value="${sm.actual_amortization||0}"></div>
      <div class="form-group"><label class="form-label">公司锁定实际（万元）</label><input class="form-input" id="t4-ac" type="number" step="0.0001" value="${sm.actual_company_lock||0}"></div>
    </div>
    <div class="form-group"><label class="form-label">还本付息实际（万元）</label><input class="form-input" id="t4-ab" type="number" step="0.0001" value="${sm.actual_debt_service||0}"></div>
  </div>
  <div class="modal-footer"><div></div>
    <div class="modal-footer-right">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveT4Actuals(this)">保存</button>
    </div>
  </div>`);
}
async function saveT4Actuals(btn){
  setLoading(btn,true);
  const data={actual_labor:+q('t4-al')||0, actual_dept:+q('t4-ad')||0,
    actual_amortization:+q('t4-aa')||0, actual_company_lock:+q('t4-ac')||0,
    actual_debt_service:+q('t4-ab')||0};
  await upsertSummary(data);
  setLoading(btn,false);closeModal();finRender();toast('✓ 完成情况已保存', 'success');
  finLogAction('编辑完成情况', `更新${fmtMon(currentMonth)}完成情况实际数`);
}

//  实际收款明细 T5 
