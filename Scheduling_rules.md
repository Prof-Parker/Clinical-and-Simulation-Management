Scheduling_rules.md

# Scheduling rules always apply

- Students cannot be double-booked for a clinical or simulation day.
- Each student is assigned to one clinical group for the entire semester.
- Each student must attend the required number of clinical days and simulation days set in semester setup.
- Each student must attend simulation days in order. A student cannot complete simulation day 3 without having first completed simulation days 1 and 2 in the correct order.
- Only one simulation scenario runs per calendar week program-wide. Example: if Monday is Sim 1, Tuesday in that same week must also be Sim 1.
- Simulations shall be grouped in program-wide blocks so scenarios do not repeat after advancing. Example: Sim 1 in weeks 5–6 is valid; Sim 1 in week 5, Sim 2 in week 6, then Sim 1 again in week 7 is invalid.
- Simulation session capacity is per weekday across all groups combined, not per simulation group. Example: if the cap is 8, at most 8 students may attend simulation on Monday that week regardless of sim group.
- Clinical group and simulation group sizes set in semester setup must be adhered to.
- Prefer rescheduling a clinical over missing a simulation.
- Use existing available sim slots when possible (see **Sim slot filling** below).
- Overload may be used only as a last resort to join an existing sim session that is already at normal capacity; it does not create a new sim day or week. During initial schedule generation, overload is only considered after the headroom-aware normal cap (see **Session load balancing**) is exhausted for that session.
- No new simulation days or weeks may be added except as a last resort for unscheduled makeup days only (typically week 18).

## Sim slot filling

These rules apply to any semester configuration (student count, group count, caps, and calendar) and must not assume a fixed roster layout.

- **Existing slot** means a program-calendar placement for the same simulation scenario number in the same block week and weekday (e.g. Sim 5 on Tuesday of week 14), including sessions already at normal capacity.
- Before any last-resort sim day (week 18 or equivalent), the scheduler must use remaining capacity in the program sim calendar for that scenario: every active block week and configured sim weekday up to `maxStudentsPerSimSession` per day.
- Do not assign simulation *N* on a last-resort week if that student still needs simulations *N+1…* and the program calendar for those later scenarios still has regular capacity available.
- When multiple valid placements exist, prefer in order:
  1. Student’s primary pattern week and weekday for that sim group (within this tier, apply **Session load balancing** tie-breaks)
  2. Alternate sim weekday in the same block week (same scenario number; apply load balancing and overlap routing)
  3. Alternate week in the same program block (same scenario number)
  4. Guest placement in another simulation group — order guest candidates by ascending session count (see prioritized rules)
  5. Overload join of an existing block session (same scenario, same week/day)
  6. Last-resort sim day (week 18) only after the above are exhausted for that scenario
- When choosing among students for the same open slot, prioritize students with fewer remaining valid placement options (e.g. already used their one allowed sim/clinical conflict, or pattern constraints that leave less room later in the block).

## Session load balancing

These rules apply to any semester with configured `simDays`, `clinicalGroupDays`, and session caps. They must not reference fixed group names, week numbers, or roster size.

### Load-aware tie-breaking

When multiple placements are equally valid within the same priority tier (primary, guest, overload, or week 18), prefer the `(block week, sim weekday)` with the **lowest current attendance** for that scenario, then the earlier block week, then the student’s primary sim-group weekday over alternate or guest placements.

“Equally valid” means the student is eligible, the session is not above the applicable cap, and sim/clinical conflict rules allow the placement.

### Guest joins toward lighter sessions

When guest placement is required, prefer joining an **existing** session (same scenario number, same block week) with **lower** attendance over a fuller session. Spread guest assignments across students when possible (see prioritized rules).

### Makeup headroom reserve

During **initial schedule generation** (not manual makeup scheduling), prefer leaving at least `simMakeupHeadroomReserved` seats open on each `(week, day)` when equally valid lighter sessions exist in the same block. Initial generation may fill to `maxStudentsPerSimSession` when needed to place all students. Overload joins are deferred while softer capacity remains in the same block.

- **`simMakeupHeadroomReserved`**: optional semester setting (integer ≥ 0; default 1). A value of `0` disables the reserve.
- **`maxStudentsPerSimSessionOverload`** remains the hard ceiling.
- Purpose: preserve seats on each `(week, day)` for absence makeups that join existing sessions.

### Clinical/sim weekday overlap routing

A student has an **overlapping weekday** when their clinical group weekday (`clinicalGroupDays`) is one of the configured `simDays`.

For overlapping students, within a block week:

| Same-week clinical scheduled? | Prefer simulation on |
|------------------------------|----------------------|
| Yes (sim/clinical weekday conflict) | A configured sim weekday that does not overlap the clinical weekday (sim prioritized; one conflict per semester) |
| No | A non-overlapping sim weekday before an overlapping sim weekday when both are valid and under cap |

# Prioritized rules (in order)

- Simulation groups should be kept as consistent as possible; students may attend as guests in other simulation groups as needed to balance the schedule.
- For scheduling conflicts, simulation takes priority. If a student is scheduled for a simulation day and a clinical day on the same weekday, the student attends simulation.
- If a student must miss a clinical day for a simulation day, they attend a makeup clinical near the end of the semester (target week 17, with week 18 as last resort).
- A student may have at most one sim/clinical weekday conflict per semester. That conflict makeup clinical is marked in orange as a scheduling conflict makeup.
- The scheduled makeup clinical must be at the same facility as the original clinical. Use the same clinical group and weekday as the missed clinical when possible.
- Students should attend simulation every other week when possible. Students may attend simulation in consecutive weeks only when needed to fulfill requirements.
- If a mathematically feasible schedule cannot be generated, show a warning in setup listing which conditions failed, how many students are affected, and suggestions to adjust configuration (students, caps, holidays, or required days). If feasibility checks pass but generation still leaves students incomplete, report that existing program sim slots could not be filled.
