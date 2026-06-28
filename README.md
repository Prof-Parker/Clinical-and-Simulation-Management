# Clinical & Simulation Management

Browser-based app for REGN 15P cohort scheduling, clinical and simulation requirement tracking, role assignments, and printable student calendars.

## Running locally

Open [`index.html`](index.html) in a modern browser (Chrome/Edge recommended on desktop; Safari on iPad).

Data is loaded from browser storage or via **Import JSON** / **Open File** in the app menu. On desktop, you can connect to a `.json` file in OneDrive for auto-save.

## Data policy

**This Git repository stores source code only. It must never contain real student data.**

| Safe in Git | Never in Git |
|-------------|--------------|
| HTML, CSS, JavaScript source | Exported `.json` semester files |
| Placeholder names (`Student 1` … `Student 30`) in code | Real student names, schedules, roles, faculty rosters |
| App configuration defaults | Browser IndexedDB / localStorage dumps |

Real semester data lives in:

- **Export JSON** / **Save** from the app menu → store in OneDrive or another secure location **outside** this repo folder
- Browser IndexedDB cache (automatic, local to each device)

Because this project folder may sync via OneDrive, do not save `regn-tracker.json` or other exports here. If you do, `.gitignore` will exclude them from Git — but keeping exports elsewhere is safer.

## Pre-commit hook (recommended)

A hook blocks accidental commits of JSON data files. Enable it once per clone:

```powershell
git config core.hooksPath .githooks
```

On Git Bash / macOS / Linux:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
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
3. Use [git filter-repo](https://github.com/newren/git-filter-repo) or GitHub support to purge the data from history, or rotate to a fresh repository if unsure.
4. Prevention is critical — history on GitHub is difficult to fully erase.

## Project layout

```
index.html          Entry point
css/                Styles (app + print)
js/                 Application logic and UI modules
000_sim_clinical_tracker.md   Original scope notes
```

## License / use

Internal academic use. See project maintainer for questions.
