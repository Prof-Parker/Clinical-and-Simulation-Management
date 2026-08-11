/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadIndexHtml } from './ui-dom-harness.js';
import { applySetupFinalizedLock } from '../src/ui/setup/setup-lock.js';

describe('applySetupFinalizedLock', function () {
  beforeEach(function () {
    loadIndexHtml();
  });

  it('disables static setup controls when finalized', function () {
    var sortBtn = document.getElementById('sortRosterAzBtn');
    expect(sortBtn.disabled).toBe(false);

    applySetupFinalizedLock({ meta: { finalized: true } });

    expect(sortBtn.disabled).toBe(true);
    expect(sortBtn.dataset.finalizedDisabled).toBe('1');
    expect(document.getElementById('view-setup').classList.contains('setup-finalized-locked')).toBe(true);
  });

  it('re-enables static setup controls on unlock without a page reload', function () {
    var sortBtn = document.getElementById('sortRosterAzBtn');
    applySetupFinalizedLock({ meta: { finalized: true } });
    expect(sortBtn.disabled).toBe(true);

    applySetupFinalizedLock({ meta: { finalized: false } });

    expect(sortBtn.disabled).toBe(false);
    expect(sortBtn.dataset.finalizedDisabled).toBeUndefined();
    expect(document.getElementById('view-setup').classList.contains('setup-finalized-locked')).toBe(false);
  });

  it('leaves widget-owned disabled state alone across lock/unlock', function () {
    var nameEl = document.getElementById('leadFacultyName');
    nameEl.disabled = true;

    applySetupFinalizedLock({ meta: { finalized: true } });
    applySetupFinalizedLock({ meta: { finalized: false } });

    expect(nameEl.disabled).toBe(true);
    expect(nameEl.dataset.finalizedDisabled).toBeUndefined();
  });

  it('keeps Finalize/Unlock available while setup is finalized', function () {
    var finalizeBtn = document.getElementById('finalizeSemesterBtn');
    applySetupFinalizedLock({ meta: { finalized: true } });
    expect(finalizeBtn.disabled).toBe(false);
  });
});
