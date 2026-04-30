/* ════════════════════════════════════════════════
 * pm-auth.js  —  修改密码 / 键盘事件
 * ════════════════════════════════════════════════ */

// ─── Password Change ─────────────────────────────────────────────────────────
function openChangePasswordModal() {
  openModal(`${modalHeader('修改密码')}
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">当前密码</label>
        <input type="password" class="form-input" id="pwd-old" placeholder="输入当前密码" autocomplete="current-password">
      </div>
      <div class="form-group">
        <label class="form-label">新密码</label>
        <input type="password" class="form-input" id="pwd-new" placeholder="至少 6 位字符" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label class="form-label">确认新密码</label>
        <input type="password" class="form-input" id="pwd-confirm" placeholder="再次输入新密码" autocomplete="new-password" onkeydown="if(event.key==='Enter')submitChangePassword(document.getElementById('pwd-submit-btn'))">
      </div>
      <div id="pwd-err" style="display:none;color:var(--red);font-size:12px;padding:8px 12px;background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--radius-sm);margin-top:-4px"></div>
    </div>
    <div class="modal-footer">
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" id="pwd-submit-btn" onclick="submitChangePassword(this)">确认修改</button>
      </div>
    </div>`);
  setTimeout(() => document.getElementById('pwd-old').focus(), 80);
}

async function submitChangePassword(btn) {
  const oldPwd     = document.getElementById('pwd-old').value;
  const newPwd     = document.getElementById('pwd-new').value;
  const confirmPwd = document.getElementById('pwd-confirm').value;
  const errEl      = document.getElementById('pwd-err');

  const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
  errEl.style.display = 'none';

  if (!oldPwd || !newPwd || !confirmPwd) return showErr('所有字段不能为空');
  if (oldPwd !== currentUser.password)  return showErr('当前密码不正确');
  if (newPwd.length < 6)               return showErr('新密码至少需要 6 位字符');
  if (newPwd !== confirmPwd)            return showErr('两次输入的新密码不一致');
  if (newPwd === oldPwd)               return showErr('新密码不能与当前密码相同');

  setLoading(btn, true);
  const { error } = await sb.from('members').update({ password: newPwd }).eq('id', currentUser.id);
  setLoading(btn, false);

  if (error) { showErr('更新失败，请重试'); return; }

  currentUser.password = newPwd;
  localStorage.setItem('pm_session', JSON.stringify(currentUser));
  closeModal();
  toast('✓ 密码已成功修改');
  logAction('修改密码', '修改了登录密码');
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape') closeModal();
  if ((e.metaKey||e.ctrlKey)&&e.key==='k') { e.preventDefault(); openAddTask(); }
});






