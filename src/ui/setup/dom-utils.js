/** Shared HTML escaping and list-row helpers for setup UI. */

export function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

export function configListAddRow(actionClass, label) {
  return '<div class="config-list-add-row">' +
    '<button type="button" class="btn btn-sm ' + actionClass + '">' + label + '</button>' +
    '</div>';
}
