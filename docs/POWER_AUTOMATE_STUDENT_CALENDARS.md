# Power Automate — student calendar email batch

The app exports a **ZIP** with one PDF and one Outlook/iCal **`.ics`** file per student, plus a JSON file that Power Automate can parse (no CSV connector / premium API required) to send Outlook messages from a faculty or admin mailbox. There is **no Microsoft Graph login in the app**; you drop the unzipped files into OneDrive/SharePoint and let a flow attach them.

## Export from the app

1. Open the semester file (OneDrive-connected).
2. Ensure Setup has:
   - Student **emails** on the roster
   - Clinical site **start/end** times
   - Simulation default times (and optional per-sim overrides)
   - Orientation **start/end** times (shown on PDF calendars)
   - Theory master calendar lecture / skills / assignment events (included in `.ics`)
3. Go to **Student View** → **Batch export…** (or **Export .ics** for one selected student)
4. For batch: choose **Clinical and Sim Summary** or **Detailed Weekly** (PDF layout only; `.ics` content is the same either way)
5. Scope: all students, or filter by sim group, clinical group, or registrar section
6. Edit email subject/body templates (merge fields listed in the dialog)
7. Download the ZIP

### What is in each `.ics` file

| Event | Summary | Times |
|-------|---------|--------|
| Clinical / makeup clinical | `Clinical` / `Makeup Clinical` | Facility start–end |
| Simulation | `Simulation N` | Sim default or override times |
| Lecture | `Lecture` (no topic or lecturer) | Event or default lecture times |
| Skills lab | `Skills lab` (no topics or faculty) | Event or default skills times |
| Assignment | Assignment **title** | Due at **23:59** on the scheduled date unless the event has an explicit time |

## Suggested OneDrive layout

```
OneDrive/.../Student Calendar Mailings/
  {CourseId}/{SeasonYear}/{ExportDate}/
    power-automate-email.json
    pdfs/
      Student_1_xxxxxx_summary.pdf
      ...
    ics/
      Student_1_xxxxxx.ics
      ...
    README-onedrive.txt
```

Filenames are kept short on purpose (student slug + id tail + type) so zip extract works under deep OneDrive paths on Windows. Course and term stay in the folder path, not the file name.

Example: `Student Calendar Mailings/REGN15P/Fall2026/2026-07-25/`

## JSON shape

Root object with an `emails` array. Each element:

| Property | Use in flow |
|----------|-------------|
| `Email` | Outlook **To** |
| `StudentName` | Logging / conditions |
| `Subject` | Mail subject |
| `Body` | Mail body (plain text) |
| `AttachmentFilename` | PDF file name under `pdfs/` |
| `IcsFilename` | Calendar file name under `ics/` |
| `ClinicalGroup` / `SimGroup` / `Section` | Optional filters |

Example:

```json
{
  "emails": [
    {
      "Email": "student1@example.edu",
      "StudentName": "Student 1",
      "Subject": "Fall 2026 — Your Clinical and Sim Summary calendar",
      "Body": "Hello Student 1,\n\n...",
      "AttachmentFilename": "Student_1_xxxxxx_summary.pdf",
      "IcsFilename": "Student_1_xxxxxx.ics",
      "ClinicalGroup": "C1",
      "SimGroup": "S1",
      "Section": "01"
    }
  ]
}
```

Merge fields also include `{{icsFilename}}` alongside `{{attachmentName}}`.

## Power Automate — step-by-step flow build

Use a connection owned by the mailbox that should appear as the sender (or a shared mailbox the flow is allowed to send as). Students open the `.ics` attachment in Outlook (or Apple/Google Calendar) to import events.

Action names below assume defaults (`Parse_JSON`, `Apply_to_each`). If you rename cards, update expressions (spaces become underscores).

### Prerequisites

1. Faculty/admin mailbox that should send the messages (Send As / shared mailbox permissions if needed).
2. Microsoft 365 Outlook + OneDrive for Business or SharePoint connectors (no premium HTTP connector required).
3. Export folder created and ZIP contents uploaded (see layout above).

### Finding Site Address and paths

| Hosting | Site Address (examples) | Library |
|---------|-------------------------|---------|
| SharePoint team site | `https://shastacollege.sharepoint.com/sites/Nursing` | `Documents` / `Shared Documents` |
| OneDrive for Business | `https://shastacollege-my.sharepoint.com/personal/{userid}_shastacollege_edu` | `Documents` |

