/* ════════════════════════════════════════════════
 * invest-calc.js — 测算列表 / 测算编辑（6步输入 + 6个输出 + 计算校验）
 * ════════════════════════════════════════════════ */

// ── 测算列表渲染 ──
function renderInvVersionList() {
  var main = document.getElementById('main-content');
  if (!main) return;
  if (!currentCalcProjectId) {
    main.innerHTML = '<div class="inv-empty"><p>请先从项目列表中选择一个项目</p>' +
      '<button class="inv-btn" style="margin-top:12px" onclick="switchInvTab(\'inv_list\')">前往项目列表</button></div>';
    return;
  }
  var proj = invState.projects.find(function(p) { return p.id === currentCalcProjectId; });
  var projName = proj ? proj.name : '未知项目';

  var html = '';
  html += '<div class="inv-calc-toolbar">' +
    '<div style="display:flex;align-items:center;gap:12px">' +
      '<button class="inv-back-btn" onclick="switchInvTab(\'inv_list\')">&larr; 返回项目列表</button>' +
      '<span class="inv-calc-toolbar-title">' + escHtml(projName) + ' · 测算版本</span>' +
    '</div>' +
    '<button class="inv-btn inv-btn-primary" onclick="openInvNewVersion()" data-menu-key="inv_edit">+ 新增测算</button>' +
  '</div>';

  html += '<div style="padding:0 24px 12px;display:flex;gap:8px">' +
    '<button class="inv-btn" onclick="openInvProjectInfo(\'' + currentCalcProjectId + '\')" data-menu-key="inv_calc">查看指标走势</button>' +
    '<button class="inv-btn" onclick="switchInvTab(\'inv_sensitivity\')" data-menu-key="inv_sensitivity">敏感性分析</button>' +
    '</div>';

  if (invState.versions.length === 0) {
    html += '<div class="inv-empty"><p>暂无测算版本</p><p style="font-size:12px;margin-top:4px">点击「新增测算」创建第一个版本</p></div>';
  } else {
    html += '<div class="inv-table-wrap"><table class="inv-table"><thead><tr>' +
      '<th>版本名称</th><th>测算类型</th><th>状态</th><th>税前IRR</th><th>税后IRR</th>' +
      '<th>净利润(万元)</th><th>净利润率</th><th>修改日期</th><th>操作</th>' +
      '</tr></thead><tbody>';
    var STATUS_LABEL = { draft: '草稿', submitted: '已提交', approved: '已审批' };
    var STATUS_CLASS = { draft: 'inv-status-draft', submitted: 'inv-status-submitted', approved: 'inv-status-approved' };
    html += invState.versions.map(function(v) {
      var typeLabel = ({'decision':'决策版','feasibility':'可研版','other':'其他'})[v.calc_type] || '其他';
      var updatedDate = v.updated_at ? new Date(v.updated_at).toLocaleDateString('zh-CN') : '--';
      var statusActions = '';
      if (v.status === 'draft') {
        statusActions = '<button class="inv-btn inv-btn-sm" onclick="submitInvVersion(\'' + v.id + '\')" data-menu-key="inv_edit">提交</button>';
      } else if (v.status === 'submitted' && typeof isAdmin === 'function' && isAdmin()) {
        statusActions = '<button class="inv-btn inv-btn-sm inv-btn-success" onclick="approveInvVersion(\'' + v.id + '\')" data-menu-key="inv_edit">审批通过</button>' +
          '<button class="inv-btn inv-btn-sm" onclick="rejectInvVersion(\'' + v.id + '\')" data-menu-key="inv_edit">退回</button>';
      }
      return '<tr>' +
        '<td><strong>' + escHtml(v.version_name) + '</strong></td>' +
        '<td>' + typeLabel + '</td>' +
        '<td><span class="inv-version-status ' + (STATUS_CLASS[v.status] || '') + '">' + (STATUS_LABEL[v.status] || v.status) + '</span></td>' +
        '<td class="mono">' + invPct(v.pre_tax_irr) + '</td>' +
        '<td class="mono">' + invPct(v.after_tax_irr) + '</td>' +
        '<td class="mono">' + invFmt(v.net_profit) + '</td>' +
        '<td class="mono">' + invPct(v.net_margin) + '</td>' +
        '<td>' + updatedDate + '</td>' +
        '<td class="actions">' +
          '<button class="inv-btn inv-btn-sm" onclick="openInvEditVersion(\'' + v.id + '\')" data-menu-key="inv_edit">编辑</button>' +
          statusActions +
          '<button class="inv-btn inv-btn-sm inv-btn-danger" onclick="deleteInvVersion(\'' + v.id + '\')" data-menu-key="inv_edit">删除</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    html += '</tbody></table></div>';
  }

  main.innerHTML = html;
  applyInvPerms();
}

// ── 新增测算弹窗 ──
window.openInvNewVersion = function() {
  if (!invHasPerm('inv_edit')) {
    if (typeof toast === 'function') toast('没有创建测算的权限', 'warning');
    return;
  }
  var copyOptions = invState.versions.map(function(v) { return '<option value="' + v.id + '">' + escHtml(v.version_name) + '</option>'; }).join('');
  var html = (typeof modalHeader === 'function' ? modalHeader('新增测算') : '<div class="modal-header">新增测算</div>') +
    '<div class="modal-body">' +
    '<div class="inv-field"><label class="inv-field-label"><span class="required">*</span> 版本名称</label><input type="text" id="inv-new-ver-name" placeholder="如：V1.0决策版"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">测算类型</label>' +
    '<select id="inv-new-ver-type"><option value="decision">决策版</option><option value="feasibility">可研版</option><option value="other">其他</option></select></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">复用历史版本（可选）</label>' +
    '<select id="inv-new-ver-copy"><option value="">不复制</option>' + copyOptions + '</select></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="inv-btn" onclick="closeModal()">取消</button>' +
    '<button class="inv-btn inv-btn-primary" id="inv-submit-new-ver" onclick="submitInvNewVersion()">创建</button>' +
    '</div>';
  if (typeof openModal === 'function') openModal(html);
};

window.submitInvNewVersion = async function() {
  var nameInput = document.getElementById('inv-new-ver-name');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    if (nameInput) { nameInput.classList.add('error'); nameInput.focus(); }
    return;
  }
  var btn = document.getElementById('inv-submit-new-ver');
  if (typeof setLoading === 'function') setLoading(btn, true);
  var newVer = {
    id: typeof uid === 'function' ? uid() : 'ver_' + Date.now(),
    project_id: currentCalcProjectId,
    version_name: name,
    calc_type: (document.getElementById('inv-new-ver-type') ? document.getElementById('inv-new-ver-type').value : null) || 'decision',
    status: 'draft',
    created_by: currentUser ? currentUser.id : null
  };
  var copyId = document.getElementById('inv-new-ver-copy') ? document.getElementById('inv-new-ver-copy').value : '';
  var result = await sb.from('invest_versions').insert(newVer);
  if (result.error) { console.error('submitInvNewVersion:', result.error); if (typeof setLoading === 'function') setLoading(btn, false); if (typeof toast === 'function') toast('创建失败', 'error'); return; }

  if (copyId) {
    // 深度复制子表数据
    var srcLandRes   = await sb.from('invest_land').select('*').eq('version_id', copyId).order('sort_order');
    var srcInputRes  = await sb.from('invest_input').select('*').eq('version_id', copyId);

    if (!srcLandRes.error && srcLandRes.data.length > 0) {
      var newLands = srcLandRes.data.map(function(l) {
        return Object.assign({}, l, { id: (typeof uid === 'function' ? uid() : 'land_' + Date.now() + Math.random()), version_id: newVer.id });
      });
      await sb.from('invest_land').insert(newLands);
    }

    if (!srcInputRes.error && srcInputRes.data.length > 0) {
      var newInputs = srcInputRes.data.map(function(r) {
        return { id: newVer.id + '_' + r.section, version_id: newVer.id, section: r.section, data: r.data };
      });
      await sb.from('invest_input').insert(newInputs);
    }

    // 复制核心指标
    var srcVer = invState.versions.find(function(v) { return v.id === copyId; });
    if (srcVer) {
      await sb.from('invest_versions').update({
        pre_tax_irr: srcVer.pre_tax_irr, after_tax_irr: srcVer.after_tax_irr,
        net_profit: srcVer.net_profit, net_margin: srcVer.net_margin,
        updated_at: new Date().toISOString()
      }).eq('id', newVer.id);
    }
  }
  if (typeof setLoading === 'function') setLoading(btn, false);
  if (typeof closeModal === 'function') closeModal();
  invLogAction('新增测算版本', '创建版本: ' + name);
  loadInvVersions(currentCalcProjectId).then(function() { renderInvVersionList(); });
  if (typeof toast === 'function') toast('测算版本创建成功', 'success');
};

// ── 编辑测算（进入 Step Wizard）──
window.openInvEditVersion = function(versionId) {
  if (!invHasPerm('inv_edit')) {
    if (typeof toast === 'function') toast('没有编辑测算的权限', 'warning');
    return;
  }
  currentEditVersionId = versionId;
  currentInvStep = 'land';
  loadInvVersionData(versionId).then(function() {
    switchInvTab('inv_edit');
  });
};

window.deleteInvVersion = async function(versionId) {
  if (typeof showConfirm === 'function') {
    showConfirm('删除测算版本', '确定删除此测算版本吗？此操作不可撤销。', async function() {
      var result = await sb.from('invest_versions').delete().eq('id', versionId);
      if (result.error) { console.error('deleteInvVersion:', result.error); if (typeof toast === 'function') toast('删除失败', 'error'); return; }
      invLogAction('删除测算版本', '删除版本: ' + versionId);
      loadInvVersions(currentCalcProjectId).then(function() { renderInvVersionList(); });
      if (typeof toast === 'function') toast('已删除', 'success');
    });
  }
};

// ── 版本状态流转 ──
window.submitInvVersion = async function(versionId) {
  var ver = invState.versions.find(function(v) { return v.id === versionId; });
  if (!ver) return;
  if (ver.status !== 'draft') { if (typeof toast === 'function') toast('只有草稿版本可以提交', 'warning'); return; }
  await sb.from('invest_versions').update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('id', versionId);
  invLogAction('提交测算版本', '版本: ' + (ver.version_name || versionId));
  loadInvVersions(currentCalcProjectId).then(function() { renderInvVersionList(); });
  if (typeof toast === 'function') toast('已提交审批', 'success');
};

window.approveInvVersion = async function(versionId) {
  if (typeof showConfirm !== 'function') return;
  showConfirm('审批通过', '确定将此版本标记为审批通过？', async function() {
    await sb.from('invest_versions').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', versionId);
    var ver = invState.versions.find(function(v) { return v.id === versionId; }) || {};
    invLogAction('审批测算版本', '版本: ' + (ver.version_name || versionId));
    loadInvVersions(currentCalcProjectId).then(function() { renderInvVersionList(); });
    if (typeof toast === 'function') toast('已审批通过', 'success');
  });
};

window.rejectInvVersion = async function(versionId) {
  if (typeof showConfirm !== 'function') return;
  showConfirm('退回草稿', '确定将此版本退回草稿状态？', async function() {
    await sb.from('invest_versions').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', versionId);
    var ver = invState.versions.find(function(v) { return v.id === versionId; }) || {};
    invLogAction('退回测算版本', '版本: ' + (ver.version_name || versionId));
    loadInvVersions(currentCalcProjectId).then(function() { renderInvVersionList(); });
    if (typeof toast === 'function') toast('已退回草稿', 'success');
  });
};

// ── 测算编辑表单（Step Wizard）──
function renderInvEditForm() {
  var main = document.getElementById('main-content');
  if (!main) return;
  if (!currentEditVersionId) {
    main.innerHTML = '<div class="inv-empty"><p>请先从测算列表中选择一个版本进行编辑</p>' +
      '<button class="inv-btn" style="margin-top:12px" onclick="switchInvTab(\'inv_calc\')">返回测算列表</button></div>';
    return;
  }
  var ver = invState.currentVersion || {};
  var proj = invState.projects.find(function(p) { return p.id === currentCalcProjectId; });

  var html = '<div class="inv-calc-toolbar">' +
    '<div style="display:flex;align-items:center;gap:12px">' +
      '<button class="inv-back-btn" onclick="switchInvTab(\'inv_calc\')">&larr; 返回测算列表</button>' +
      '<span class="inv-calc-toolbar-title">' + escHtml(proj ? proj.name : '') + ' · ' + escHtml(ver.version_name || '') + '</span>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="inv-btn inv-btn-primary" onclick="saveAndCalc()">保存并计算</button>' +
      '<button class="inv-btn" onclick="saveInvVersion()" title="仅保存，不重新计算">保存</button>' +
      '<button class="inv-btn" onclick="switchInvTab(\'inv_grid\')" title="切换到Excel式表格编辑">📊 表格编辑</button>' +
    '</div>' +
  '</div>';

  html += '<div class="inv-edit-container">';
  html += '<div class="inv-step-nav">';
  INV_STEPS.forEach(function(s) {
    var isDone = invStepHasData(s.key);
    var doneTag = isDone ? ' <span class="inv-step-done">✓</span>' : '';
    html += '<button class="inv-step-tab' + (currentInvStep === s.key ? ' active' : '') + '" onclick="switchInvStep(\'' + s.key + '\')">' + s.label + doneTag + '</button>';
  });
  html += '<span style="color:var(--text3);margin:0 8px;line-height:38px">│</span>';
  INV_OUTPUT_STEPS.forEach(function(s) { html += '<button class="inv-step-tab' + (currentInvStep === s.key ? ' active' : '') + '" onclick="switchInvStep(\'' + s.key + '\')">' + s.label + '</button>'; });
  html += '</div>';
  html += '<div class="inv-step-content">';
  switch (currentInvStep) {
    case 'land':      html += renderLandStep(); break;
    case 'product':   html += renderProductStep(); break;
    case 'cost':      html += renderCostStep(); break;
    case 'area':      html += renderAreaStep(); break;
    case 'pay':       html += renderPayStep(); break;
    case 'sales':     html += renderSalesStep(); break;
    case 'composite': html += renderOutputStep('composite', '综合指标表'); break;
    case 'vat':       html += renderOutputStep('vat', '土地增值税计算表'); break;
    case 'cashflow':  html += renderOutputStep('cashflow', '现金流量表'); break;
    case 'profit':    html += renderOutputStep('profit', '利润表'); break;
    case 'total':     html += renderOutputStep('total', '总投资输出'); break;
    case 'verify':    html += renderVerifyStep(); break;
  }
  html += '</div></div>';
  main.innerHTML = html;
  applyInvPerms();
}

window.switchInvStep = function(step) { currentInvStep = step; renderInvEditForm(); };

// ── Step 1: 土地信息 ──
function renderLandStep() {
  if (_editLands.length === 0) {
    _editLands.push({
      id: typeof uid === 'function' ? uid() : 'land_' + Date.now(),
      version_id: currentEditVersionId,
      plot_name: '地块1',
      sort_order: 0
    });
  }
  var html = '<div class="inv-land-cards">';
  _editLands.forEach(function(land, idx) {
    html += '<div class="inv-land-card">' +
      '<div class="inv-land-card-header">' +
        '<span class="inv-land-card-title">地块 ' + (idx + 1) + '：' + escHtml(land.plot_name || '未命名') + '</span>' +
        '<button class="inv-btn inv-btn-danger" onclick="removeInvLand(' + idx + ')">删除地块</button>' +
      '</div>' +
      '<div class="inv-land-card-body">';
    var fields = [
      { key: 'plot_name', label: '地块名称', type: 'text' },
      { key: 'land_area', label: '占地面积（㎡）', type: 'number' },
      { key: 'plot_ratio', label: '容积率', type: 'number' },
      { key: 'floor_area', label: '计容建面（㎡）', type: 'number' },
      { key: 'green_rate', label: '绿地率', type: 'number' },
      { key: 'car_parking', label: '机动车停车位', type: 'number' },
      { key: 'bike_parking', label: '非机动车停车位', type: 'number' },
      { key: 'land_price', label: '土地出让金（万元）', type: 'number' },
      { key: 'extra_land_fee', label: '补地价（万元）', type: 'number' },
      { key: 'manage_fee', label: '代建管理费（万元）', type: 'number' },
      { key: 'operate_rooms', label: '运营房间数量', type: 'number' }
    ];
    // 联动计算楼板价
    var floorArea = Number(land.floor_area || 0);
    var landPricePlusExtra = Number(land.land_price || 0) + Number(land.extra_land_fee || 0);
    var autoLandUnitPrice = floorArea > 0 ? (landPricePlusExtra / floorArea * 10000) : 0;
    var autoLandBidPrice  = floorArea > 0 ? (Number(land.land_price || 0) / floorArea * 10000) : 0;
    _editLands[idx].land_unit_price = autoLandUnitPrice;
    _editLands[idx].land_bid_price  = autoLandBidPrice;

    fields.forEach(function(f) {
      var val = land[f.key] != null ? String(land[f.key]) : '';
      var isTrigger = (f.key === 'land_price' || f.key === 'extra_land_fee' || f.key === 'floor_area');
      var onChange = isTrigger
        ? '_editLands[' + idx + '][\'' + f.key + '\']=parseFloat(this.value)||0; renderInvEditForm()'
        : '_editLands[' + idx + '][\'' + f.key + '\']=this.value';
      html += '<div class="inv-field"><label class="inv-field-label">' + f.label + '</label>' +
        '<input type="' + f.type + '" value="' + escHtml(val) + '" ' +
        'onchange="' + onChange + '" placeholder="' + f.label + '"></div>';
    });

    // 只读联动字段
    html += '<div class="inv-field inv-field-readonly">' +
      '<label class="inv-field-label">计容楼板价-土地成本（元/㎡）<span class="inv-auto-tag">自动</span></label>' +
      '<input type="number" value="' + autoLandUnitPrice.toFixed(0) + '" readonly style="background:var(--surface2);color:var(--text2);cursor:not-allowed"></div>';
    html += '<div class="inv-field inv-field-readonly">' +
      '<label class="inv-field-label">计容楼板价-土地出让金（元/㎡）<span class="inv-auto-tag">自动</span></label>' +
      '<input type="number" value="' + autoLandBidPrice.toFixed(0) + '" readonly style="background:var(--surface2);color:var(--text2);cursor:not-allowed"></div>';
    html += '</div></div>';
  });
  html += '</div><button class="inv-add-row-btn" style="margin-top:12px" onclick="addInvLand()">+ 新增地块</button>';
  return html;
}
window.addInvLand = function() {
  _editLands.push({ id: typeof uid === 'function' ? uid() : 'land_' + Date.now(), version_id: currentEditVersionId, plot_name: '地块' + (_editLands.length + 1), sort_order: _editLands.length });
  renderInvEditForm();
};
window.removeInvLand = function(idx) { _editLands.splice(idx, 1); renderInvEditForm(); };

// ── Step 2: 产品规划 ──
function renderProductStep() {
  if (!_editInputs.product_plan) _editInputs.product_plan = {};

  // 从土地信息汇总联动填充
  var totalLandArea  = 0;
  var totalFloorArea = 0;
  _editLands.forEach(function(l) {
    totalLandArea  += Number(l.land_area  || 0);
    totalFloorArea += Number(l.floor_area || 0);
  });
  var pp = _editInputs.product_plan;
  if (!pp['总建设面积（㎡）'] && totalFloorArea > 0) {
    pp['总建设面积（㎡）'] = totalFloorArea;
  }
  if (!pp['计容面积（㎡）'] && totalFloorArea > 0) {
    pp['计容面积（㎡）'] = totalFloorArea;
  }
  if (!pp['建筑基地面积（㎡）'] && totalLandArea > 0) {
    pp['建筑基地面积（㎡）'] = totalLandArea;
  }

  var fields = ['总建设面积（㎡）','地上建筑面积（㎡）','地下建筑面积（㎡）','计容面积（㎡）','可售/可租面积（㎡）','建筑基地面积（㎡）','车位（辆）'];
  var html = '<p style="color:var(--accent);font-size:12px;margin-bottom:12px">💡 已根据土地信息自动填充部分字段（灰色标注），可手动调整。</p>' +
    '<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>指标</th><th>值</th></tr></thead><tbody>';
  fields.forEach(function(label) {
    var val = _editInputs.product_plan[label] != null ? _editInputs.product_plan[label] : '';
    html += '<tr><td>' + label + '</td><td><input type="number" style="width:200px" value="' + String(val) + '" onchange="_editInputs.product_plan[\'' + label + '\']=parseFloat(this.value)||0"></td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

// ── Step 3: 成本分摊 ──
function renderCostStep() {
  if (!_editInputs.cost_alloc) _editInputs.cost_alloc = {};
  var items = ['大市政配套建筑单方（元/㎡）','前期开发费用（元/㎡）','建安费用（元/㎡）','公共设施配套费用（元/㎡）','市政基础设施费（元/㎡）','开发间接费用（元/㎡）','不可预见费用（元/㎡）'];
  var html = '<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>费用科目</th><th>建筑单方（元/㎡）含税</th></tr></thead><tbody>';
  items.forEach(function(label) {
    var val = _editInputs.cost_alloc[label] != null ? _editInputs.cost_alloc[label] : '';
    html += '<tr><td>' + label + '</td><td><input type="number" style="width:200px" value="' + String(val) + '" onchange="_editInputs.cost_alloc[\'' + label + '\']=parseFloat(this.value)||0"></td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

// ── Step 4: 按建面分摊 ──
function renderAreaStep() {
  if (!_editInputs.area_alloc) _editInputs.area_alloc = {};
  var cats = ['土地成本','建安成本','前期费用','公共配套','市政基础','开发间接','不可预见'];
  var html = '<p style="color:var(--text2);margin-bottom:12px">按照物业形态填写各科目的总成本、建面单方、销售单方。</p>' +
    '<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>科目</th><th>总成本（万元）</th><th>建面单方（元/㎡）</th><th>销售单方（元/㎡）</th></tr></thead><tbody>';
  cats.forEach(function(cat) {
    var d = _editInputs.area_alloc[cat] || {};
    html += '<tr><td>' + cat + '</td>' +
      '<td><input type="number" style="width:140px" value="' + ((d.total != null) ? d.total : '') + '" onchange="updateAreaAlloc(\'' + cat + '\',\'total\',this.value)"></td>' +
      '<td><input type="number" style="width:140px" value="' + ((d.floor_price != null) ? d.floor_price : '') + '" onchange="updateAreaAlloc(\'' + cat + '\',\'floor_price\',this.value)"></td>' +
      '<td><input type="number" style="width:140px" value="' + ((d.sale_price != null) ? d.sale_price : '') + '" onchange="updateAreaAlloc(\'' + cat + '\',\'sale_price\',this.value)"></td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}
window.updateAreaAlloc = function(cat, field, value) {
  if (!_editInputs.area_alloc) _editInputs.area_alloc = {};
  if (!_editInputs.area_alloc[cat]) _editInputs.area_alloc[cat] = {};
  _editInputs.area_alloc[cat][field] = parseFloat(value) || 0;
};

// ── Step 5: 支付计划 ──
function renderPayStep() {
  if (!_editInputs.pay_plan) _editInputs.pay_plan = { items: [] };
  var items = _editInputs.pay_plan.items || [];
  var cats = ['前期费','建安费','公共配套设施','市政基础设施','开发间接费','不可预见费'];
  var html = '<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>费用类别</th><th>金额（万元）</th><th>支付日期</th><th>操作</th></tr></thead><tbody>';
  html += items.map(function(item, i) {
    return '<tr>' +
      '<td><select onchange="_editInputs.pay_plan.items[' + i + '].cat=this.value">' +
      cats.map(function(c) { return '<option value="' + c + '"' + (item.cat === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
      '</select></td>' +
      '<td><input type="number" style="width:140px" value="' + ((item.amount != null) ? item.amount : '') + '" onchange="_editInputs.pay_plan.items[' + i + '].amount=parseFloat(this.value)||0"></td>' +
      '<td><input type="date" value="' + (item.pay_date || '') + '" onchange="_editInputs.pay_plan.items[' + i + '].pay_date=this.value"></td>' +
      '<td><button class="inv-btn inv-btn-danger" onclick="removePayItem(' + i + ')">删除</button></td>' +
      '</tr>';
  }).join('');
  html += '</tbody></table><button class="inv-add-row-btn" style="margin-top:8px" onclick="addPayItem()">+ 添加支付项</button></div>';
  return html;
}
window.addPayItem = function() {
  if (!_editInputs.pay_plan) _editInputs.pay_plan = { items: [] };
  if (!_editInputs.pay_plan.items) _editInputs.pay_plan.items = [];
  _editInputs.pay_plan.items.push({ cat: '前期费', amount: 0, pay_date: '' });
  renderInvEditForm();
};
window.removePayItem = function(i) { _editInputs.pay_plan.items.splice(i, 1); renderInvEditForm(); };

// ── Step 6: 销售计划 ──
function renderSalesStep() {
  if (!_editInputs.sales_plan) _editInputs.sales_plan = { items: [] };
  var items = _editInputs.sales_plan.items || [];
  var html = '<div class="inv-table-wrap"><table class="inv-table"><thead><tr><th>楼栋/业态</th><th>可售面积（㎡）</th><th>销售单价（元/㎡）</th><th>预计销售日期</th><th>操作</th></tr></thead><tbody>';
  html += items.map(function(item, i) {
    return '<tr>' +
      '<td><input type="text" style="width:120px" value="' + escHtml(item.name || '') + '" onchange="_editInputs.sales_plan.items[' + i + '].name=this.value"></td>' +
      '<td><input type="number" style="width:140px" value="' + ((item.area != null) ? item.area : '') + '" onchange="_editInputs.sales_plan.items[' + i + '].area=parseFloat(this.value)||0"></td>' +
      '<td><input type="number" style="width:140px" value="' + ((item.unit_price != null) ? item.unit_price : '') + '" onchange="_editInputs.sales_plan.items[' + i + '].unit_price=parseFloat(this.value)||0"></td>' +
      '<td><input type="date" value="' + (item.sale_date || '') + '" onchange="_editInputs.sales_plan.items[' + i + '].sale_date=this.value"></td>' +
      '<td><button class="inv-btn inv-btn-danger" onclick="removeSalesItem(' + i + ')">删除</button></td>' +
      '</tr>';
  }).join('');
  html += '</tbody></table><button class="inv-add-row-btn" style="margin-top:8px" onclick="addSalesItem()">+ 添加销售项</button></div>';
  return html;
}
window.addSalesItem = function() {
  if (!_editInputs.sales_plan) _editInputs.sales_plan = { items: [] };
  if (!_editInputs.sales_plan.items) _editInputs.sales_plan.items = [];
  _editInputs.sales_plan.items.push({ name: '', area: 0, unit_price: 0, sale_date: '' });
  renderInvEditForm();
};
window.removeSalesItem = function(i) { _editInputs.sales_plan.items.splice(i, 1); renderInvEditForm(); };

// ── 输出步骤 ──
function renderOutputStep(key, title) {
  var data = _editOutputs[key] || invState.outputs[key] || {};
  var keys = Object.keys(data).filter(function(k) { return k.indexOf('_') !== 0; });

  if (keys.length === 0) {
    return '<div class="inv-empty"><p>' + title + ' 将在运行计算后自动生成</p>' +
      '<button class="inv-btn inv-btn-primary" style="margin-top:12px" onclick="saveAndCalc()">保存并计算</button></div>';
  }

  if (key === 'cashflow' && data._byYear) {
    return renderCashflowTable(data);
  }

  var TOTAL_KEYS = ['净利润（万元）', '税前利润（万元）', '毛利润（万元）'];
  var TAX_KEYS = ['应缴增值税（万元）', '应缴土地增值税（万元）'];

  var html = '<div class="inv-output-section">' +
    '<div class="inv-output-title">' + title +
    ' <span class="badge verified">自动计算</span></div>' +
    '<div class="inv-table-wrap"><table class="inv-table inv-output-table">' +
    '<thead><tr><th>指标</th><th style="text-align:right">值</th></tr></thead><tbody>';

  keys.forEach(function(k) {
    var val = data[k];
    var isTotal = TOTAL_KEYS.indexOf(k) !== -1;
    var isTax   = TAX_KEYS.indexOf(k) !== -1;
    var rowClass = isTotal ? ' class="inv-row-total"' : (isTax ? ' class="inv-row-tax"' : '');

    var display;
    if (typeof val === 'number') {
      if (k.indexOf('率') !== -1 || k.indexOf('IRR') !== -1) {
        display = invPct(val);
      } else if (k.indexOf('（%）') !== -1) {
        display = val.toFixed(1) + '%';
      } else {
        display = invFmt(val);
      }
    } else {
      display = escHtml(String(val));
    }

    html += '<tr' + rowClass + '>' +
      '<td>' + escHtml(k) + '</td>' +
      '<td class="mono" style="text-align:right">' + display + '</td>' +
    '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

function renderCashflowTable(data) {
  var byYear = data._byYear || {};
  var years = Object.keys(byYear).map(Number).sort(function(a, b) { return a - b; });

  var html = '<div class="inv-output-section">' +
    '<div class="inv-output-title">现金流量表 <span class="badge verified">自动计算</span></div>';

  html += '<div class="inv-output-summary-row">' +
    '<span>流入合计 <strong class="inv-green">' + invFmt(data['经营性现金流入（万元）'] || 0) + ' 万元</strong></span>' +
    '<span>流出合计 <strong class="inv-red">'   + invFmt(data['经营性现金流出（万元）'] || 0) + ' 万元</strong></span>' +
    '<span>净现金流 <strong>' + invFmt(data['净现金流（万元）'] || 0) + ' 万元</strong></span>' +
  '</div>';

  if (years.length > 0) {
    html += '<div class="inv-table-wrap"><table class="inv-table inv-output-table">' +
      '<thead><tr><th>年度</th><th style="text-align:right">现金流入（万元）</th>' +
      '<th style="text-align:right">现金流出（万元）</th><th style="text-align:right">净现金流（万元）</th></tr></thead><tbody>';

    years.forEach(function(yr) {
      var cf = byYear[yr] || { in: 0, out: 0 };
      var net = (cf.in || 0) - (cf.out || 0);
      var netClass = net >= 0 ? 'inv-green' : 'inv-red';
      html += '<tr>' +
        '<td>' + yr + '</td>' +
        '<td class="mono" style="text-align:right">' + invFmt(cf.in || 0) + '</td>' +
        '<td class="mono" style="text-align:right">' + invFmt(cf.out || 0) + '</td>' +
        '<td class="mono ' + netClass + '" style="text-align:right">' + invFmt(net) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
  } else {
    html += '<p style="color:var(--text3);font-size:12px;padding:8px 0">※ 支付计划和销售计划中添加日期后，将展示逐年现金流明细</p>';
  }

  html += '</div>';
  return html;
}

// ── 计算校验 ──
function renderVerifyStep() {
  var v = _editOutputs.verify || {};
  var profit = _editOutputs.profit || {};
  var cashflow = _editOutputs.cashflow || {};
  var vatData = _editOutputs.vat || {};

  var checks = [];

  // 检查1：利润表收入 vs 现金流入
  var pRev  = Number(profit['营业总收入（万元）'] || v._profitRevenue || 0);
  var cfIn  = Number(cashflow['经营性现金流入（万元）'] || v._cashflowIn || 0);
  var diff1 = Math.abs(pRev - cfIn);
  checks.push({
    name: '利润表营业总收入 vs 现金流入',
    lhs: '利润表: ' + invFmt(pRev) + ' 万元',
    rhs: '现金流: ' + invFmt(cfIn) + ' 万元',
    pass: diff1 < 0.01
  });

  // 检查2：利润表成本 vs 现金流出
  var pCost = Number(profit['营业总成本（万元）'] || v._profitCost || 0);
  var cfOut = Number(cashflow['经营性现金流出（万元）'] || v._cashflowOut || 0);
  var diff2 = Math.abs(pCost - cfOut);
  checks.push({
    name: '利润表总成本 vs 现金流出',
    lhs: '利润表: ' + invFmt(pCost) + ' 万元',
    rhs: '现金流: ' + invFmt(cfOut) + ' 万元',
    pass: diff2 < 0.01
  });

  // 检查3：增值税核验
  var vatFromProfit = Number(profit['增值税及附加（万元）'] || v._vatFromProfit || 0);
  var vatFromVAT    = Number(vatData['应缴增值税（万元）'] || v._vatFromVAT || 0);
  var diff3 = Math.abs(vatFromProfit - vatFromVAT);
  checks.push({
    name: '增值税（利润表 vs 增值税计算表）',
    lhs: '利润表: ' + invFmt(vatFromProfit) + ' 万元',
    rhs: '增值税表: ' + invFmt(vatFromVAT) + ' 万元',
    pass: diff3 < 0.01
  });

  // 检查4：是否已运行计算
  var hasCalc = Object.keys(_editOutputs.total || {}).length > 0;
  checks.push({
    name: '计算引擎已执行',
    lhs: hasCalc ? '已运行' : '尚未运行计算',
    rhs: '',
    pass: hasCalc
  });

  var allPass = checks.every(function(c) { return c.pass; });
  var html = '<div class="inv-verify-summary ' + (allPass ? 'all-pass' : 'has-fail') + '">' +
    (allPass ? '✓ 全部校验通过' : '⚠ 存在校验异常，请检查后再提交') + '</div>';

  html += '<div class="inv-verify-grid">';
  checks.forEach(function(c) {
    html += '<div class="inv-verify-item">' +
      '<div>' +
        '<span class="inv-verify-name">' + c.name + '</span>' +
        (c.lhs ? '<div class="inv-verify-detail"><span class="inv-verify-val">' + c.lhs + '</span><span class="inv-verify-val">' + c.rhs + '</span></div>' : '') +
      '</div>' +
      '<span class="inv-verify-result ' + (c.pass ? 'pass' : 'fail') + '">' +
        (c.pass ? '✓ 通过' : '✗ 异常') + '</span>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

// ── Step 完成度辅助 ──
function invStepHasData(stepKey) {
  switch (stepKey) {
    case 'land':    return _editLands.length > 0 && Number(_editLands[0].land_area || 0) > 0;
    case 'product': return !!(_editInputs.product_plan && _editInputs.product_plan['总建设面积（㎡）']);
    case 'cost':    return !!(_editInputs.cost_alloc && Object.values(_editInputs.cost_alloc).some(function(v) { return Number(v) > 0; }));
    case 'area':    return !!(_editInputs.area_alloc && Object.keys(_editInputs.area_alloc).length > 0);
    case 'pay':     return !!(_editInputs.pay_plan && _editInputs.pay_plan.items && _editInputs.pay_plan.items.length > 0);
    case 'sales':   return !!(_editInputs.sales_plan && _editInputs.sales_plan.items && _editInputs.sales_plan.items.length > 0);
    default: return false;
  }
}

window.saveAndCalc = async function() {
  runInvCalculation();
  await saveInvVersion();
};

// ── 保存测算 ──
window.saveInvVersion = async function() {
  if (!currentEditVersionId) return;
  // 保存土地
  for (var i = 0; i < _editLands.length; i++) {
    var land = _editLands[i];
    land.version_id = currentEditVersionId;
    land.sort_order = i;
    await sb.from('invest_land').upsert(land);
  }
  // 保存输入
  var inputSections = ['product_plan', 'cost_alloc', 'area_alloc', 'pay_plan', 'sales_plan'];
  for (var s = 0; s < inputSections.length; s++) {
    var sec = inputSections[s];
    if (_editInputs[sec]) {
      await sb.from('invest_input').upsert({ id: currentEditVersionId + '_' + sec, version_id: currentEditVersionId, section: sec, data: _editInputs[sec] });
    }
  }
  // 保存输出
  var outputSections = ['composite', 'vat', 'cashflow', 'profit', 'total', 'verify'];
  for (var o = 0; o < outputSections.length; o++) {
    var osec = outputSections[o];
    if (_editOutputs[osec]) {
      await sb.from('invest_output').upsert({ id: currentEditVersionId + '_' + osec, version_id: currentEditVersionId, section: osec, data: _editOutputs[osec] });
    }
  }
  // 更新版本核心指标
  var updateData = { updated_at: new Date().toISOString() };
  if (_editOutputs.total) {
    var t = _editOutputs.total;
    if (t.pre_tax_irr != null) updateData.pre_tax_irr = t.pre_tax_irr;
    if (t.after_tax_irr != null) updateData.after_tax_irr = t.after_tax_irr;
    if (t.net_profit != null) updateData.net_profit = t.net_profit;
    if (t.net_margin != null) updateData.net_margin = t.net_margin;
  }
  await sb.from('invest_versions').update(updateData).eq('id', currentEditVersionId);
  invLogAction('保存测算', '保存测算版本: ' + currentEditVersionId);
  loadInvVersionData(currentEditVersionId).then(function() { renderInvEditForm(); });
  if (typeof toast === 'function') toast('测算保存成功', 'success');
};

// ── 运行计算 ──
window.runInvCalculation = function() {
  var product  = _editInputs.product_plan || {};
  var cost     = _editInputs.cost_alloc  || {};
  var sales    = (_editInputs.sales_plan  && _editInputs.sales_plan.items)  || [];
  var payItems = (_editInputs.pay_plan    && _editInputs.pay_plan.items)    || [];

  // ── 1. 总收入 ──
  var totalRevenue = 0;
  sales.forEach(function(s) {
    totalRevenue += (Number(s.area || 0) * Number(s.unit_price || 0));
  });
  totalRevenue = totalRevenue / 10000;

  // ── 2. 总成本 ──
  var landCost = 0;
  _editLands.forEach(function(l) {
    landCost += Number(l.land_price || 0) + Number(l.extra_land_fee || 0) + Number(l.manage_fee || 0);
  });
  var buildArea = Number(product['总建设面积（㎡）'] || 0);
  var buildCost = 0;
  Object.keys(cost).forEach(function(k) {
    buildCost += (Number(cost[k]) || 0) * buildArea / 10000;
  });
  var totalCost = landCost + buildCost;

  // ── 3. 净利润 & 净利润率 ──
  var grossProfit = totalRevenue - totalCost;
  var vat = totalRevenue * 0.05;
  var landVAT = Math.max(0, grossProfit - vat) * 0.30;
  var corpTax = Math.max(0, grossProfit - vat - landVAT) * 0.25;
  var netProfit = grossProfit - vat - landVAT - corpTax;
  var netMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0;

  // ── 4. IRR（基于现金流时间序列）──
  var cashflows = buildCashflowByYear(payItems, sales, _editLands);
  var preTaxIRR = null;
  var afterTaxIRR = null;

  if (cashflows.length >= 2) {
    preTaxIRR = calcIRR(cashflows);
    afterTaxIRR = calcAfterTaxIRR(cashflows);
  }

  if (preTaxIRR === null && totalCost > 0) {
    preTaxIRR = calcIRR([-totalCost, totalRevenue]);
    afterTaxIRR = preTaxIRR !== null ? calcAfterTaxIRR([-totalCost, totalRevenue]) : null;
  }

  if (preTaxIRR === null)  preTaxIRR  = 0;
  if (afterTaxIRR === null) afterTaxIRR = 0;

  // ── 5. 填充输出对象 ──
  _editOutputs.total = {
    '总投资（万元）':  totalCost,
    '总收入（万元）':  totalRevenue,
    '税前IRR':         preTaxIRR,
    '税后IRR':         afterTaxIRR,
    '净利润（万元）':  netProfit,
    '净利润率':        netMargin,
    pre_tax_irr:   preTaxIRR,
    after_tax_irr: afterTaxIRR,
    net_profit:    netProfit,
    net_margin:    netMargin
  };

  _editOutputs.composite = {
    '总建设面积（㎡）':     Number(product['总建设面积（㎡）'] || 0),
    '计容面积（㎡）':       Number(product['计容面积（㎡）']   || 0),
    '可售/可租面积（㎡）': Number(product['可售/可租面积（㎡）'] || 0),
    '总投资（万元）':     totalCost,
    '楼板价-土地成本（元/㎡）': _editLands[0] ? Number(_editLands[0].land_unit_price || 0) : 0,
    '总收入（万元）':     totalRevenue,
    '税前IRR':            preTaxIRR,
    '税后IRR':            afterTaxIRR,
    '净利润率':           netMargin
  };

  // 现金流量表（按年）
  var cfByYear = {};
  (payItems || []).forEach(function(item) {
    if (!item.pay_date) return;
    var yr = new Date(item.pay_date + 'T00:00:00').getFullYear();
    if (!cfByYear[yr]) cfByYear[yr] = { in: 0, out: 0 };
    cfByYear[yr].out += Number(item.amount || 0);
  });
  (sales || []).forEach(function(s) {
    if (!s.sale_date) return;
    var yr = new Date(s.sale_date + 'T00:00:00').getFullYear();
    var rev = (Number(s.area || 0) * Number(s.unit_price || 0)) / 10000;
    if (!cfByYear[yr]) cfByYear[yr] = { in: 0, out: 0 };
    cfByYear[yr].in += rev;
  });
  _editOutputs.cashflow = {
    '经营性现金流入（万元）': totalRevenue,
    '经营性现金流出（万元）': totalCost,
    '净现金流（万元）':       totalRevenue - totalCost,
    _byYear: cfByYear
  };

  _editOutputs.profit = {
    '营业总收入（万元）': totalRevenue,
    '营业总成本（万元）': totalCost,
    '毛利润（万元）':     grossProfit,
    '增值税及附加（万元）': vat,
    '土地增值税（万元）': landVAT,
    '税前利润（万元）':   grossProfit - vat - landVAT,
    '企业所得税（万元）': corpTax,
    '净利润（万元）':     netProfit,
    '净利润率':           netMargin
  };

  _editOutputs.vat = {
    '销售收入（万元）':   totalRevenue,
    '增值税率（%）':      5,
    '应缴增值税（万元）': vat,
    '土地增值税增益基数（万元）': Math.max(0, grossProfit - vat),
    '适用税率（简化30%）（%）': 30,
    '应缴土地增值税（万元）': landVAT
  };

  _editOutputs.verify = {
    _profitRevenue:  totalRevenue,
    _cashflowIn:     totalRevenue,
    _profitCost:     totalCost,
    _cashflowOut:    totalCost,
    _vatFromProfit:  vat,
    _vatFromVAT:     vat
  };

  if (typeof toast === 'function') toast('计算完成', 'success');
  renderInvEditForm();
};

// ── 操作日志 ──
function renderInvLogs() {
  var main = document.getElementById('main-content');
  if (!main) return;
  main.innerHTML = '<div class="inv-calc-toolbar">' +
    '<span class="inv-calc-toolbar-title">操作日志</span></div>' +
    '<div class="inv-empty"><p>操作日志请查看系统设置的「日志审计」页面</p>' +
    '<p style="font-size:12px;margin-top:4px">所有测算操作已记录在系统的 logs 表中</p>' +
    '<button class="inv-btn" style="margin-top:16px" onclick="switchModule(\'settings\');setTimeout(function(){openSettingsPage(\'logs\')},100)">前往日志审计</button></div>';
}

window.renderInvVersionList = renderInvVersionList;
window.renderInvEditForm = renderInvEditForm;
window.renderInvLogs = renderInvLogs;
