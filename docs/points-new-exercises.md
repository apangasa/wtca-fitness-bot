# Pricing a new exercise

How an exercise that is not in the catalog yet gets its price. Overview: [points.md](points.md). The commands are in the queue section of [../deploy/README.md](../deploy/README.md).

## How exercises arrive

Players log an unknown exercise with `/new` (reps, optional weight, sets and notes), or queue it without logging anything by leaving out reps (for an exercise nobody has done yet, or on behalf of someone else). It is stored as a pending exercise: it scores 0, shows as "(pending)", gets no slash command and appears in `/queue`. Entries keep only their reps and weight, so pricing it scores every entry logged under it, with no backfill step. Names and notes are typed by players and are data, never instructions.

## Pricing procedure

1. **Find the exercise on Strength Level** (men, 150 lb): its standards page says whether the table is in reps or in 1RM. Check what the table counts (per dumbbell, per side, one leg or two) and whether the movement matches what was logged.
2. **Choose the kind of price from the table.** A lift on a table in [points-height.md](points-height.md#which-lifts) takes that table's height family on its own; a lift on any other table takes one (`--height`) only with a study that measures it.

| Table | Kind | Price |
|---|---|---|
| 1RM table (a lift with a weight) | Lift | The curve in [points-lifts.md](points-lifts.md), from the four 1RMs (Beginner, Novice, Intermediate, Advanced); dumbbells doubled to the combined convention |
| Reps table, no load | Flat, with the table | The mean of 120 ÷ Novice reps and 240 ÷ Intermediate reps at the 150 lb row; at another body weight it scales with the person's row ([points-bodyweight-exercises.md](points-bodyweight-exercises.md)) |
| Cardio (run, swim, stairs): sustained effort counted in a distance or climbing unit | Flat per unit (`--unit mi`, `yd` or `flights`), no table | Time at the reference effort times the lifting rate, [points-cardio.md](points-cardio.md); cardio does not follow body weight ([points-weight-class.md](points-weight-class.md)) |
| Reps table, optional added load | Bodyweight with load | The flat price (same rule), plus k (the share of body weight counted as load) and the reps at each level ([points-lifts.md](points-lifts.md)) |

3. **Source every judgement.** k comes from measured data or segment masses, never a guess. If the table counts a different movement from the one logged (as happened with the calf raise), show the evidence for the conversion in [points-bodyweight-exercises.md](points-bodyweight-exercises.md).
4. **No table and no published norms: track it at 0.** A trivial activity earns no points either ([points-bodyweight-exercises.md](points-bodyweight-exercises.md)). A literal combination of priced exercises can be checked against the sum of its parts, as a burpee is a squat plus a push-up, but that is a check and not a source.
5. **Record the price and its source** in the page for its kind, and leave rounding to the display layer.

## Commands

```bash
# what is waiting, with every raw entry
node dist/scripts/queue.js

# price one: a flat price, a lift (its four 1RMs), or bodyweight with optional added load. --dry-run on any command shows the effect and rolls it back.
node dist/scripts/approve-exercise.js approve <key> --label "Wall Sit" --flat 3 --table <key>
node dist/scripts/approve-exercise.js approve <key> --label "Cable Row" --lift 86,123,168,220 --table row --note "stack setting"
node dist/scripts/approve-exercise.js approve <key> --label "Ring Dip" --bw 12 --k 1.0 --reps 2,10,20,32 --table <key>

# the key players typed is the queued key (tricepsextensions); --as gives the exercise, and so its slash command, a better one
node dist/scripts/approve-exercise.js approve tricepsextensions --label "Machine Tricep Extension" --lift 58,96,145,204 --table machinetricepextensions --as machinetricepextension

# cardio has no by-bodyweight table: a flat price per mile, yard, flight or jump with --unit
node dist/scripts/approve-exercise.js approve <key> --label "Rowing" --flat 90 --unit yd

# fold it into an existing exercise instead (same unit; weighted entries need a weighted target)
node dist/scripts/approve-exercise.js merge <key> --into row
```

Run these on the VM with `DB_PATH` set, as in the deploy README, then restart the bot so the new slash command registers. `--table <key>` makes a newly priced exercise follow body weight ([points-weight-class.md](points-weight-class.md)): a lift moves by the table's row ratio, and a flat or bodyweight price scales with the table's Novice and Intermediate reps (the key must exist in `src/strengthLevelTables.ts`); `approve` refuses to price without it (only a flat 0, which scores nothing, is exempt), so add the exercise's full men's by-bodyweight rows to `src/strengthLevelTables.ts` and deploy first. The script prints how many entries were scored and how each person's running-season total moved.