Open the export folder in a browser and copy the URL. Site address is everything through `/sites/YourSite` or `/personal/...`. Prefer browsing folders in the Power Automate file pickers.

**Example export folder (relative to library root):**

`Student Calendar Mailings/REGN15P/Fall2026/2026-08-06/`

Upload so `power-automate-email.json` sits at the **root of that date folder**, with sibling `pdfs/` and `ics/` folders (not an extra nested ZIP folder).

### Flow outline

```
[Trigger] When file created / Manual
  └─ [Condition] Name = power-automate-email.json   (if automated)
       └─ Initialize varExportFolder
       └─ Get file content → power-automate-email.json
       └─ Parse JSON → schema with emails[]
       └─ Apply to each (emails)
            └─ Condition: Email not empty
                 ├─ Yes:
                 │    Get file content → pdfs/{AttachmentFilename}
                 │    Get file content → ics/{IcsFilename}
                 │    Send an email (V2)
                 │      To=Email, Subject=Subject, Body=Body
                 │      Attach PDF + ICS
                 └─ No: skip / log
       └─ (Optional) notify admin of skips
```

### Step 1 — Trigger

Create an **Automated cloud flow** or **Instant** flow named e.g. `Send student calendar mailings`.

**Option A — Automated (recurring exports)**

| Setting | Value |
|---------|--------|
| Trigger | SharePoint **When a file is created (properties only)** — or OneDrive **When a file is created** |
| Site Address | Your site URL |
| Library Name | `Documents` / `Shared Documents` |
| Folder | `Student Calendar Mailings` (include subfolders if available) |

Then **Condition**: file **Name** **is equal to** `power-automate-email.json`.  
- If no → terminate / do nothing.  
- If yes → continue.

**Option B — Manual (best while building / testing)**

| Setting | Value |
|---------|--------|
| Trigger | **Manually trigger a flow** |
| Optional input | Text `ExportFolderPath` — e.g. `/Student Calendar Mailings/REGN15P/Fall2026/2026-08-06` |

### Step 2 — Export folder variable

**Initialize variable** `varExportFolder` (String) to the parent folder of `power-automate-email.json`.

- Automated: map from trigger folder path properties (e.g. Path of the created file’s parent).
- Manual: set from `ExportFolderPath` trigger input.

Example value:

`/Student Calendar Mailings/REGN15P/Fall2026/2026-08-06`

(On SharePoint the path may be under `Shared Documents/...` — match what the file picker shows.)

### Step 3 — Get file content (JSON)

| Field | Value |
|-------|--------|
| Action | **Get file content** (SharePoint or OneDrive) |
| File | `{varExportFolder}/power-automate-email.json` |

Example path:

`/Student Calendar Mailings/REGN15P/Fall2026/2026-08-06/power-automate-email.json`

If the trigger already supplied the JSON file ID, use that Identifier instead of a hard-coded path.

If Parse JSON later fails with encoding errors, add **Compose** with:

```
base64ToString(outputs('Get_file_content')?['body']?['$content'])
```

(Adjust the Get file content action name.) Many tenants return text body already — try Parse JSON first.

### Step 4 — Parse JSON

