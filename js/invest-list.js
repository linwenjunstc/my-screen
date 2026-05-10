/* ════════════════════════════════════════════════
 * invest-list.js — 投资项目列表 / 项目信息（含走势图）
 * ════════════════════════════════════════════════ */

// ── 搜索条件 ──
var invSearchName = '';
var invSearchStatus = 'all';

window.onInvSearch = function() {
  invSearchName = (document.getElementById('inv-search-name') ? document.getElementById('inv-search-name').value : '').trim();
  var sel = document.getElementById('inv-search-status');
  invSearchStatus = sel ? sel.value : 'all';
  renderInvProjectList();
};

window.onInvSearchReset = function() {
  invSearchName = '';
  invSearchStatus = 'all';
  var nameInput = document.getElementById('inv-search-name');
  var statusSelect = document.getElementById('inv-search-status');
  if (nameInput) nameInput.value = '';
  if (statusSelect) statusSelect.value = 'all';
  renderInvProjectList();
};

window.openInvProjectDetail = function(projId) {
  currentCalcProjectId = projId;
  loadInvVersions(projId).then(function() { switchInvTab('inv_calc'); });
};

window.openInvProjectInfo = function(projId) {
  var proj = invState.projects.find(function(p) { return p.id === projId; });
  if (!proj) return;
  // 先加载版本数据再弹窗
  loadInvVersions(projId).then(function() {
    var versions = invState.versions.filter(function(v) { return v.project_id === projId; });
    var html = (typeof modalHeader === 'function' ? modalHeader(escHtml(proj.name) + ' · 指标走势') : '<div class="modal-header">' + escHtml(proj.name) + ' · 指标走势</div>') +
      '<div class="modal-body" style="max-height:60vh;overflow-y:auto">' +
      '<div class="inv-chart-row">' +
      '<div class="inv-chart-card"><div class="inv-chart-card-title">税后IRR走势</div>' +
      '<div class="inv-chart-canvas" style="display:flex;align-items:flex-end;gap:6px;padding:12px 0">' +
      buildBarChartHTML(versions, 'after_tax_irr', 'pct') +
      '</div></div>' +
      '<div class="inv-chart-card"><div class="inv-chart-card-title">净利润率走势</div>' +
      '<div class="inv-chart-canvas" style="display:flex;align-items:flex-end;gap:6px;padding:12px 0">' +
      buildBarChartHTML(versions, 'net_margin', 'pct') +
      '</div></div>' +
      '</div></div>' +
      '<div class="modal-footer"><button class="inv-btn" onclick="closeModal()">关闭</button></div>';
    if (typeof openModal === 'function') openModal(html);
  });
};

function buildBarChartHTML(versions, field, format) {
  if (!versions || versions.length === 0) return '<div class="inv-empty">暂无数据</div>';
  var maxVal = 0;
  versions.forEach(function(v) {
    var val = Math.abs(Number(v[field]) || 0);
    if (val > maxVal) maxVal = val;
  });
  if (maxVal === 0) maxVal = 1;
  return versions.map(function(v) {
    var val = Number(v[field]) || 0;
    var height = Math.max(4, Math.abs(val) / maxVal * 200);
    var color = val >= 0 ? 'var(--green)' : 'var(--red)';
    var displayVal = format === 'pct' ? invPct(val) : invFmt(val);
    return '<div style="display:flex;flex-direction:column;align-items:center;min-width:40px;flex:1">' +
      '<span style="font-size:10px;color:var(--text3);margin-bottom:4px">' + displayVal + '</span>' +
      '<div style="width:100%;max-width:36px;height:' + height + 'px;background:' + color + ';border-radius:4px 4px 0 0" title="' + escHtml(v.version_name || '') + ': ' + displayVal + '"></div>' +
      '<span style="font-size:9px;color:var(--text3);margin-top:4px;text-align:center;word-break:break-all">' + escHtml(v.version_name || '') + '</span>' +
      '</div>';
  }).join('');
}

