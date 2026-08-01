# Clinical & Simulation Management

Browser-based app for REGN 15P cohort scheduling, clinical and simulation requirement tracking, role assignments, and printable student calendars.

**Live app (PWA):** https://prof-parker.github.io/Clinical-and-Simulation-Management/

On the **Dashboard**, use **Export to Excel** on the Master Interactive Schedule panel to download a filtered `.xlsx` workbook (master schedule + sim progression sheets). The same summary area hosts **Makeup clinicals week N** (clinical clustering modes) and **Consolidate thin sim sessions** (multi-pass thin-sim post-pass)—both are explicit actions, not part of regenerate.

On **Student View**, use **Export .ics** for one student, or **Batch export…** to download a ZIP of per-student calendar PDFs, Outlook/iCal `.ics` files, and a Power Automate CSV (see [docs/POWER_AUTOMATE_STUDENT_CALENDARS.md](docs/POWER_AUTOMATE_STUDENT_CALENDARS.md)).

## Docs for implementers

- [PROJECT_IMPLEMENTATION_GUIDE.md](PROJECT_IMPLEMENTATION_GUIDE.md) — architecture, scheduling pipeline, Week-17 / thin-sim post-passes (§5.1)
- [docs/Design Docs/Scheduling_rules.md](docs/Design%20Docs/Scheduling_rules.md) — scheduling contract (including one scenario per day)
- [docs/Design Docs/week17_makeup_clustering_and_sim_soft_floor.md](docs/Design%20Docs/week17_makeup_clustering_and_sim_soft_floor.md) — makeup clustering + soft floor design notes

## Install the app

### iPad (Safari)

1. Open the live app URL above in **Safari**
2. Tap **Share** → **Add to Home Screen**
3. Tap **Add** — the app opens full-screen like a native app

On first launch, use **Open semester file…** (menu) and choose your `.json` from **Files → OneDrive**.

### Desktop (Chrome / Edge)

1. Open the live app URL
2. Click the **Install** banner or the install icon in the address bar
3. For **auto-sync to OneDrive:** use **Connect OneDrive file** and select a `.json` in your OneDrive-synced folder — changes save automatically

### Local development

```powershell
npm install
npm run dev:start
```

Seeds `mock-onedrive/` if needed, starts Vite on http://localhost:5173, opens the browser, connects ProgramData, and signs in as engineer. Details: [docs/MOCK_ONEDRIVE.md](docs/MOCK_ONEDRIVE.md).

```powershell
npm run dev           # Vite only (manual sign-in)
npm test              # Vitest unit tests
npm run build         # Production bundle → dist/
npm run check:line-limit  # Enforce 500-line cap per src module
```

## Data policy (FERPA)

**GitHub stores source code only — never real student data.**

| Location | Contains |
|----------|----------|
| **GitHub / GitHub Pages** | App code, placeholder `Student N` names in demo data |
| **College OneDrive** | Real semester `.json` files (rosters, schedules, faculty) |
| **Device IndexedDB** | Local working copy on that iPad or computer |

Real semester data lives in:

- **Connect ProgramData folder…** (desktop) / **Open copy…** / **Download backup** from the app menu
- Store `.json` files in college OneDrive — **not** in this Git repository

Because this project folder may sync via OneDrive, do not save `regn-tracker.json` exports here. [`.gitignore`](.gitignore) blocks `.json` commits as a safety net.

See [docs/ONEDRIVE-SETUP.md](docs/ONEDRIVE-SETUP.md) for folder layout and the role × file-action matrix.

## Sync by platform

| Feature | Desktop + ProgramData folder | iPad PWA |
|---------|------------------------------|----------|
| Auto-save to `.json` file | Yes (ProgramData / Sync link) | No — Safari limitation |
| Auto-save on device | Yes (IndexedDB) | Yes (IndexedDB) |
| OneDrive sync | Via linked folder / Sync | Manual **Download backup** |
| Offline app shell | Yes, after first visit | Yes, after first visit |

### Desktop auto-sync workflow

1. Keep the shared **ProgramData** folder on OneDrive
2. In the app: **Connect ProgramData folder…** → sign in → open a file from `semesters/`
3. Edit as usual — use **Sync to OneDrive** when the header shows unsaved changes

### iPad workflow

1. Install the PWA from Safari (see above)
2. Sign in (classic / limited mode) → **Load semester file…** → Files → OneDrive → `semesters/` → select `.json`
3. Work on the iPad — data saves locally between sessions
4. When done: **Download backup** → save to OneDrive in the Files app (replace the same semester file)
5. **Export to Excel** from the Master Interactive Schedule panel (respects current filters) → save the `.xlsx` to OneDrive via the share sheet for reference viewing in Excel

## Pre-commit hook (developers)

```powershell
git config core.hooksPath .githooks
```

## Pre-push checklist

Before every commit or push:

- [ ] `git status` shows no `.json` files
- [ ] No exported semester files were copied into the project folder
- [ ] Source code uses only placeholder student names (`Student N`), not real rosters
- [ ] No screenshots or notes with real names were added

## If student data was accidentally committed

1. **Stop pushing** immediately.
2. Do not assume deleting the file in a new commit removes it from history.
3. Use [git filter-repo](https://github.com/newren/git-filter-repo) or GitHub support to purge the data from history.
4. Prevention is critical — history on GitHub is difficult to fully erase.

## Project layout

```
index.html              Vite entry (loads src/main.js)
package.json            npm scripts and dependencies (Chart.js, SheetJS)
vite.config.js          Vite + PWA plugin
src/
  main.js               Boot, menu, tab routing
  core/                 State, data model, scheduler engine
  storage/              JSON file persistence (semester, users, faculty)
  auth/                 Roles, sessions, permissions
  ui/                   Tab modules (dashboard, setup, audit, etc.)
public/
  icons/                App icons
  manifest.webmanifest  PWA manifest
css/                    Styles (app + print)
tests/                  Vitest unit tests
dist/                   Build output (deployed to GitHub Pages)
```

## GitHub Pages deployment

Pushes to `main` run tests, line-limit check, and Vite build, then deploy `dist/` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). The workflow publishes the app to the **`gh-pages`** branch.

### First-time setup (required once)

1. In **Settings → Actions → General → Workflow permissions**, select **Read and write permissions**, then Save.
2. Wait for the **Deploy GitHub Pages** workflow to finish on `main` (creates the `gh-pages` branch automatically — do not create it manually).
3. Open **Repository Settings → Pages**.
4. Under **Build and deployment → Source**, select **Deploy from a branch** (not GitHub Actions).
5. Set **Branch:** `gh-pages` and **Folder:** `/ (root)`, then **Save**.

Live URL: https://prof-parker.github.io/Clinical-and-Simulation-Management/

If deployment fails, check the Actions tab for the workflow log.

Internal academic use. See project maintainer for questions.
