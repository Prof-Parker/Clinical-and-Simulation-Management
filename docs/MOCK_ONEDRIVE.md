# Mock OneDrive (local testing)

The `mock-onedrive/` folder simulates college OneDrive storage for local development. **It is gitignored and must never be committed** (may contain test roster placeholders).

## Setup

From the project root:

```bash
node scripts/seed-mock-onedrive.js
```

This creates:

```
mock-onedrive/
├── users/
│   ├── users-registry.json
│   ├── engineer.user.json
│   ├── admin.user.json
│   ├── lead-faculty.user.json
│   └── adjunct.user.json
├── semesters/
│   ├── F2026_REGN15P.json
│   └── F2026_REGN15P_Faculty.json
├── playgrounds/
│   └── user_F2026_REGN15P_playground.json
└── clinical-sites-library.json
```

All names use placeholders only (`Student 1`, `Program Engineer`, etc.).

## Test workflows

1. Open the app (local server or GitHub Pages build).
2. **Sign in:** Menu → **Load user file…** → pick `mock-onedrive/users/admin.user.json` (or another role file).
3. **Registry:** Menu → **Connect users registry…** → pick `mock-onedrive/users/users-registry.json`.
4. **Semester:** Menu → **Connect OneDrive file** → `mock-onedrive/semesters/F2026_REGN15P.json`.

### Role files

| File | Role | Use to test |
|------|------|-------------|
| `engineer.user.json` | Program Engineer | All tabs, user management |
| `admin.user.json` | Admin Staff | Batch semester, approve proposals, audit |
| `lead-faculty.user.json` | Lead Course Faculty | Propose setup changes, playground |
| `adjunct.user.json` | Adjunct Faculty | Dashboard read-only, sim roles |

### Tamper test

Edit `admin.user.json` locally and change a field — validation should fail unless the key still matches `users-registry.json`.

## Notes

- File System Access requires picking files through the browser; paths are not auto-wired.
- Re-run the seed script to reset keys and data.
- Production data belongs in real OneDrive, not this folder.
