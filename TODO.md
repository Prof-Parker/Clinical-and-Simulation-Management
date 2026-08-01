TODO.md

# Features
- [X] Set light or dark mode based on system/browser Settings
- [X] Add section card scroll bars
- [X] default to 
- [X] fixed headers, student name and clinical group sidebars for Master interactive schedule
- [X] Hover function for clinical group (clinical site name, scheduled day)
- [X] Sim Faculty UI: Move menu items to simulation roles page
- [X] Add historic 2026 4/4 (eligible-list + holiday week-block; Sun–Sat weeks; regen tests)
- [X] Move current 5/4 default to FALL 2026
- [X] Default to 4 sections
- [X] UX for clicking buttons in setup (confirmation flags)
- [X] Remove copy forward
- [X] Remove new semester file from menu (already have button)
- [X] Add export excel export
- [X] Double check tooltips and section headers match current logic and functions
- [X] Holiday model: break|holiday + per-course `holidayBlocksFullWeek` (no mondayHoliday)

# Expanded scope
- [X] Add support for other semesters based on feedback from faculty and staff
- [X] .json file prompt to auto install. Permission restrictions?
- [ ] Clinical hours tracking
- [X] Playground/sandbox function for practice
- [ ] 4th semester support
- [ ] Clinical Facult export and signup
- [X] Merge with Audra's calendar
- [X] Facilities library tagged by semester
- [X] tags for OB, Peds, Mental Health
- [ ] Create blank semester for manual entry, logic only runs at the end with warnings instead of autofill

# Feature Implementation plan
## Phase 1 [ ]
- [X] Support multiple courses
- [X] Clinical hour tracking
- [X] Clinical site library
- [X]Clinical site tags/sub sites
- [X] Permissions settings
- [X] Validate new course file logic (what happens when we use the drop downs? Do we need to better tie to .json file or support concurant .json files being open?)
- [X] Human readable proposed change process
- [X] Flag for unsaved changes vs unsynced changes, revamp sync behavior (pull from oneDrive, merge, push)
- [X] Theory support
- [X] Hide connect vs open semester file desktop vs ipad
- [X] Print merged theory and clinical calendar for each student.
- [X] Batch print and send student calendars

## Phase 2 [ ]
- [X] Improve theory scheduling
    - [X] Drag and drop topics
    - [X] Default lecture times per course
    - [X] Add assignment function
    - [X] Assign lecturers function
- [X] Course wide calendar support with export functions for Admin, Faculty and Students
- [ ] Clinical faculty assignments and self schedule function

## Phase 3 [ ]
- [ ] UI Polish

## Worklist before demo:
### Theory Master Calendar
- [X] add setup configuration section to master calendar:
    - [X] set default lecture days and time (options to leave module information blank or pull in topics in order from another semester)
    - [X] assign default number of faculty required for skills labs
    - [X] assign default faculty roster 
        -skills lab
        -theory
- [X] uniform color codes
    -Theory events blue fill, white/back text (dark mode/light mode)
    -Skills Lab events: orange fill white/back text (dark mode/light mode)
    -Clinical events/orientation events: green fill white/back text (dark mode/light mode)
    -Sim events: purple fill white/back text (dark mode/light mode)
    -Holiday events: red fill white/back text (dark mode/light mode)
    -Other events: white/back text (dark mode/light mode), bold 
    -Assignments color coded by content area (add support to tag assignments to content area)
        -theory assignments: no fill background, outline only, blue text color
        -skills lab assignments: no fill background, outline only, orange text color
        -simulation assignments: no fill background, outline only, purple text color
        -clinical assignments: no fill background, outline only, green text color
- [X] UI for edit day context aware. Examples
    -Assignment: options for title, content area (theory, skills lab, clinical, sim)
    -Theory: topic (select from topic library or create new topic with free text that can be added to library), start/end times, lecturer (drop down to select from faculty assigned to course, "guest lecturer button" expands drop down to all full=time faculty and adjunct faculty, expanded drop down also has "faculty needed" option that will add a "faculty needed" slot to the master faculty calendar (stub)).
    -Skills lab: topics (with support to add mutiple topics to one skills lab event), start/end times, faculty required (drop down to select number of faculty 0-10), assign faculty to slots created by faculty required (drop down pulls from faculty assigned to skills lab).
    -Exam: title only (automatically links to theory)
    -Holidays: should pull from practiucm course setup/new semester setup, should display holiday name as a block for each day of the holiday. Example "Labor Day" displays as a single event on monday 9/7, while thanksgiving should display as events "Thanksgiving Break" for each day in the week sun-sat on during the scheduled break 11/22-11/28
