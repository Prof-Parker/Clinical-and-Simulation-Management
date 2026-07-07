/* global App */
var App = App || {};
App.UI = App.UI || {};

/** Phase 6 placeholder — theory / adjunct scheduling (not yet implemented). */
App.UI.TheoryStub = (function () {
  function render() {
    var el = document.getElementById('theoryStubPanel');
    if (!el) return;
    el.innerHTML = '<p class="section-sub">Theory course and adjunct scheduling features are planned for a future release.</p>';
  }

  function init() {}

  return { init: init, render: render };
})();