| Field | Value |
|-------|--------|
| Action | **Parse JSON** |
| Content | File content from Step 3 (or Compose output) |
| Schema | **Generate from sample** using the JSON example in [JSON shape](#json-shape) |

Schema must describe root `{ "emails": [ … ] }`, not a bare array.

### Step 5 — Apply to each (`emails` array)

| Field | Value |
|-------|--------|
| Action | **Apply to each** |
| Select an output | The **`emails`** array — **not** Body |

**Do not** pick only **Body** from Parse JSON. Body is the whole object `{ "emails": [ … ] }`. Apply to each needs the array; feeding Body usually loops once over the object and field mappings break.

**What to use instead**

1. In **Select an output from previous steps**, look for **emails** under Parse JSON (sometimes under **Show more**).
2. If you only see **Body**, use an expression:
   - Click in the **Select an output** field
   - Switch to **Expression**
   - Enter (adjust the action name if yours differs):

```
body('Parse_JSON')?['emails']
```

Other common forms if the designer renames the card:

```
body('Parse_JSON_2')?['emails']
outputs('Parse_JSON')?['body']?['emails']
```

**Quick check:** Inside the loop, dynamic content should list **Email**, **StudentName**, **Subject**, **Body**, **AttachmentFilename**, **IcsFilename**, etc. If those never appear, regenerate the Parse JSON schema from the sample with the `emails` wrapper.

| Purpose | Expression |
|---------|------------|
| Apply to each input | `body('Parse_JSON')?['emails']` |
| Current row fields (To, Subject, filenames, …) | `items('Apply_to_each')?['Email']` (and `Subject`, `Body`, `AttachmentFilename`, `IcsFilename`, …) |

### Step 6 — Condition: skip blank emails

Inside Apply to each, add a **Condition** on the **current student’s** email — **not** `body('Parse_JSON')?['emails']` again.

| Left side | Operator | Right side |
|-----------|----------|------------|
| Current item **Email** | **is not equal to** | *(leave empty)* |

Dynamic content **Email**, or expression:

```
items('Apply_to_each')?['Email']
```

- **If yes** → Steps 7–9 (get attachments + send).
- **If no** → skip; optionally append `StudentName` to a `SkippedStudents` array variable for an admin notice later.

### Step 7 — Get file content (PDF)

Inside the **Yes** branch:

| Field | Value |
|-------|--------|
| Action | **Get file content** — rename to e.g. `Get_PDF` |
| File path | `{varExportFolder}/pdfs/{AttachmentFilename}` |

Expression example for the path:

```
concat(variables('varExportFolder'), '/pdfs/', items('Apply_to_each')?['AttachmentFilename'])
```

Example:

`/Student Calendar Mailings/REGN15P/Fall2026/2026-08-06/pdfs/Student_1_xxxxxx_summary.pdf`

### Step 8 — Get file content (ICS)

| Field | Value |
|-------|--------|
| Action | **Get file content** — rename to e.g. `Get_ICS` |
| File path | `{varExportFolder}/ics/{IcsFilename}` |

```
concat(variables('varExportFolder'), '/ics/', items('Apply_to_each')?['IcsFilename'])
```

Example:

`/Student Calendar Mailings/REGN15P/Fall2026/2026-08-06/ics/Student_1_xxxxxx.ics`

### Step 9 — Send an email (V2)

| Field | Value |
|-------|--------|
| Action | **Send an email (V2)** (Office 365 Outlook) |
| From / Send As | Shared mailbox if required; else the connected account |
| To | `items('Apply_to_each')?['Email']` (or dynamic **Email**) |
| Subject | `items('Apply_to_each')?['Subject']` |
| Body | `items('Apply_to_each')?['Body']` — **Is HTML** = **No** (plain text with newlines) |
| Attachments | Two items (PDF + ICS) |

**Attachments**

| Attachment Name | Attachment Content |
|-----------------|--------------------|
| `items('Apply_to_each')?['AttachmentFilename']` | File Content from `Get_PDF` |
| `items('Apply_to_each')?['IcsFilename']` | File Content from `Get_ICS` |

Prefer the designer’s attachment Name/ContentBytes cards when available.

### Step 10 — Optional admin skip notice

After Apply to each: if `SkippedStudents` is non-empty, **Send an email (V2)** to the coordinator listing names that had blank `Email`.

### Test plan

1. Use a one-row JSON (or trim `emails` to one object) with **your** address in `Email`.
2. Confirm matching files exist under `pdfs/` and `ics/`.
3. Run manually first; verify PDF and `.ics` open/import.
4. Then run a full cohort folder.
5. Large cohorts: if Outlook rate-limits, add a short **Delay** (2–5 s) inside the loop, or filter by `ClinicalGroup` / `SimGroup` / `Section`.

### Field → action map

| JSON property | Flow use |
|---------------|----------|
| `Email` | Outlook **To**; skip condition |
| `Subject` | Outlook **Subject** |
| `Body` | Outlook **Body** (plain text) |
| `AttachmentFilename` | Path under `pdfs/` + attachment name |
| `IcsFilename` | Path under `ics/` + attachment name |
| `StudentName` | Skip log / admin mail |
| `ClinicalGroup` / `SimGroup` / `Section` | Optional filters before send |

## FERPA / data policy

Real student emails and calendars stay in **college OneDrive**, not in GitHub. The repository only contains app source and placeholder demo names (`Student 1`, …).

## Related app docs

- [README.md](../README.md) — install, data policy
- [ONEDRIVE-SETUP.md](./ONEDRIVE-SETUP.md) — semester file sync
- [audit_tracking_workflow.md](./audit_tracking_workflow.md) — end-of-semester audit (separate from student calendar mailings)
