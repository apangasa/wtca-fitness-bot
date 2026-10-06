# Weight class

How a person's body weight enters scoring. Overview: [points.md](points.md). The lift curve it adjusts: [points-lifts.md](points-lifts.md).

## The rule

**Loaded lifts are scored against Strength Level's men's standards for the lifter's own body weight.** The default is the 150 lb reference lifter. Entering a body weight is optional, and it is public. The same weight class sets the price of every bodyweight exercise.

Strength differs a lot with body weight, so the same absolute lift is a rarer performance for a lighter lifter. At the same standing within their own weight class, a 120 lb lifter's all-out bench or deadlift set pays only 28-31% (Novice) and 54-57% (Intermediate) of a 150 lb lifter's if both are scored on 150 lb standards. Scoring each person against their own weight class removes that gap, so equal rarity within one's class pays equally.

## What follows body weight

- **Loaded lifts:** the four 1RM anchors are Strength Level's rows for the person's weight ([points-lifts.md](points-lifts.md)).
- **Weighted bodyweight exercises** (added load, assisted pull-ups): the load is k × the person's body weight plus the added load (assisted pull-ups use body weight minus the assistance), with anchors from Strength Level's rows for that weight, and the curve scaled so a bodyweight rep pays the person's own flat price.
- **Bodyweight exercises with no added load** pay a flat price from the person's own row: the mean of 120 ÷ Novice reps and 240 ÷ Intermediate reps at their weight ([points-bodyweight-exercises.md](points-bodyweight-exercises.md)). The calf raise keeps its 1.4 at 150 lb and scales with its row; the assisted ab-roll is 0.64 × the person's ab-roll price.
- **Cardio does not follow body weight.** It pays per distance.

## Why Strength Level's own rows, not a scaling formula

Scaling lift weights by body weight with one exponent would need an exponent the data does not have. Going from 150 lb to 120 lb, the exponent needed to match Strength Level's 1RMs is 1.55 / 1.32 / 1.14 / 0.99 for the bench at Beginner / Novice / Intermediate / Advanced, and 1.44 / 1.21 / 1.03 / 0.91 for the deadlift. The table is used as published.

## `/weight`

- `/weight set <lbs>`, `/weight show [user]` and `/weight clear`. The replies appear in the channel and `show` can look up anyone. Unset means 150 lb. An out-of-range entry gets a private error.
- The accepted range is 110-310 lb, the range of Strength Level's tables.
- The price per rep shown in a person's own log reply is computed from their weight.
- Between Strength Level's 10 lb rows, each anchor is interpolated linearly in body weight, before any price is computed.
- **History:** the current value applies to all of the person's history in a running season, because entries do not store body weight. Closed seasons stay frozen.
- **Storage:** `user_weight` holds the current value and `user_weight_log` is an append-only record of every change (a clear is logged as an empty weight). A read-only listing of both: `tsx src/scripts/inspect-db.ts`.
- The data is in `src/strengthLevelTables.ts`: Strength Level's male by-bodyweight tables, 110-310 lb in 21 rows, with source and read date in its header.

## Size of the effect

Re-scoring one 120 lb lifter's 12 loaded lifts against the 120 lb rows, instead of the 150 lb rows, took their loaded-lift points over a season-to-date from about 2,900 to about 6,000. Bodyweight prices move less: at 120 lb against 150 lb the sit-up is 12% lower, the squat 10% lower, the push-up 0.3% higher and the ab-roll 47% higher (Strength Level's 120 lb ab-roll Novice is 4 reps against 7 at 150).

## Limits

- **Body weight is self-reported.** Entering a lower weight raises a person's lift points, because standards are lower for lighter lifters. Weights are public, so the group can see and question any entry; it is still a trust system.
- Strength Level's weight-class rows are self-reported gym data and are smoother than any one person's strength.
