# Legacy & Deprecated Code Assessment

**Project:** Clinical & Simulation Management (REGN 15P cohort PWA)  
**Assessment date:** 2025-06-30  
**Status:** In development; not formally released (live GitHub Pages deployment exists)

---

## Project overview

| Aspect | Details |
|--------|---------|
| **App type** | Browser-based PWA for nursing cohort scheduling, requirement tracking, role assignments, printable calendars |
| **Tech stack** | Vanilla JavaScript (no bundler, no `package.json`), HTML/CSS, IndexedDB, File System Access API, service worker, Chart.js (vendored) |
| **Data** | Multi-semester `.json` on OneDrive; separate sim-faculty `.json`; IndexedDB cache on device |
| **Deployment** | GitHub Actions → `gh-pages` (static rsync, no build step) |
| **Tests** | Node.js VM harness in `tests/` (not run in CI) |

### Key directories

```
index.html              Entry point + all view markup
js/                     Core logic (state, data-model, storage, scheduler, etc.)
js/ui/                  Tab modules (dashboard, setup, roles, etc.)
css/                    app.css, print.css
sw.js                   Service worker (offline shell)
tests/                  scheduling-rules, roster-balance, sim-faculty-storage
docs/ONEDRIVE-SETUP.md
```

No `.deprecated`, `.bak`, `.backup`, or old-version folders were found in the repository.

---

## Executive summary

| Category | Verdict |
|----------|---------|
| **UI legacy (config modal)** | Safe to remove after minor rewiring |
| **Dead exports / unused functions** | Safe to remove |
| **Data migration paths** | **Keep** — active on import and first load |
| **`Scheduler.copyForward()`** | Product decision — dead code today, may be intended behavior |
| **Infrastructure gaps (`sw.js`, icons)** | Fix alongside cleanup — not legacy, but broken |

**Bottom line:** UI legacy and confirmed dead code can be removed in a focused cleanup. Data migration code should stay until file format is versioned and old exports/localStorage are confirmed gone.

---

## Safe to remove

### 1. Config modal UI (explicitly marked legacy)

**Location:** `index.html` lines 417–439 (HTML comment: *"legacy — new semester flow uses Setup tab"*)

The modal DOM (`#configModal` and child elements) has **no JavaScript event listeners**. Scheduling configuration now lives in the Setup tab via `js/ui/setup-config.js` (`#setupAdvancedPanel`, etc.).

**Also remove:**
- `js/ui/config-modal.js` — thin shim that only redirects to Setup
- `.config-modal-footer*` styles in `css/app.css` (lines 610–612)
- Script tag and `sw.js` precache entry for `config-modal.js`

**Rewire before removal:** `main.js` line 82 calls `App.UI.ConfigModal.openForNewSemester()` on the `+` semester button. Replace with:

```javascript
if (App.UI.SetupConfig) App.UI.SetupConfig.beginNewSemesterFlow();
```

The shim’s other methods are unused or no-ops:
- `open()` — never called externally
- `close()` / `save()` — empty stubs
- `init()` — empty comment only

---

### 2. Dead exports (zero call sites)

| Item | File | Notes |
|------|------|-------|
| `cellToLegacyString()` | `js/data-model.js` | Old compact cell encoding (`C`/`S`/`H`/`M`); exported but never called |
| `migrate` alias | `js/data-model.js` | Duplicate of `migrateFile()`; exported as `migrate: migrate`, never called |
| `maxPerSimGroup` | `js/data-model.js` `defaultConfig()` | Set to `8`; scheduler uses `maxStudentsPerSimSession` instead |

---

### 3. `.gitignore` prototype entry (optional)

`.gitignore` line 23 lists `Clinical Schedule.html` under "Prototype files." That file is not in the repo. The ignore rule can be removed if the prototype no longer exists anywhere.

---

## Do not remove (active migration paths)

These are not leftover UI — they run on real imports and first-load paths. Even pre-release, the live GitHub Pages deployment means beta users may already have older data shapes.

### 1. `localStorage` migration

| File | Function / symbol |
|------|-------------------|
| `js/data-model.js` | `migrateFromLegacyLocalStorage()` |
| `js/storage.js` | `LEGACY_LOCAL_STORAGE_KEYS`, `clearLegacyLocalStorage()` |

**Keys:** `nursingWeekDates`, `nursingStudentNames`, `nursingSimRoles`

**When it runs:** `storage.js` `init()` when IndexedDB cache is empty; keys cleared on "Clear storage & restore defaults."

**Caveat:** `nursingWeekDates` is read but **never applied** to the migrated file (only names and roles are used). Partial dead logic inside an active path — could be simplified later, but do not delete the whole migration without a data-version plan.

---

### 2. Single-semester JSON → multi-semester file

| File | Function |
|------|----------|
| `js/data-model.js` | `migrateFile()` (lines 485–517) |

Wraps a lone semester object into the current `fileRoot` format (`meta` + `semesters[]`). All imports go through this path.

---

### 3. Sim roles embedded in semester file → separate sim-faculty file

