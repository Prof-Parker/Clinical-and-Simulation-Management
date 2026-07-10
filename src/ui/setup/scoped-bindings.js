/** Scoped event binding and sticky offset helpers for live + playground setup. */

import { getSetupScope, setSetupScope, LIVE, PLAYGROUND } from './scope.js';

export function bindScoped(logicalId, event, handler) {
  [LIVE, PLAYGROUND].forEach(function (scope) {
    var el = document.getElementById(scope.prefix + logicalId);
    if (!el) return;
    el.addEventListener(event, function (e) {
      setSetupScope(scope);
      handler(e);
    });
  });
}

export function bindScopedContainer(logicalId, event, handler) {
  [LIVE, PLAYGROUND].forEach(function (scope) {
    var el = document.getElementById(scope.prefix + logicalId);
    if (!el || el.dataset['bound' + event]) return;
    el.dataset['bound' + event] = '1';
    el.addEventListener(event, function (e) {
      setSetupScope(scope);
      handler(e);
    });
  });
}

export function updateSetupStickyOffset() {
  var sticky = document.querySelector('.sticky-top');
  var top = sticky ? sticky.offsetHeight : 136;
  document.documentElement.style.setProperty('--setup-sticky-top', top + 'px');
}

export function scrollSetupToTop() {
  var scope = getSetupScope();
  var view = document.getElementById(scope.viewId);
  if (!view || !view.classList.contains('active')) return;
  var target = view.querySelector('.setup-actions-sticky') || view;
  var sticky = document.querySelector('.sticky-top');
  var offset = (sticky ? sticky.offsetHeight : 0) + 8;
  var top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}
