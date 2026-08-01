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
│   └── F2026_REGN_program.json   ← consolidated term file (theory + REGN15P)
├── theory-content-library_REGN15.json
├── playgrounds/
│   └── user_F2026_REGN15P_playground.json
└── clinical-sites-library.json
```

Sign-in is **email + password** against `users-registry.json`. Identity `*.user.json` files are no longer seeded.

Theory calendar data is imported from the Fall 2026 prototype docx files under `docs/Design Docs/protypes/`.

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
5. **Theory library (optional):** Connect `mock-onedrive/theory-content-library_REGN15.json` when the app supports it.
6. **Playground:** Playground tab → Import `mock-onedrive/playgrounds/user_F2026_REGN15P_playground.json`. Saving over `F2026_REGN_program.json` should be blocked.

### Demo accounts (permanent passwords for local testing)

| Email | Role | Password |
|------|------|----------|
| `engineer@example.edu` | Program Engineer | `engineer-pass` |
| `admin@example.edu` | Admin Staff | `admin-pass` |
| `lead@example.edu` | Lead Course Faculty | `lead-pass` |
| `adjunct@example.edu` | Adjunct Faculty | `adjunct-pass` |

Seeded demo accounts are **not** temporary passwords (`mustChangePassword: false`). Users created or reset in the Users tab get generated temporary passwords (72-hour expiry + forced change).

## Notes

- Prefer `npm run dev:start` for a one-command UI session; it auto-wires `mock-onedrive/` in DEV.
- Manual File System Access still requires picking folders/files through the browser.
- Re-run the seed script to reset registry and sample semester data.
- Production data belongs in real OneDrive, not this folder.