| File | Symbols |
|------|---------|
| `js/sim-faculty-data.js` | `migrateRolesFromFileRoot()`, `cloneFileRootWithoutRoles()`, `semester.roles`, `_legacySimRoles` |
| `js/sim-faculty-storage.js` | `migrateFromSemesterFile()` |
| `js/storage.js` | `serialize()` strips roles on export |
| `tests/sim-faculty-storage.test.js` | Tests migration of `sem.roles` and `_legacySimRoles` |

Intentional data-model migration, not dead code. Old semester JSON files may still contain `roles` or `_legacySimRoles`.

---

## Needs product decision

### `Scheduler.copyForward()` vs "Copy Forward Semester" button

| What | Behavior |
|------|----------|
| **Button** (`js/ui/setup.js` ~730) | Calls `App.addSemester()` → full schedule regeneration |
| **`copyForward()`** (`js/scheduler.js` ~1160) | Copies semester JSON, preserves schedules, resets absences/makeups, advances start date — **never wired up** |

The original scope doc (`000_sim_clinical_tracker.md`) describes copy-forward as carrying over clinical/sim days. `copyForward()` is closer to that intent; the button does not use it.

**Options:**
1. **Remove** `copyForward()` as abandoned implementation (safe for code, loses intended behavior).
2. **Wire** the button to `copyForward()` (product fix).
3. **Clarify** button label/UX if `addSemester()` behavior is intentional.

---

## Duplicate / refactor candidates (not dead)

| Duplication | Locations | Notes |
|-------------|-----------|-------|
| `esc()` HTML escape | `js/ui/student-view.js`, `js/ui/sim-roles.js` | Identical local helpers — refactor candidate |
| Add-semester flows | `+` button, `copyForwardBtn`, `setupSaveAddSemesterBtn` | Three overlapping paths with different intent |

---

## Infrastructure gaps (fix, not remove)

### Service worker precache drift

`sw.js` is missing scripts that `index.html` loads:

- `js/roster-balance.js`
- `js/feasibility.js`
- `js/sim-faculty-data.js`
- `js/sim-faculty-storage.js`

**Risk:** Offline PWA may fail after first visit when those modules are requested uncached.

### Missing icon assets

Referenced in `manifest.webmanifest`, `index.html`, and `sw.js` but **not present** in repo:

- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-180.png`

Only `icons/favicon.svg` exists.

### Tests not in CI

`tests/` exist but `.github/workflows/deploy-pages.yml` only deploys — no test job.

---

## Pattern search summary

| Pattern | Matches in app code |
|---------|---------------------|
| `deprecated` | 0 |
| `legacy` | `index.html` comment; migration code in `storage.js`, `data-model.js`, `sim-faculty-data.js`; test fixtures |
| `TODO remove` | 0 |
| `obsolete` | 0 |
| `migration` | `migrateFromLegacyLocalStorage`, `migrateRolesFromFileRoot`, `migrateFromSemesterFile`, `migrateFile`, `migrateSemester` |

No large commented-out code blocks were found.

---

## Recommended work plan

| Priority | Task | Effort | Risk |
|----------|------|--------|------|
| **1** | Fix `sw.js` precache list (add 4 missing scripts) | Small | Fixes offline PWA |
| **2** | Remove orphaned `#configModal` HTML + CSS; route `+` button to `SetupConfig` | Small | Low — only explicitly marked legacy UI |
| **3** | Remove `config-modal.js`; remove `cellToLegacyString`, `migrate` alias, `maxPerSimGroup` | Small | Pure dead code |
| **4** | Add missing PNG icons or update manifest/HTML references | Small | PWA install polish |
| **5** | Decide Copy Forward: wire `copyForward()` or remove function + clarify button | Medium | Product correctness |
| **6** | Keep all data migration paths | — | Data integrity until format is versioned |

### Suggested PR sequence

1. **PR 1 — Infrastructure:** `sw.js` precache + icons (or manifest fix).
2. **PR 2 — UI legacy removal:** config modal HTML/CSS, `config-modal.js`, `main.js` rewiring.
3. **PR 3 — Dead code:** `cellToLegacyString`, `migrate` alias, `maxPerSimGroup`.
4. **PR 4 — Copy Forward** (after product decision).

Do **not** remove migration paths in PRs 1–3 unless `fileVersion` is bumped and old data is confirmed absent.

---

## Reference: live callers before cleanup

```
main.js:82          App.UI.ConfigModal.openForNewSemester()
main.js:156         App.UI.ConfigModal.init()
storage.js:374      App.DataModel.migrateFromLegacyLocalStorage()
storage.js:175,253  App.DataModel.migrateFile()
sim-faculty-storage.js:101  App.SimFacultyData.migrateRolesFromFileRoot()
setup.js:730        copyForwardBtn → App.addSemester() (not Scheduler.copyForward)
```

---

## Open questions for tomorrow

1. Are any faculty devices still using pre-IndexedDB `localStorage` keys?
2. Do any OneDrive exports use single-semester format or embedded `roles`?
3. Should "Copy Forward Semester" preserve schedules (`copyForward`) or regenerate (`addSemester`)?
4. Add PNG icons to repo, or point manifest at SVG-only?
