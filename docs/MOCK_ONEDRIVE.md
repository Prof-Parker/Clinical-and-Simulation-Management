# Mock OneDrive (local testing)

The `mock-onedrive/` folder simulates college OneDrive storage for local development. **It is gitignored and must never be committed** (may contain test roster placeholders).

## Setup

From the project root:

```bash
node scripts/seed-mock-onedrive.js
```

Or: `npm run seed:mock-onedrive`

This creates:

```
mock-onedrive/
├── users/
│   └── users-registry.json
├── semesters/
│   └── F2026_REGN_program.json   ← Fall 2026 program file (REGN15P + REGN35P-36P)
├── program-content-library.json  ← preferred program-wide topics/skills (courseIds tags)
├── theory-content-library_REGN15.json  ← legacy seed; still loads as migration fallback
├── playgrounds/
│   └── user_F2026_REGN15P_playground.json
└── clinical-sites-library.json
```

Sign-in is **email + password** against `users-registry.json`. Identity `*.user.json` files are no longer seeded.

Theory calendar data is imported from Fall 2026 prototypes under `docs/Design Docs/protypes/`:

- REGN 15/15P from the lecture / coordinator / detailed **docx** files
- REGN 35/35P from `35.xlsx` (lecture, skills, orientation, clinical, and sim events with Faculty Needed slots)
- REGN 36/36P hardcoded seed: Mercy OB/PEDS clinicals (groups C1–C4), OP Peds sims (one shared faculty series), and Maternal-Child / Pediatric lectures

`F2026_REGN_program.json` contains **two** in-file semesters for the same term: REGN 15/15P (practicum scheduler runs) and REGN 35P-36P (events only — practicum generate is skipped). Faculty Schedule inventories **both** semesters. Clinical sites include Mercy Medical Center Redding (`MMCR`, MS) for 35 clinicals and `MMCR OB/PED` for 36P Mercy OB/PEDS clinicals.

All names use placeholders only (`Student 1`, `Program Engineer`, etc.).

Seeded JSON includes `meta.fileKind` so local testing matches production guards. Legacy files without `fileKind` still open via inference until the next save stamps the kind.

## Quick start (recommended for local UI testing)

```bash
npm run dev:start
```

This seeds `mock-onedrive/` if needed, starts Vite on [http://localhost:5173](http://localhost:5173), opens the browser, connects ProgramData to `mock-onedrive/`, signs in as **engineer@example.edu**, and opens `F2026_REGN_program.json`.

Uses a DEV-only virtual folder (Vite middleware) so you do not have to click through the OS folder picker. Production builds never include this path.

## Manual test workflows

1. Open the app (local server or GitHub Pages build).
2. **Connect ProgramData:** pick the `mock-onedrive/` folder (or classic **Connect users registry…** → `mock-onedrive/users/users-registry.json`).
3. **Sign in** with a demo email/password from the table below.
4. **Semester:** open from ProgramData `semesters/` or classic load of `mock-onedrive/semesters/F2026_REGN_program.json`.
5. **Program content library (optional):** Connect `mock-onedrive/program-content-library.json` if seeded, or legacy `theory-content-library_REGN15.json` (migrates to `courseIds` tags).
6. **Playground:** Playground tab → Import `mock-onedrive/playgrounds/user_F2026_REGN15P_playground.json`. Saving over `F2026_REGN_program.json` should be blocked.

### Demo accounts (permanent passwords for local testing)

| Email | Role | Specialties | Password |
|------|------|-------------|----------|
| `engineer@example.edu` | Program Engineer | — | `engineer-pass` |
| `admin@example.edu` | Admin Staff | — | `admin-pass` |
| `lead@example.edu` | Full Time Faculty | MS, Lec | `lead-pass` |
| `lead-ob@example.edu` | Full Time Faculty | OB, Lec | `lead-ob-pass` |
| `lead-ped@example.edu` | Full Time Faculty | PED, Lec | `lead-ped-pass` |
| `lead-obped@example.edu` | Full Time Faculty | OB, PED, Lec | `lead-obped-pass` |
| `adjunct@example.edu` | Adjunct Faculty | MS | `adjunct-pass` |
| `adjunct-ob@example.edu` | Adjunct Faculty | OB | `adjunct-ob-pass` |
| `adjunct-ped@example.edu` | Adjunct Faculty | PED | `adjunct-ped-pass` |

Seeded demo accounts are **not** temporary passwords (`mustChangePassword: false`). Users created or reset in the Users tab get generated temporary passwords (72-hour expiry + forced change).

## Notes

- Prefer `npm run dev:start` for a one-command UI session; it auto-wires `mock-onedrive/` in DEV.
- Manual File System Access still requires picking folders/files through the browser.
- Re-run the seed script to reset registry and sample semester data.
- Production data belongs in real OneDrive, not this folder.
