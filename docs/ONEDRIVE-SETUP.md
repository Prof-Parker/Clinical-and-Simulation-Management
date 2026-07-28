# OneDrive setup for faculty

Use this guide to keep semester data on **college OneDrive** while using the installable app from GitHub Pages.

**App URL:** https://prof-parker.github.io/Clinical-and-Simulation-Management/

No Microsoft API is used — you manage `.json` files directly in OneDrive.

## Recommended folder layout

Keep file types in separate folders so the save/open picker is less confusing:

```
ProgramData/
├── users/
│   ├── users-registry.json
│   └── *.user.json
├── semesters/
│   └── F2026_REGN_program.json      ← live team master
├── playgrounds/
│   └── user_F2026_REGN15P_playground.json
├── clinical-sites-library.json
└── theory-content-library_REGN15.json
```

The app stamps each JSON with `meta.fileKind` (or root `fileKind` on user credential files) and **blocks accidental overwrites** across types — especially playground → live semester.

## File naming cheatsheet

| Kind | Example name |
|------|----------------|
| Program semester | `F2026_REGN_program.json`, `F2026_REGN15P.json` |
| Playground | `user_F2026_REGN15P_playground.json` (save only under `playgrounds/`) |
| Users registry | `users-registry.json` |
| User credential | `lastname.user.json` |
| Clinical sites | `clinical-sites-library.json` |
| Theory library | `theory-content-library_REGN15.json` |

## Create a semester file (desktop)

1. Install/open the app on your computer (Chrome or Edge recommended)
2. Set up your semester in **Setup**
3. Menu → **File Management** → **New OneDrive file** → save into the **`semesters/`** folder (e.g. `F2026_REGN_program.json`)
4. Next time: **Connect OneDrive file** → select the same file for automatic saving

## Playground saves (faculty)

1. Open the **Playground** tab and load or import a sandbox
2. Use **Save playground** (reuses the last playground file) or **Save playground as…**
3. Save only under **`playgrounds/`** with a `user_*_playground.json` name
4. Never choose files from `semesters/` in the playground save dialog — the app will block overwriting the live master

## iPad: open a file from OneDrive

1. Install the app: Safari → Share → **Add to Home Screen**
2. Open the installed app
3. Menu → **Open semester file…**
4. Tap **Browse** (bottom of the picker) → **OneDrive** → navigate to your **`semesters/`** folder → select the `.json` file

If the file does not appear, pull down to refresh the OneDrive folder, or open it once in the OneDrive app so it syncs to Files. The app no longer filters by file type on iPad so all files in the folder should be visible.

If you open a **playground** file at sign-in step 3, the app blocks it and asks you to use the Playground tab instead.

## iPad: save changes back to OneDrive

1. Menu → **Export backup**
2. In the share/save sheet, choose **Save to Files** → **OneDrive**
3. Replace the existing file or save with a dated name

## iPad: export schedule to Excel

1. Open the **Dashboard** tab and apply any filters you want reflected in the export
2. On **Master Interactive Schedule**, tap **Export to Excel**
3. In the share/save sheet, choose **Save to Files** → **OneDrive**

The workbook is for reference only (disclaimer at top of each sheet). Use the app for the current schedule and **Export backup** for full semester data.

## Audit closeout (end of semester)

At semester end, the program exports an **audit PDF**, obtains **digital signatures** outside the app (Adobe Acrobat or college e-sign), and files the signed PDF in a **master repository** folder on OneDrive. The signed PDF is the official clinical-hours record; the working `.json` file is operational data only.

Full checklist and roles: [AUDIT_TRACKING_OPERATIONS.md](AUDIT_TRACKING_OPERATIONS.md)

Process diagram: [audit_tracking_workflow.md](../audit_tracking_workflow.md)

## Tips

- One program semester `.json` file can hold multiple courses in `semesters[]`
- Keep the master file in a shared OneDrive folder your team controls
- Do **not** put semester files in the GitHub project folder
- Placeholder names in the app (`Student 1`, etc.) are demo data only — replace with your roster after opening your real file
- File-kind guards prevent mistakes; OneDrive folder permissions remain the real access control
