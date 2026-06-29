# Clinical & Simulation Management

Browser-based app for REGN 15P cohort scheduling, clinical and simulation requirement tracking, role assignments, and printable student calendars.

**Live app (PWA):** https://prof-parker.github.io/Clinical-and-Simulation-Management/

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

Open [`index.html`](index.html) in a browser. Service worker registration requires `localhost` or HTTPS.

## Data policy (FERPA)

**GitHub stores source code only — never real student data.**

| Location | Contains |
|----------|----------|
| **GitHub / GitHub Pages** | App code, placeholder `Student N` names in demo data |
| **College OneDrive** | Real semester `.json` files (rosters, schedules, faculty) |
| **Device IndexedDB** | Local working copy on that iPad or computer |

Real semester data lives in:

- **Connect OneDrive file** / **Open semester file…** / **Export backup** from the app menu
- Store `.json` files in college OneDrive — **not** in this Git repository

Because this project folder may sync via OneDrive, do not save `regn-tracker.json` exports here. [`.gitignore`](.gitignore) blocks `.json` commits as a safety net.

## Sync by platform

| Feature | Desktop + OneDrive folder | iPad PWA |
|---------|---------------------------|----------|
| Auto-save to `.json` file | Yes (Connect OneDrive file) | No — Safari limitation |
| Auto-save on device | Yes (IndexedDB) | Yes (IndexedDB) |
| OneDrive sync | Via synced folder file | Manual export/import |
| Offline app shell | Yes, after first visit | Yes, after first visit |

### Desktop auto-sync workflow

1. Save your semester file to a OneDrive-synced folder on your PC
2. In the app: **Connect OneDrive file** → select that `.json`
3. Edit as usual — the app writes back to the file automatically

### iPad workflow

1. Install the PWA from Safari (see above)
2. **Open semester file…** → Files → OneDrive → select `.json`
3. Work on the iPad — data saves locally between sessions
4. When done: **Export backup** → save to OneDrive in the Files app

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
index.html              Entry point
manifest.webmanifest    PWA manifest
sw.js                   Service worker (offline app shell)
icons/                  App icons
vendor/chart.umd.min.js Chart.js (bundled for offline use)
css/                    Styles (app + print)
js/                     Application logic and UI modules
```

## GitHub Pages deployment

Pushes to `main` deploy automatically via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

First-time setup: Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## License / use

Internal academic use. See project maintainer for questions.
