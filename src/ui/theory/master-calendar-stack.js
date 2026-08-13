/**
 * Theory Master stacked sections for 3rd-semester dual theory calendars.
 */

import { formatCourseDisplayLabel } from '../semester-label.js';
import { escHtml, escAttr } from '../setup/dom-utils.js';

/**
 * Build stacked <details> panels HTML for each theory course code.
 * @param {string[]} courseCodes
 * @param {function(string): string} buildGridHtml — returns calendar HTML for a courseCode
 * @returns {string}
 */
export function buildStackedMasterHtml(courseCodes, buildGridHtml) {
  var codes = courseCodes || [];
  if (codes.length <= 1) {
    return buildGridHtml(codes[0] || null);
  }
  var panels = codes.map(function (code, idx) {
    var label = formatCourseDisplayLabel(code) || code;
    var open = idx === 0 ? ' open' : '';
    return '<details class="card dash-overview-panel dashboard-panel-details theory-master-course-panel"' +
      open + ' data-theory-course="' + escAttr(code) + '">' +
      '<summary class="dashboard-panel-summary">' +
      '<div class="dashboard-panel-summary-text">' +
      '<h4 class="section-title" style="margin:0">' + escHtml(label) + '</h4>' +
      '<p class="section-sub" style="margin:0.35rem 0 0">Theory and skills calendar for this course.</p>' +
      '</div>' +
      '<div class="dashboard-panel-summary-actions">' +
      '<span class="dashboard-panel-chevron" aria-hidden="true">▼</span>' +
      '</div></summary>' +
      '<div class="dashboard-panel-body theory-master-course-body" data-theory-course-grid="' +
      escAttr(code) + '">' +
      buildGridHtml(code) +
      '</div></details>';
  }).join('');

  return '<div class="theory-master-stack-toolbar no-print">' +
    '<button type="button" class="btn btn-sm" id="theoryMasterExpandAll">Expand all</button>' +
    '<button type="button" class="btn btn-sm" id="theoryMasterCollapseAll">Collapse all</button>' +
    '</div>' +
    '<div class="dash-overview-stack theory-master-course-stack">' + panels + '</div>';
}

export function bindStackExpandCollapse(root) {
  if (!root) return;
  var expand = root.querySelector('#theoryMasterExpandAll');
  var collapse = root.querySelector('#theoryMasterCollapseAll');
  function setAll(open) {
    root.querySelectorAll('.theory-master-course-panel').forEach(function (el) {
      el.open = open;
    });
  }
  if (expand) expand.onclick = function () { setAll(true); };
  if (collapse) collapse.onclick = function () { setAll(false); };
}
