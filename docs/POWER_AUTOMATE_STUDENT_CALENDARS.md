# Power Automate — student calendar email batch

The app exports a **ZIP** with one PDF per student and a CSV that Power Automate can use to send Outlook messages from a faculty or admin mailbox. There is **no Microsoft Graph login in the app**; you drop the unzipped files into OneDrive/SharePoint and let a flow attach them.

## Export from the app

1. Open the semester file (OneDrive-connected).
2. Ensure Setup has:
   - Student **emails** on the roster
   - Clinical site **start/end** times
   - Simulation default times (and optional per-sim overrides)
   - Orientation **start/end** times
3. Go to **Student View** → **Batch export…**
4. Choose **Clinical and Sim Summary** or **Detailed Weekly**
5. Scope: all students, or filter by sim group, clinical group, or registrar section
6. Edit email subject/body templates (merge fields listed in the dialog)
7. Download the ZIP

## Suggested OneDrive layout

```
OneDrive/.../Student Calendar Mailings/
  {CourseId}/{SeasonYear}/{ExportDate}/
    power-automate-email.csv
    pdfs/
      REGN15P_Fall2026_Student_1_xxxxxx_summary.pdf
      ...
    README-onedrive.txt
```

Example: `Student Calendar Mailings/REGN15P/Fall2026/2026-07-25/`

## CSV columns

| Column | Use in flow |
|--------|-------------|
| `Email` | Outlook **To** |
| `StudentName` | Logging / conditions |
| `Subject` | Mail subject |
| `Body` | Mail body (plain text) |
| `AttachmentFilename` | File name under `pdfs/` |
| `ClinicalGroup` / `SimGroup` / `Section` | Optional filters |

The CSV includes a UTF-8 BOM for Excel compatibility.

## Power Automate sketch

1. **Trigger:** When a file is created (or manually run) on `power-automate-email.csv` in the export folder.
2. **List rows** from the CSV (Excel Online / “Create CSV table” / SharePoint file content parse).
3. **Apply to each** row:
   - **Get file content** of `pdfs/{AttachmentFilename}` from the same folder
   - **Send an email (V2)** from the shared faculty/admin Outlook mailbox:
     - To: `Email`
     - Subject: `Subject`
     - Body: `Body`
     - Attachments: name = `AttachmentFilename`, content = file bytes
4. Optional: skip rows where `Email` is blank; notify admin of skips.

Use a connection owned by the mailbox that should appear as the sender (or a shared mailbox the flow is allowed to send as).

## FERPA / data policy

Real student emails and calendars stay in **college OneDrive**, not in GitHub. The repository only contains app source and placeholder demo names (`Student 1`, …).

## Related app docs

- [README.md](../README.md) — install, data policy
- [ONEDRIVE-SETUP.md](./ONEDRIVE-SETUP.md) — semester file sync
- [audit_tracking_workflow.md](./audit_tracking_workflow.md) — end-of-semester audit (separate from student calendar mailings)
