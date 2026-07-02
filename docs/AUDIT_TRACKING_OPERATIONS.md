# Audit tracking — operations guide

Standard operating procedure for semester setup, makeup tracking, and end-of-semester audit closeout. No Microsoft login is required in the app; **digitally signed PDFs** in the master repository are the official record.

**One-page staff summary (PDF):** [AUDIT_TRACKING_OPERATIONS_SUMMARY.pdf](AUDIT_TRACKING_OPERATIONS_SUMMARY.pdf)

**Process diagram:** [audit_tracking_workflow.md](../audit_tracking_workflow.md)

**Technical implementation:** [AUDIT_TRACKING_IMPLEMENTATION.md](AUDIT_TRACKING_IMPLEMENTATION.md)

**OneDrive file sync:** [ONEDRIVE-SETUP.md](ONEDRIVE-SETUP.md)

---

## 1. Roles

| Role | Responsibilities | Typical OneDrive access |
|------|------------------|-------------------------|
| **Program engineer** | Maintains course template / default configuration (once per program revision) | Source repo only; no student data |
| **Administrative staff** | Creates semester, Setup, opens semester, exports audit PDF, locks semester, files signed PDF | **Edit** on working `regn-tracker.json`; **Edit** on master repository |
| **Lead course faculty** | End-of-semester makeup review and attestation; reviews audit PDF; signs PDF | **View** on working JSON (optional); sign PDF via email/desktop |
| **Clinical faculty** | Makeup Finder during semester; may suggest setup changes via email | **View** or **Edit** on working JSON per program policy |
| **All faculty / staff** | View master schedule, student calendars, Excel exports | **View** on working JSON |

**Important distinction**

- **Lead course faculty** — one person per semester cohort; attests makeup closeout in the app.
- **Clinical group faculty** — listed per group (C1–C5) in Setup for liaison contact; they do **not** replace lead faculty for closeout attestation unless the same person is assigned both roles.

Set **lead faculty name** (and email if used) in Setup before starting end-of-semester review.

---

## 2. OneDrive folder layout

Use two logical locations in college OneDrive:

| Folder | Contents | Permissions |
|--------|----------|-------------|
| **Working** (e.g. `REGN-15P/Working/`) | Active `F2026_REGN15P.json`, optional `F2026_REGN15P_Faculty.json` | Admin **Edit**; faculty **Edit** or **View** per policy |
| **Master repository** (e.g. `REGN-15P/Audit-Records/`) | Digitally signed audit PDFs only | Admin **Edit**; faculty **View** or no access |

**Rules**

- Never store semester JSON in the GitHub project folder.
- Signed PDFs contain student names and schedules — treat as **FERPA** data same as JSON.
- After closeout, the **signed PDF** is the official clinical-hours audit record, not the JSON file.

---

## 3. Setup phase (before semester begins)

1. **Program engineer** creates course specific default templates, facility list, clinical/simulation contact hour requirements, and tags for clinical content (med-surg, ob, peds, mental health, etc.)
2. **Admin** opens the app, creates new semester (eg. Fall 2026) completes **Setup** (roster, facilities, clinical groups, calendar, holidays).
3. **Admin** enters **lead course faculty** name and email in Setup.
4. **Admin** shares a summary with clinical faculty (email or meeting) for preview and suggestions.
5. Faculty send suggested changes **via email** to admin (sites, clinical days, weekday preferences).
6. **Admin** applies approved changes in Setup and **opens the semester for teaching** in the app.
7. Semester begins

---

## 4. During the semester

### Lead Faculty

- Record student absences / missed days using the master schedule or established program process.
- Use **Makeup Finder** to assign makeup clinical or sim slots.
- Save the semester file to OneDrive

### Sim faculty (optional)

- Maintain simulation role assignments in the separate sim faculty JSON file

### All staff

- View **Dashboard** master schedule
- Export updated student facing calendars from **Student View** as needed when scheduling makeup days.
- Export Excel from Dashboard for reference (not the official audit document).

---

## 5. End-of-semester closeout checklist

Follow these steps in order

### Step A — Admin starts review