// ── 项目列表渲染 ──
async function renderInvProjectList() {
  var main = document.getElementById('main-content');
  if (!main) return;
  await loadInvProjects();

  // 批量拉取各项目最新版本指标
  var projIds = invState.projects.map(function(p) { return p.id; });
  if (projIds.length > 0) {
    var verResult = await sb.from('invest_versions')
      .select('id,project_id,after_tax_irr,net_margin,net_profit,updated_at')
      .in('project_id', projIds)
      .order('updated_at', { ascending: false });
    if (!verResult.error && verResult.data) {
      invState._projectLatestVer = {};
      verResult.data.forEach(function(v) {
        if (!invState._projectLatestVer[v.project_id]) {
          invState._projectLatestVer[v.project_id] = v;
        }
      });
    }
  }

  var filtered = invState.projects.filter(function(p) {
    if (invSearchName && p.name.toLowerCase().indexOf(invSearchName.toLowerCase()) === -1) return false;
    if (invSearchStatus !== 'all' && p.status !== invSearchStatus) return false;
    return true;
  });

  var html = '';
  html += '<div class="inv-search-bar">' +
    '<input type="text" id="inv-search-name" placeholder="项目名称..." value="' + escHtml(invSearchName) + '" onkeydown="if(event.key===\'Enter\')onInvSearch()">' +
    '<select id="inv-search-status"><option value="all"' + (invSearchStatus === 'all' ? ' selected' : '') + '>全部状态</option><option value="active"' + (invSearchStatus === 'active' ? ' selected' : '') + '>进行中</option><option value="archived"' + (invSearchStatus === 'archived' ? ' selected' : '') + '>已归档</option></select>' +
    '<button class="inv-btn inv-btn-primary" onclick="onInvSearch()">查询</button>' +
    '<button class="inv-btn" onclick="onInvSearchReset()">重置</button>' +
    '<div style="flex:1"></div>' +
    '<button class="inv-btn inv-btn-primary" onclick="openInvAddProject()" data-menu-key="inv_edit">+ 新建项目</button>' +
    '</div>';

  if (filtered.length === 0) {
    html += '<div class="inv-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg><p>暂无投资项目</p><p style="font-size:12px;margin-top:4px">点击右上角「新建项目」开始</p></div>';
  } else {
    html += '<div class="inv-project-list">';
    html += filtered.map(function(p) {
      var landDate = p.land_date ? p.land_date : '--';
      var endDate = p.end_date ? p.end_date : '--';
      var statusClass = p.status === 'active' ? 'inv-status-active' : 'inv-status-archived';
      var statusLabel = p.status === 'active' ? '进行中' : '已归档';

      var latestVer = (invState._projectLatestVer || {})[p.id];
      var irrBlock = latestVer
        ? '<div class="inv-project-kpis">' +
            '<div class="inv-kpi"><span class="inv-kpi-label">税后IRR</span>' +
              '<span class="inv-kpi-val ' + (Number(latestVer.after_tax_irr) >= 0.08 ? 'inv-green' : 'inv-red') + '">' +
              invPct(latestVer.after_tax_irr) + '</span></div>' +
            '<div class="inv-kpi"><span class="inv-kpi-label">净利润率</span>' +
              '<span class="inv-kpi-val">' + invPct(latestVer.net_margin) + '</span></div>' +
            '<div class="inv-kpi"><span class="inv-kpi-label">净利润</span>' +
              '<span class="inv-kpi-val">' + invFmt(latestVer.net_profit) + '万</span></div>' +
          '</div>'
        : '<div class="inv-project-kpis inv-kpis-empty">暂无测算数据</div>';

      return '<div class="inv-project-card">' +
        '<div class="inv-project-card-header" data-menu-key="inv_calc" onclick="openInvProjectDetail(\'' + p.id + '\')">' +
          '<span class="inv-project-name">' + escHtml(p.name) + '</span>' +
          '<span class="inv-project-status ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="inv-project-meta" data-menu-key="inv_calc" onclick="openInvProjectDetail(\'' + p.id + '\')">' +
          '<div class="inv-project-meta-item">拿地时间 <span>' + landDate + '</span></div>' +
          '<div class="inv-project-meta-item">结束时间 <span>' + endDate + '</span></div>' +
        '</div>' +
        irrBlock +
        '<div class="inv-project-card-actions">' +
          '<button class="inv-btn inv-btn-sm" onclick="event.stopPropagation();openInvEditProject(\'' + p.id + '\')" data-menu-key="inv_edit">编辑</button>' +
          '<button class="inv-btn inv-btn-sm" onclick="event.stopPropagation();toggleInvProjectStatus(\'' + p.id + '\',\'' + p.status + '\')" data-menu-key="inv_edit">' +
            (p.status === 'active' ? '归档' : '激活') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    html += '</div>';
  }

  main.innerHTML = html;
  applyInvPerms();
}

// ── 项目编辑 ──
window.openInvEditProject = function(projId) {
  if (!invHasPerm('inv_edit')) {
    if (typeof toast === 'function') toast('没有编辑权限', 'warning'); return;
  }
  var proj = invState.projects.find(function(p) { return p.id === projId; });
  if (!proj) return;

  var html = (typeof modalHeader === 'function' ? modalHeader('编辑投资项目') : '<div class="modal-header">编辑投资项目</div>') +
    '<div class="modal-body">' +
    '<div class="inv-field"><label class="inv-field-label"><span class="required">*</span> 项目名称</label>' +
    '<input type="text" id="inv-edit-proj-name" value="' + escHtml(proj.name) + '"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">拿地时间</label>' +
    '<input type="date" id="inv-edit-proj-land" value="' + (proj.land_date || '') + '"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">结束时间</label>' +
    '<input type="date" id="inv-edit-proj-end" value="' + (proj.end_date || '') + '"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="inv-btn" onclick="closeModal()">取消</button>' +
    '<button class="inv-btn inv-btn-primary" id="inv-submit-edit-proj" ' +
    'onclick="submitInvEditProject(\'' + projId + '\')">保存</button></div>';

  if (typeof openModal === 'function') openModal(html);
};

window.submitInvEditProject = async function(projId) {
  var nameEl = document.getElementById('inv-edit-proj-name');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) { if (nameEl) { nameEl.classList.add('error'); nameEl.focus(); } return; }
  var btn = document.getElementById('inv-submit-edit-proj');
  if (typeof setLoading === 'function') setLoading(btn, true);
  var updateData = {
    name: name,
    land_date: (document.getElementById('inv-edit-proj-land') ? document.getElementById('inv-edit-proj-land').value : null) || null,
    end_date:  (document.getElementById('inv-edit-proj-end')  ? document.getElementById('inv-edit-proj-end').value  : null) || null,
    updated_at: new Date().toISOString()
  };
  var result = await sb.from('invest_projects').update(updateData).eq('id', projId);
  if (typeof setLoading === 'function') setLoading(btn, false);
  if (result.error) { if (typeof toast === 'function') toast('保存失败', 'error'); return; }
  if (typeof closeModal === 'function') closeModal();
  invLogAction('编辑投资项目', '修改项目: ' + name);
  renderInvProjectList();
  if (typeof toast === 'function') toast('项目已更新', 'success');
};

window.toggleInvProjectStatus = async function(projId, currentStatus) {
  var newStatus = currentStatus === 'active' ? 'archived' : 'active';
  var label = newStatus === 'archived' ? '归档' : '激活';
  if (typeof showConfirm !== 'function') return;
  showConfirm(label + '项目', '确定要' + label + '此项目吗？', async function() {
    var result = await sb.from('invest_projects')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', projId);
    if (result.error) { if (typeof toast === 'function') toast('操作失败', 'error'); return; }
    invLogAction(label + '投资项目', '项目ID: ' + projId);
    renderInvProjectList();
    if (typeof toast === 'function') toast('已' + label, 'success');
  });
};

// ── 新建项目弹窗 ──
window.openInvAddProject = function() {
  if (!invHasPerm('inv_edit')) {
    if (typeof toast === 'function') toast('没有创建项目的权限', 'warning');
    return;
  }
  var html = (typeof modalHeader === 'function' ? modalHeader('新建投资项目') : '<div class="modal-header">新建投资项目</div>') +
    '<div class="modal-body">' +
    '<div class="inv-field"><label class="inv-field-label"><span class="required">*</span> 项目名称</label><input type="text" id="inv-new-name" placeholder="请输入项目名称"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">拿地时间</label><input type="date" id="inv-new-land-date"></div>' +
    '<div class="inv-field" style="margin-top:12px"><label class="inv-field-label">结束时间</label><input type="date" id="inv-new-end-date"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="inv-btn" onclick="closeModal()">取消</button>' +
    '<button class="inv-btn inv-btn-primary" id="inv-submit-new-proj" onclick="submitInvAddProject()">创建</button>' +
    '</div>';
  if (typeof openModal === 'function') openModal(html);
};

window.submitInvAddProject = async function() {
  var nameInput = document.getElementById('inv-new-name');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    if (nameInput) { nameInput.classList.add('error'); nameInput.focus(); }
    return;
  }
  var btn = document.getElementById('inv-submit-new-proj');
  if (typeof setLoading === 'function') setLoading(btn, true);
  var newProj = {
    id: typeof uid === 'function' ? uid() : 'inv_' + Date.now(),
    name: name,
    land_date: (document.getElementById('inv-new-land-date') ? document.getElementById('inv-new-land-date').value : null) || null,
    end_date: (document.getElementById('inv-new-end-date') ? document.getElementById('inv-new-end-date').value : null) || null,
    status: 'active',
    created_by: currentUser ? currentUser.id : null
  };
  var result = await sb.from('invest_projects').insert(newProj);
  if (typeof setLoading === 'function') setLoading(btn, false);
  if (result.error) { console.error('submitInvAddProject:', result.error); if (typeof toast === 'function') toast('创建失败', 'error'); return; }
  if (typeof closeModal === 'function') closeModal();
  invLogAction('新增投资项目', '创建项目: ' + name);
  loadInvProjects().then(function() { renderInvProjectList(); });
  if (typeof toast === 'function') toast('项目创建成功', 'success');
};

// 暴露到 window
window.renderInvProjectList = renderInvProjectList;
