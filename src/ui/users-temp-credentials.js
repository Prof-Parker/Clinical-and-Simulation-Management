/**
 * One-time temporary credential display, clipboard, and text export helpers.
 */

import { escapeHtml, showDialog } from './dialogs.js';

function esc(text) {
  return escapeHtml(text == null ? '' : String(text));
}

function formatTempCredentialTxt(email, password, expiresAt) {
  return [
    'College email: ' + email,
    'Temporary password: ' + password,
    'Expires: ' + expiresAt,
    '',
    'Sign in to the ADN Scheduling app with this temporary password,',
    'then set a new password when prompted. This temporary password expires in 72 hours.',
    '',
    'Delivery: place this file in ProgramData/temp-credentials/ for Power Automate',
    'to grant View access and send an invite link. Do not put the password in email.'
  ].join('\n');
}

function buildTempCredentialFilename(lastName, dateIsoDay) {
  var safeLast = String(lastName || 'user')
    .replace(/[^\w-]+/g, '-')
    .toLowerCase() || 'user';
  return 'temp-password_' + safeLast + '_' + dateIsoDay + '.txt';
}

function exportTempPasswordTxt(email, password, expiresAt, lastName) {
  var date = new Date().toISOString().slice(0, 10);
  var filename = buildTempCredentialFilename(lastName, date);
  var blob = new Blob([formatTempCredentialTxt(email, password, expiresAt)], {
    type: 'text/plain'
  });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function copyTemporaryPassword(password, copyBtn) {
  var done = function () {
    copyBtn.textContent = 'Copied';
    setTimeout(function () { copyBtn.textContent = 'Copy password'; }, 1500);
  };
  var fallback = function () {
    var input = document.getElementById('usersTempPasswordValue');
    if (!input) return;
    input.select();
    document.execCommand('copy');
    done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(password).then(done).catch(fallback);
  } else {
    fallback();
  }
}

function showTemporaryCredentialDialog(title, opts) {
  var email = opts.email;
  var password = opts.password;
  var expiresAt = opts.expiresAt;
  var lastName = opts.lastName;
  var fullName = opts.fullName || email;
  showDialog(
    title,
    '<p class="dialog-message">Temporary password for <strong>' + esc(fullName) +
      '</strong> (' + esc(email) + '). It expires at <strong>' + esc(expiresAt) +
      '</strong> and must be changed at next sign-in.</p>' +
    '<label class="section-sub" for="usersTempPasswordValue">Temporary password</label>' +
    '<input id="usersTempPasswordValue" type="text" readonly value="' + esc(password) +
      '" style="width:100%;margin:0.25rem 0 0.75rem;font-family:monospace">' +
    '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">' +
    '<button type="button" class="btn btn-sm" id="usersTempCopyBtn">Copy password</button>' +
    '<button type="button" class="btn btn-sm" id="usersTempExportBtn">Export .txt</button>' +
    '</div>' +
    '<p class="section-sub">Export the .txt to <code>ProgramData/temp-credentials/</code> ' +
      'for Power Automate delivery. Do not put the password in ordinary email.</p>',
    function () { /* Done */ }
  );
  var saveBtn = document.getElementById('dialogSave');
  var cancelBtn = document.getElementById('dialogCancel');
  if (saveBtn) saveBtn.textContent = 'Done';
  if (cancelBtn) cancelBtn.style.display = 'none';
  var copyBtn = document.getElementById('usersTempCopyBtn');
  var exportBtn = document.getElementById('usersTempExportBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      copyTemporaryPassword(password, copyBtn);
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      exportTempPasswordTxt(email, password, expiresAt, lastName);
    });
  }
}

export {
  formatTempCredentialTxt,
  buildTempCredentialFilename,
  exportTempPasswordTxt,
  showTemporaryCredentialDialog
};
