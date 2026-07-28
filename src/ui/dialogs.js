/** Modal dialog helpers (#dialogModal) — alert, confirm, and custom body. */

const _dialogDefaults = {
  saveLabel: 'Save',
  cancelLabel: 'Cancel'
};

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dialogMessageHtml(text) {
  var escaped = escapeHtml(text);
  var parts = escaped.split(/\n\n/);
  return parts.map(function (p) {
    return '<p class="dialog-message">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

export function closeDialog() {
  var modal = document.getElementById('dialogModal');
  var saveBtn = document.getElementById('dialogSave');
  var cancelBtn = document.getElementById('dialogCancel');
  var extraBtn = document.getElementById('dialogExtra');
  if (modal) modal.classList.remove('open');
  var content = modal && modal.querySelector('.modal-content');
  if (content) content.style.maxWidth = '28rem';
  if (saveBtn) {
    saveBtn.textContent = _dialogDefaults.saveLabel;
    saveBtn.className = 'btn btn-primary';
    saveBtn.style.display = '';
  }
  if (cancelBtn) {
    cancelBtn.textContent = _dialogDefaults.cancelLabel;
    cancelBtn.style.display = '';
  }
  if (extraBtn) {
    extraBtn.textContent = 'Extra';
    extraBtn.className = 'btn';
    extraBtn.style.display = 'none';
  }
}

function _bindDialogPrimary(onPrimary) {
  var saveBtn = document.getElementById('dialogSave');
  var newSave = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  newSave.addEventListener('click', function () {
    closeDialog();
    if (onPrimary) onPrimary();
  });
  return newSave;
}

export function showConfirm(title, message, onConfirm, options) {
  options = options || {};
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = dialogMessageHtml(message);
  var cancelBtn = document.getElementById('dialogCancel');
  cancelBtn.style.display = '';
  var saveBtn = _bindDialogPrimary(onConfirm);
  saveBtn.textContent = options.confirmLabel || 'OK';
  document.getElementById('dialogModal').classList.add('open');
}

export function showAlert(title, message, onOk) {
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = dialogMessageHtml(message);
  document.getElementById('dialogCancel').style.display = 'none';
  var saveBtn = _bindDialogPrimary(onOk);
  saveBtn.textContent = 'OK';
  document.getElementById('dialogModal').classList.add('open');
}

export function showDialog(title, bodyHtml, onSave) {
  document.getElementById('dialogTitle').textContent = title;
  document.getElementById('dialogBody').innerHTML = bodyHtml;
  document.getElementById('dialogCancel').style.display = '';
  _bindDialogPrimary(onSave);
  document.getElementById('dialogModal').classList.add('open');
}
