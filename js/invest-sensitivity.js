/* ════════════════════════════════════════════════
 * invest-sensitivity.js — 敏感性分析看板
 * ════════════════════════════════════════════════ */

// ── 敏感性真实重算引擎 ──
function modified_Value_helper(currentVal, originalVal, newVal) {
  var cur = Number(currentVal || 0);
  var orig = Number(originalVal || 0);
  var mod  = Number(newVal || 0);
  if (orig === 0) return mod;
  return cur * (mod / orig);
}

function calcSensitivityDeviation(factor, originalValue, modifiedValue) {
  // 克隆输入
  var lands  = JSON.parse(JSON.stringify(_editLands  || []));
  var inputs = JSON.parse(JSON.stringify(_editInputs || {}));
  var baseOutputTotal = _editOutputs.total || {};

  var BASE_IRR_PRE   = Number(baseOutputTotal.pre_tax_irr   || 0);
  var BASE_IRR_AFTER = Number(baseOutputTotal.after_tax_irr  || 0);
  var BASE_PROFIT    = Number(baseOutputTotal['净利润（万元）'] || 0);
  var BASE_MARGIN    = Number(baseOutputTotal['净利润率']     || 0);

  switch (factor) {
    case 'land_price':
      if (lands[0]) lands[0].land_price = modified_Value_helper(lands[0].land_price, originalValue, modifiedValue);
      break;
    case 'sale_price':
      var ratio = originalValue > 0 ? modifiedValue / originalValue : 1;
      if (inputs.sales_plan && inputs.sales_plan.items) {
        inputs.sales_plan.items.forEach(function(s) { s.unit_price = (s.unit_price || 0) * ratio; });
      }
      break;
    case 'build_cost':
      if (inputs.cost_alloc) {
        var buildRatio = originalValue > 0 ? modifiedValue / originalValue : 1;
        var buildKey = '建安费用（元/㎡）';
        if (inputs.cost_alloc[buildKey] !== undefined) {
          inputs.cost_alloc[buildKey] = inputs.cost_alloc[buildKey] * buildRatio;
        }
      }
      break;
    case 'floor_cost':
      if (lands[0]) lands[0].land_unit_price = modifiedValue;
      break;
    case 'total_area':
      if (inputs.product_plan) inputs.product_plan['总建设面积（㎡）'] = modifiedValue;
      break;
  }

  // 重新计算
  var salesItems = (inputs.sales_plan && inputs.sales_plan.items) || [];
  var payItems   = (inputs.pay_plan && inputs.pay_plan.items) || [];

  var totalRevenue = 0;
  salesItems.forEach(function(s) { totalRevenue += (Number(s.area || 0) * Number(s.unit_price || 0)); });
  totalRevenue = totalRevenue / 10000;

  var landCost = 0;
  lands.forEach(function(l) { landCost += Number(l.land_price || 0) + Number(l.extra_land_fee || 0); });
  var buildArea = Number((inputs.product_plan || {})['总建设面积（㎡）'] || 0);
  var buildCost = 0;
  Object.keys(inputs.cost_alloc || {}).forEach(function(k) {
    buildCost += (Number((inputs.cost_alloc || {})[k]) || 0) * buildArea / 10000;
  });
  var totalCost = landCost + buildCost;

  var grossProfit = totalRevenue - totalCost;
  var vat = totalRevenue * 0.05;
  var landVAT = Math.max(0, grossProfit - vat) * 0.30;
  var corpTax = Math.max(0, grossProfit - vat - landVAT) * 0.25;
  var netProfit = grossProfit - vat - landVAT - corpTax;
  var netMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0;

  var cashflows = buildCashflowByYear(payItems, salesItems, lands);
  var newIRRPre   = cashflows.length >= 2 ? (calcIRR(cashflows) || 0) : 0;
  var newIRRAfter = cashflows.length >= 2 ? (calcAfterTaxIRR(cashflows) || 0) : 0;

  return {
    preTaxIRRDev:   newIRRPre   - BASE_IRR_PRE,
    afterTaxIRRDev: newIRRAfter - BASE_IRR_AFTER,
    netProfitDev:   netProfit   - BASE_PROFIT,
    netMarginDev:   netMargin   - BASE_MARGIN
  };
}