1. Admin confirms all makeup work for the semester is complete in the working JSON.
2. Admin opens the **Audit / Closeout** area in the app and **starts makeup review**.

### Step B — Lead faculty attestation (in app)

3. **Lead course faculty** opens the app (working JSON from OneDrive).
4. Review the **makeup summary** for all students.
5. If corrections are needed → return to Makeup Finder / master schedule → save → review again.
6. When correct, submit **attestation**: confirm checkbox, name, optional notes.
7. App records attestation timestamp (workflow gate; not a legal digital signature).

### Step C — Admin exports audit PDF

8. **Admin** exports the **audit PDF** from the app (enabled after attestation).
9. Note the **snapshot hash** shown in the app and on the PDF footer (for your records).
10. Save unsigned PDF locally with naming convention:
    - `Fall-2026-REGN15P-Audit-v1.pdf`

### Step D — Faculty review PDF (email)

11. Admin emails PDF to **lead course faculty** for review.
12. If PDF is **incorrect** → return to Step B (corrections in app, re-attest, export **v2**).
13. If PDF is **correct** → proceed to signing.

### Step E — Digital signatures (outside the app)

14. **Lead course faculty** applies their **digital signature** to the PDF using your college-approved tool (e.g. Adobe Acrobat, Adobe Sign, DocuSign).
15. **Administrative staff** applies **organizational digital signature** (or final certifying signature)
16. Order of signing: typically **lead faculty first**, then **admin**

### Step F — File and lock

17. Admin saves the **fully signed PDF** to the **master repository** folder on OneDrive.
18. Admin **locks the semester** in the app (read-only; no further edits).
19. Optional: change working JSON folder permissions to **View only** for faculty.
20. **Semester complete.**

---

## 6. PDF signing and corrections

### Recommended tools

- **Adobe Acrobat** with college-issued digital ID, or
- **Adobe Sign / DocuSign** if IT provides them, or
- Any tool your institution accepts for academic records.

The app does **not** apply digital signatures; signing happens after export.

### If corrections are needed after export

| Situation | Action |
|-----------|--------|
| PDF not yet signed | Fix data in app → re-attest if required → export **v2** → discard unsigned v1 |
| PDF signed but error found | Document void of v1 → fix app data → new export v2 → **re-sign** entire PDF |
| JSON edited after signed PDF filed | **Signed PDF remains official record**; do not rely on JSON for audit proof |

Always increment version in filename: `…-Audit-v2.pdf`.

---

## 8. FERPA and retention

- Student schedules and makeup records are **education records**.
- Store working JSON and signed PDFs only in **college-controlled OneDrive** (or approved records system).
---

## 9. What the app does vs what people do

| Action | App | People / IT |
|--------|-----|-------------|
| Track makeups in semester data | Yes | Faculty enter absences / apply makeups |
| Lead faculty attestation flag | Yes (when built) | Lead faculty reviews and clicks attest |
| Audit PDF content | Yes (when built) | Admin exports |
| Digital signature on PDF | No | Faculty + admin in Acrobat/e-sign |
| Official audit record | No | Signed PDF in master repository |
| Enforce who can edit OneDrive files | No | IT / admin sharing settings |

---

## 10. Troubleshooting

| Problem | Suggested action |
|---------|------------------|
| Cannot export audit PDF | Confirm lead faculty attestation completed; confirm semester in makeup review phase |
| Attestation button missing | Confirm lead faculty name set in Setup; confirm admin started review |
| Faculty cannot save JSON | Check OneDrive permissions; iPad users must Export backup |
| Two admins edited same file | Last save wins — coordinate single editor; use OneDrive version history to recover |
| Hash on PDF vs app mismatch | Re-export; ensure PDF was from latest export before signing |

---

## 11. Related documents

| Document | Role |
|----------|------|
| [audit_tracking_workflow.md](../audit_tracking_workflow.md) | Visual workflow |
| [AUDIT_TRACKING_IMPLEMENTATION.md](AUDIT_TRACKING_IMPLEMENTATION.md) | Developer spec |
| [ONEDRIVE-SETUP.md](ONEDRIVE-SETUP.md) | Connect and sync files |
| [README.md](../README.md) | Install PWA, data policy |
