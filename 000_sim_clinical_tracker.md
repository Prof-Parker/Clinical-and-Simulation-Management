# Project Scope
-Lightweight browser based calendar and spreadsheet app to track student simulation and clinical information
-Data storage using microsoft onedrive and .json backup file for importing and exporting data across browsers
-NO MICROSOFT API CALLS

## Scheduling Goals
-Semester is 18 weeks long including one week for fall or spring break
-Support for up to 30 students per semester
-Each student is assigned to a clinical group (max 6 students per group)
-For weeks with Monday Holidays students will not have simulation or clinical that week
-Students MUST complete all 10 clinical days and all 5 simulation days
-Clinical groups MUST remain consistent the entire semester
-Students can only attend clinical at the facility they recvieved orientation too (example if assigned to Saint Elizabeth's clinical group can only attend clinicals scheduled at Saint Elizabeths)
-If students miss clinical to attend sim they will attend a makeup clinical day at the end of the semester
-Simulation groups should be kept as consistent as possible

### Clinicals
-Total of 10 clinical rotations for each student
-Clinical group 1 Saturday
-Clinical Group 2 Monday
-Clinical Group 3 Monday
-Clinical Group 4 Monday
-Clinical Group 5 Tuesday

### Simulation
-Total of 5 simulation days per student
-Simulation days must be completed in order. Example a studnet can not complete simulation day 3 without having first completed simulation days 1 and 2 in the correct order.
-4 simulation groups
-Each group will attend simulation every other week
-Simulation days Mondays and Tuesdays

## App Features
-Ability to enter and save student names each semester
-Ability to enter facilutly names and assign clinical faculty to each clinical group
-Ability to name clinical facilites and assign clinical days to each facility
-Ability to enter holidays and spring/fall breaks and update calendar
-Ability to adjust clinical and simulation starting weeks. By default simulations will start in week 5 and clinicals will start on the saturday at then end of week 5
-Import/Export to .json file
-Assign and track student roles within simulation (Primary Nurse, Secondary Nurse, Evaluator, Scribe)
-Export and print calendars for each student
-"Makeup day" button to search clinical and simulation calendar to find existing simulation or clinical days that would allow a student to makeup a missed clinical or simulation day on a day they are not scheduled for clinical or sim
-Logic function to verify each student is assigned 10 clinicals and 5 simulation days along with the ability to mark absences and track makeup days to meet board of nursing clinical hour requirements
-Copy forward to carry over simulation days, and clinical days to next semester with prompt to input new student roster
-Ability to assign each student to a section for the registrars office (sections do not necisarily correlate with simulation or clinical groups, will assign manually at the start of the semester).
Scheduling adjustment configuration submenu

### App layout
-Support for darkmode or light mode
-Modern minimalist app design. Avoid blank spaces.
-Master calendar page displaying all students and their assigned clinicals and simulation days with filters by clinical group, simulation group or student
-Student view and makeup function. View/export/print one students calendar (all 18 weeks). Ability to reprint calendar with markup showing makeup days and missed clinical or simulation days
-Simulation day view with role assignments and cumulative totals in each role. Drop down button for primary and secondary nurse role assignments to flag strong or weak performing students. Flags will highlight students in simulation day by color green (high performer) yellow (weaker) util updated by faculty. Default to no highlight if student has not been flagged

### Scheduling adjustment configuration submenu
-Ability to alter the required number of clinical or simulation days
-Ability to alter scheduled days for simulations or clinicals
-Ability to alter maximum number of students per semester
-Ability to alter the maximum number of students in a clinical or simulation group
-MUST PRESERVE LOGIC SO THAT ALL STUDENTS ARE SCHEDULED FOR THE NEW CONFIGURED NUMBER OF SIMULATION OR CLINICAL DAYS