window.renderSensitivityBoard = function() {
  var main = document.getElementById('main-content');
  if (!main) return;

  if (!currentCalcProjectId) {
    main.innerHTML = '<div class="inv-empty"><p>请先进入项目列表选择项目，再进入测算列表选择版本</p>' +
      '<button class="inv-btn" style="margin-top:12px" onclick="switchInvTab(\'inv_list\')">前往项目列表</button></div>';
    return;
  }

  var proj = invState.projects.find(function(p) { return p.id === currentCalcProjectId; });
  var ver = invState.currentVersion;

  var html = '<div class="inv-calc-toolbar">' +
    '<span class="inv-calc-toolbar-title">' + escHtml(proj ? proj.name : '') + ' · 敏感性分析</span>' +
    '</div>';

  html += '<div class="inv-search-bar">' +
    '<select id="inv-sens-version" onchange="onSensVersionChange(this.value)">' +
    '<option value="">选择测算版本</option>' +
    invState.versions.map(function(v) {
      return '<option value="' + v.id + '"' + (currentEditVersionId === v.id ? ' selected' : '') + '>' + escHtml(v.version_name) + '</option>';
    }).join('') +
    '</select>' +
    '<button class="inv-btn inv-btn-primary" onclick="openSensAddEvent()" data-menu-key="inv_sensitivity">+ 新增分析事件</button>' +
    '</div>';

  if (invState.sensitivityItems.length === 0) {
    html += '<div class="inv-empty"><p>暂无敏感性分析记录</p>' +
      '<p style="font-size:12px;margin-top:4px">选择测算版本后，点击「新增分析事件」开始</p></div>';
  } else {
    html += '<div class="inv-sensitivity-board">' +
      '<div class="inv-table-wrap"><table class="inv-table inv-sensitivity-table"><thead><tr>' +
      '<th>事件名称</th><th>影响因素</th><th>原始值</th><th>修改值</th>' +
      '<th>税前IRR偏离</th><th>税后IRR偏离</th><th>净利润偏离(万元)</th><th>净利润率偏离</th>' +
      '<th>操作</th>' +
      '</tr></thead><tbody>';
    html += invState.sensitivityItems.map(function(item) {
      var preTaxClass = item.pre_tax_irr_dev >= 0 ? 'inv-dev-positive' : 'inv-dev-negative';
      var afterTaxClass = item.after_tax_irr_dev >= 0 ? 'inv-dev-positive' : 'inv-dev-negative';
      var profitClass = item.net_profit_dev >= 0 ? 'inv-dev-positive' : 'inv-dev-negative';
      var marginClass = item.net_margin_dev >= 0 ? 'inv-dev-positive' : 'inv-dev-negative';
      return '<tr>' +
        '<td>' + escHtml(item.event_name) + '</td>' +
        '<td>' + escHtml(item.factor) + '</td>' +
        '<td class="mono">' + invFmt(item.original_value) + '</td>' +
        '<td class="mono">' + invFmt(item.modified_value) + '</td>' +
        '<td class="mono ' + preTaxClass + '">' + (item.pre_tax_irr_dev >= 0 ? '+' : '') + invPct(item.pre_tax_irr_dev) + '</td>' +
        '<td class="mono ' + afterTaxClass + '">' + (item.after_tax_irr_dev >= 0 ? '+' : '') + invPct(item.after_tax_irr_dev) + '</td>' +
        '<td class="mono ' + profitClass + '">' + (item.net_profit_dev >= 0 ? '+' : '') + invFmt(item.net_profit_dev) + '</td>' +
        '<td class="mono ' + marginClass + '">' + (item.net_margin_dev >= 0 ? '+' : '') + invPct(item.net_margin_dev) + '</td>' +
        '<td class="actions">' +
          '<button class="inv-btn" onclick="openSensEditEvent(\'' + item.id + '\')" data-menu-key="inv_sensitivity">编辑</button>' +
          '<button class="inv-btn inv-btn-danger" onclick="deleteSensEvent(\'' + item.id + '\')" data-menu-key="inv_sensitivity">删除</button>' +
        '</td>' +
        '</tr>';
    }).join('');
    html += '</tbody></table></div></div>';
  }

  main.innerHTML = html;
  applyInvPerms();
};

