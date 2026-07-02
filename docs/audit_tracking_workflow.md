# Audit tracking workflow

Visual overview of semester setup, makeup tracking, and end-of-semester audit closeout. This workflow uses **no Microsoft API login in the app**; the **digitally signed audit PDF** in the master repository is the official record after closeout.

**Operations guide (admin & faculty):** [docs/AUDIT_TRACKING_OPERATIONS.md](docs/AUDIT_TRACKING_OPERATIONS.md)

**Developer implementation guide:** [docs/AUDIT_TRACKING_IMPLEMENTATION.md](docs/AUDIT_TRACKING_IMPLEMENTATION.md)

```mermaid
---
config:
  layout: elk
---
flowchart TB
    subgraph Setup_Phase["Setup Phase"]
        direction TB
        A1(["PWA APP"]):::endpoint --> A2["Program Engineer<br>Creates Course<br>JSON File"]:::engineer
        A2 -- One Time Setup --> A3["Administrative Staff<br>Setup New Semester"]:::admin
        A3 --> A4["Faculty Preview<br>&amp; Suggest Changes"]:::faculty
        A4 -- Via Email --> A5["Admin Staff<br>Finalize Semester"]:::admin
        A5 -- Semester Ready --> A6(["Semester Begins"]):::process
    end

    subgraph During_Semester["During Semester"]
        direction TB
        B1["Faculty Use Makeup<br>Function to Assign<br>&amp; Track Makeup Days"]:::faculty
        A6 --> B1
    end

    subgraph End_of_Semester["End of Semester"]
        direction TB
        C1["Lead Faculty Review<br>Makeup Days"]:::faculty
        B1 --> C1
        C2{"Lead Faculty Mark<br>Makeup Info Correct?"}:::decision
        C1 --> C2
        C2 -- No --> B1
        C2 -- Yes --> C3["Attestation Flag<br>on Semester"]:::process
        C3 --> C4["Admin Staff<br>Exports PDF File"]:::admin
        C4 -- Via Email --> C5["Lead Faculty Review PDF"]:::faculty
        C6{"PDF Correct?"}:::decision
        C5 --> C6
        C6 -- No --> C1
        C6 -- Yes --> C7["Lead Faculty Digitally Sign PDF"]:::faculty
        C7 --> C8["Admin Staff Sign PDF"]:::admin
        C8 --> C9["Save in Master<br>Repository Folder"]:::admin
        C9 --> C10(["Semester Complete"]):::endpoint
    end

    classDef engineer fill:#eef2ff,stroke:#818cf8
    classDef admin fill:#f0fdf4,stroke:#4ade80
    classDef faculty fill:#fff7ed,stroke:#fb923c
    classDef process fill:#ecfeff,stroke:#22d3ee
    classDef decision fill:#fdf4ff,stroke:#e879f9
    classDef endpoint fill:#f0f9ff,stroke:#38bdf8
```

## Notes

- **Lead course faculty** (set in Setup) attests makeup records at closeout. This is separate from **clinical group faculty** listed per cohort (C1–C5).
- In-app attestation is a workflow step; **digital signatures on the PDF** (outside the app) provide the official audit trail.
- Working semester data lives in `regn-tracker.json` on OneDrive during the semester; see [docs/ONEDRIVE-SETUP.md](docs/ONEDRIVE-SETUP.md).