- [X] Master calendar UI elements toggle buttons to show/hide lecturers assigned to events (lecturers should always display on master calendar export for student view).
- [X] Master calendar UI element to show/hide skills lab, sim, and clinical faculty (will need to add sim faculty assignment feature to practicum course setup) 
- [X] Ability to remove faculty assigned to any event that will then create "faculty needed" slot
- [X] Drag and drop events to different days in the master theory calendar
- [X] edit existing items in master theory calendar

### Skills lab content
- [X] Separate skills bank from theory topics (`skills[]`; migrate/strip legacy `defaultSkills`)
- [X] Optional description + curriculum metadata stubs (COR / ACEN) on topics and skills
- [ ] Rename library file to content-library_REGNXX-REGNXXP (examples: content-library_REGN15-REGN15P, content-library_REGN35-REGN35P)

### Faculty Management page
- [ ] create faculty management page to view all faculty in roster (update user registry to include specialty tags for faculty such as sims, ob, peds, critical care etc.)
- [ ] Faculty assignments/self scheduling page
    - [ ] Admin view see open/filled needs with summary for remaining vaccancies
    - [ ] Faculty view to request individual days or whole semester rotation
    - [ ] Faculty request coverage or swap days
    - [ ] Search by semeser, day of the week, times, length (add support for half days), content area, facility


## Worklist after demo:
- [X] implement file_kind_guards **priority**
- [X] Debug file kind guards
    -[X] Login issues
    -[X] No overwrite protection/guard on program file->user file
- [ ] Add acredidation tracking support for content (large feature)
- [ ] Work on Audra contact hour items
- [ ] Add support to change user roles from user management system
- [ ] Add file structure to seed and program data picker to support batch export and archieve folder, audit folder archieve, and password send folder
- [ ] Add audit mailto feature

#### UI improvements after implementing folder picker:
- [ ] remove save setup buttons if keeping live sync with onedrive. Investigate dirty state of file and possible storage options for faculty user before proposal submit
- [ ] Further investigate file managment menu items (may be able to remove/streamline some items)

### Lower priority TODO:
- [ ] Add in app bug and feature request function
- [ ] Add linked clinical, sim and skills lab student performance flags (start with strong/weak and free text notes, expand to include tags for specific competencies? `clinical judgement, safety, sterile technique, medication administration, time management, interpersonal skills, professional conduct/behavior `)

# Priority items from demo
- [ ] Build out 1st-3rd semester for clinicals and sims
- [ ] add self scheduling support for faculty
- [ ] Integrate audra contact hour tracking support (theory only)
- [X] Debug file kind guards — [file_kind_guards_login_debug.md](file_kind_guards_login_debug.md)
- [ ] **Priority**select which clinical day was missed on make up finder. Highlight/mark missed clinical or sim days. 
- [ ] **Priority**makup finder should exclude missed sim as makeup option (example student 1 missed sim 1, make up finder shows week 5 as option even though this was the missed sim)
- [X] Remove load user file and connect user registry buttons from hamburger menu. Leave Logout button
- [ ] Add back button to login page steps 2,3
- [ ] Hide bottom and top bars 
- [ ] Possible duplicate file names in login page step 3
- [ ] Unable to save from embeded browser, file kind guards too tight. Maybe allow classic file picker if program folder picker not active from app login. Apply red styling `danger zone warning as UI deterent`
- [ ] **Priority before rolling out to adjunct faculty** with high numbers of users folder structure is very vulnerable to overwrite both in and out of app. Based on live user demo, app folder requires all users to have full edit access to critical files such as user.registry.json
- [ ] allow program engineer to be assigned in role of lead faculty for a course, while still granting full UI interface
- [X] Add week-17 makeup clinical clustering to force to lowest number of clinical groups required to accomodate makeup needs. (Dashboard Apply; modes + preferred-site conflict transfer; soft-floor + multi-pass thin consolidate — see `PROJECT_IMPLEMENTATION_GUIDE.md` §5.1 and `docs/Design Docs/week17_makeup_clustering_and_sim_soft_floor.md`)



## Closed out issues

### Bugs identified in v2.5.0 
- [X] Advanced config input fields in praciticum setup were not working (no updown buttons, static no free text) when opening on college computer (working on dev computer)
- [X] 4 clinical group and 4 sim group setup with rebalance both results in numerous guest sim placements when there should be 0 (root cause: colliding sim block weeks on holiday bump; fixed via eligible-list allocator + week-block holiday model)

## Deferred Items
- [ ] Look at adding microsoft graph support or easier way to load files — see proposed path: [azure_mvp_fork.md](azure_mvp_fork.md) (Azure fork + Entra; Graph optional later) (defered, acceptable support with new user login process and programdata folder picker)