window.onSensVersionChange = async function(versionId) {
  if (!versionId) return;
  currentEditVersionId = versionId;
  await loadInvVersionData(versionId);
  await loadSensitivityItems(versionId);
  renderSensitivityBoard();
};

// ── 新增敏感性分析事件 ──
window.openSensAddEvent = function() {
  if (!currentEditVersionId) {
    if (typeof toast === 'function') toast('请先选择测算版本', 'warning');
    return;
  }
  var factors = [
    { key: 'land_price', label: '土地出让金' },
    { key: 'sale_price', label: '销售单价' },
    { key: 'floor_cost', label: '楼板价' },
    { key: 'build_cost', label: '建安成本' },
    { key: 'total_area', label: '总建筑面积' }
  ];
  var html = (typeof modalHeader === 'function' ? modalHeader('新增敏感性分析') : '<div class="modal-header">新增敏感性分析</div>') +
    '<div class="modal-body">' +
    '<div class="inv-field"><label class="inv-field-label"><span class="required">*</span> 事件名称</label>' +
    '<input type="text" id="sens-event-name" placeholder="如：地价上涨10%"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label"><span class="required">*</span> 影响因素</label>' +
    '<select id="sens-factor" onchange="onSensFactorChange(this.value)"><option value="">请选择</option>' +
    factors.map(function(f) { return '<option value="' + f.key + '">' + f.label + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">原始值</label>' +
    '<input type="number" id="sens-original" value="" readonly></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label"><span class="required">*</span> 修改值</label>' +
    '<input type="number" id="sens-modified" placeholder="输入修改后的值"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="inv-btn" onclick="closeModal()">取消</button>' +
    '<button class="inv-btn inv-btn-primary" id="sens-submit" onclick="submitSensEvent()">保存并计算</button>' +
    '</div>';
  if (typeof openModal === 'function') openModal(html);
};

window.onSensFactorChange = function(factor) {
  var originalInput = document.getElementById('sens-original');
  if (!originalInput) return;
  var val = 0;
  var land = _editLands[0] || {};
  switch (factor) {
    case 'land_price': val = land.land_price || 0; break;
    case 'sale_price': val = 10000; break;
    case 'floor_cost': val = land.land_unit_price || 0; break;
    case 'build_cost': val = (_editInputs.cost_alloc && _editInputs.cost_alloc['建安费用（元/㎡）']) || 0; break;
    case 'total_area': val = (_editInputs.product_plan && _editInputs.product_plan['总建设面积（㎡）']) || 0; break;
    default: val = 0;
  }
  originalInput.value = val;
};

window.submitSensEvent = async function() {
  var nameInput = document.getElementById('sens-event-name');
  var factorSelect = document.getElementById('sens-factor');
  var modifiedInput = document.getElementById('sens-modified');
  var name = nameInput ? nameInput.value.trim() : '';
  var factor = factorSelect ? factorSelect.value : '';
  var original = parseFloat((document.getElementById('sens-original') ? document.getElementById('sens-original').value : null)) || 0;
  var modified = parseFloat(modifiedInput ? modifiedInput.value : null) || 0;
  if (!name || !factor) {
    if (typeof toast === 'function') toast('请填写完整信息', 'warning');
    return;
  }
  var deviations = calcSensitivityDeviation(factor, original, modified);

  var newItem = {
    id: typeof uid === 'function' ? uid() : 'sens_' + Date.now(),
    version_id: currentEditVersionId,
    event_name: name,
    factor: factor,
    original_value: original,
    modified_value: modified,
    pre_tax_irr_dev: deviations.preTaxIRRDev,
    after_tax_irr_dev: deviations.afterTaxIRRDev,
    net_profit_dev: deviations.netProfitDev,
    net_margin_dev: deviations.netMarginDev,
    created_by: currentUser ? currentUser.id : null
  };

  var result = await sb.from('invest_sensitivity').insert(newItem);
  if (result.error) { console.error('submitSensEvent:', result.error); if (typeof toast === 'function') toast('保存失败', 'error'); return; }
  if (typeof closeModal === 'function') closeModal();
  invLogAction('新增敏感性分析', '事件: ' + name + ' 因素: ' + factor);
  await loadSensitivityItems(currentEditVersionId);
  renderSensitivityBoard();
  if (typeof toast === 'function') toast('敏感性分析已保存', 'success');
};

window.openSensEditEvent = function(itemId) {
  var item = invState.sensitivityItems.find(function(s) { return s.id === itemId; });
  if (!item) return;

  var factors = [
    { key: 'land_price', label: '土地出让金' },
    { key: 'sale_price', label: '销售单价' },
    { key: 'floor_cost', label: '楼板价' },
    { key: 'build_cost', label: '建安成本' },
    { key: 'total_area', label: '总建筑面积' }
  ];

  var html = (typeof modalHeader === 'function' ? modalHeader('编辑敏感性分析') : '<div class="modal-header">编辑敏感性分析</div>') +
    '<div class="modal-body">' +
    '<div class="inv-field"><label class="inv-field-label"><span class="required">*</span> 事件名称</label>' +
    '<input type="text" id="sens-event-name" value="' + escHtml(item.event_name) + '"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label"><span class="required">*</span> 影响因素</label>' +
    '<select id="sens-factor" onchange="onSensFactorChange(this.value)">' +
    factors.map(function(f) {
      return '<option value="' + f.key + '"' + (item.factor === f.key ? ' selected' : '') + '>' + f.label + '</option>';
    }).join('') +
    '</select></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">原始值</label>' +
    '<input type="number" id="sens-original" value="' + (item.original_value || 0) + '" readonly></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label"><span class="required">*</span> 修改值</label>' +
    '<input type="number" id="sens-modified" value="' + (item.modified_value || 0) + '"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="inv-btn" onclick="closeModal()">取消</button>' +
    '<button class="inv-btn inv-btn-primary" id="sens-submit" onclick="submitSensEventEdit(\'' + itemId + '\')">保存并重算</button>' +
    '</div>';

  if (typeof openModal === 'function') openModal(html);
};

window.submitSensEventEdit = async function(itemId) {
  var name     = ((document.getElementById('sens-event-name') || {}).value || '').trim();
  var factor   = (document.getElementById('sens-factor') || {}).value;
  var original = parseFloat((document.getElementById('sens-original') || {}).value) || 0;
  var modified = parseFloat((document.getElementById('sens-modified') || {}).value) || 0;

  if (!name || !factor) {
    if (typeof toast === 'function') toast('请填写完整信息', 'warning'); return;
  }

  var deviations = calcSensitivityDeviation(factor, original, modified);

  var updateData = {
    event_name: name, factor: factor,
    original_value: original, modified_value: modified,
    pre_tax_irr_dev:   deviations.preTaxIRRDev,
    after_tax_irr_dev: deviations.afterTaxIRRDev,
    net_profit_dev:    deviations.netProfitDev,
    net_margin_dev:    deviations.netMarginDev
  };

  var { error } = await sb.from('invest_sensitivity').update(updateData).eq('id', itemId);
  if (error) { if (typeof toast === 'function') toast('保存失败', 'error'); return; }
  if (typeof closeModal === 'function') closeModal();
  invLogAction('编辑敏感性分析', '事件: ' + name);
  await loadSensitivityItems(currentEditVersionId);
  renderSensitivityBoard();
  if (typeof toast === 'function') toast('已更新', 'success');
};

window.deleteSensEvent = async function(itemId) {
  if (typeof showConfirm === 'function') {
    showConfirm('删除', '确定删除此分析记录？', async function() {
      await sb.from('invest_sensitivity').delete().eq('id', itemId);
      invLogAction('删除敏感性分析', '删除记录: ' + itemId);
      await loadSensitivityItems(currentEditVersionId);
      renderSensitivityBoard();
      if (typeof toast === 'function') toast('已删除', 'success');
    });
  }
};
