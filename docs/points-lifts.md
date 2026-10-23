# Weighted lifts

How a lift, a bodyweight exercise with added load, and an assisted pull-up are priced. Overview: [points.md](points.md). The ladder: [points-foundation.md](points-foundation.md). Scoring against a person's own body weight: [points-weight-class.md](points-weight-class.md).

## Points for a set

**Points = reps × P(W),** where P(W) is the price per rep at weight W for that lift. Entries store total reps at a weight, so P cannot depend on how many reps were in a set. A set length therefore has to be assumed, and P is exactly fair only for sets of that length.

**The assumed set length is 8 reps.** Logged lift sets cluster at 4-6 and 10-12 reps (82 entries from 5 people as of 2026-10-06; among entries of 15 reps or fewer the median is 10). Calibrating to 8 reps gives a lower typical error across those lengths than 10 reps (bench, treating logged sets as all-out: Novice 38% against 44%, Intermediate 45% against 51%). It is not the lowest (5 reps for Novice, 7 for Intermediate); it sits between the two clusters.

## How P(W) is built

1. For each level (Beginner, Novice, Intermediate, Advanced) take Strength Level's men's 1RM for the lift at 150 lb.
2. That level's 8-rep weight is f × its 1RM.
3. The price per rep at that weight is the level's ladder value ÷ 8, which is 3.75, 15, 30 and 48 ([points-foundation.md](points-foundation.md)).
4. For any other weight, interpolate between the two nearest anchors with a power law (straight line on a log-log scale).

**f is Strength Level's own conversion,** not a physiological claim. Strength Level estimates 1RM with the Brzycki formula below 8 reps, the Epley formula above 10, and a blend between ([FAQ](https://strengthlevel.com/faq)); its table shows 8 reps as 81% of 1RM ([calculator](https://strengthlevel.com/one-rep-max-calculator)). At 8 reps that is Brzycki: 1RM = w × 36 ÷ (37 − 8), so **f = 29/36 = 0.8056**. The standards are 1RM tables built from submitted sets, so converting a logged set the same way places it on the same scale, whatever the true reps-against-load relationship is for that lift. The FAQ confirms the conversion and that the standards come from all submitted lifts; that the standards use the converted 1RM is inferred from them being 1RM tables. This is why no per-exercise conversion is needed. Published reps-against-load data ([Nuzzo et al., 2024](https://doi.org/10.1007/s40279-023-01937-7); a 2026 preprint by Marzagao) disagree with each other for light lifts, and that disagreement does not enter here.

**Why a power law between anchors.** On the bench anchors it differs from straight-line interpolation by 1-3% from Novice upward and by 7-15% between Beginner and Novice. A straight line goes negative below the Beginner weight, and a single smooth curve misses the anchors and bends over above the top one.

### Range

- **Below the Beginner weight,** the Beginner-to-Novice exponent continues downward. Price reaches 0 at 0 lb (except for the split squats, which also move the body: see below), and light weights pay very little (bench: 45 lb about 0.3 a rep, 70 lb about 2.1). Strength Level has no data below its 5th percentile; the shape follows the rarity principle, under which an effort easier than the 5th-percentile lifter's earns almost nothing.
- **Above the Advanced weight,** the Intermediate-to-Advanced exponent continues. No logged weight is above the Advanced anchor (the heaviest, as of 2026-10-06, is a 175 lb bench, 92% of the 190 lb anchor).
- Of 82 logged lift entries, 17 sit below the Beginner anchor weight.

### Worked example: bench

1RM 99 / 137 / 183 / 236 lb.

| Level | 8-rep weight (f × 1RM) | Price per rep |
|---|---|---|
| Beginner | 79.8 lb | 3.75 |
| Novice | 110.4 lb | 15.0 |
| Intermediate | 147.4 lb | 30.0 |
| Advanced | 190.1 lb | 48.0 |

5 reps at 117 lb falls between the Novice and Intermediate anchors. The power law between them has exponent ln 2 ÷ ln(147.4 ÷ 110.4) = 2.39, so P = 15 × (117 ÷ 110.4)^2.39 = 17.2 and the set pays 5 × 17.2 = 86.

Because price rises faster than weight, one rep at 200 lb pays about 53 and two reps at 100 lb pay about 20. One rep beats two only when the weight is at least about 1.3-1.5 times as heavy, so one rep at 200 lb (53) pays less than two reps at 150 lb (62).

## Weighted bodyweight exercises

A bodyweight exercise with an added load uses the same curve. The effective weight is **k × 150 lb of body weight plus the added load** (the person's own body weight, for [`/weight`](points-weight-class.md)); at 150 lb that is 150 lb.

**Anchors come from the exercise's own reps table.** Its effective 1RM at each level is (k × 150) ÷ (the fraction of 1RM that those reps to failure represent), using Strength Level's conversion above; the curve is then built as for a lift. This reproduces Strength Level's separate added-weight tables within 1-3%:

| Exercise | Novice, from reps vs added-weight table | Intermediate, from reps vs added-weight table |
|---|---|---|
| Pull-up | 180 vs 178 | 220 vs 216 |
| Chin-up | 186 vs 180 | 220 vs 218 |
| Dips | 200 vs 197 | 250 vs 250 |

**Matching the bodyweight price.** At zero added load the curve gives a bodyweight rep slightly different from the flat price in [points-bodyweight-exercises.md](points-bodyweight-exercises.md) (pull-up 17.6 against 17.1, chin-up 16.9 against 16.1, dips 11.0 against 12.0). The curve is scaled so that the two agree at zero load, and the flat price it is scaled to is the person's own ([points-weight-class.md](points-weight-class.md)): a rep with no load and the curve describe the same person.

**k, the share of body weight counted as load:**

| Exercise | k | Basis |
|---|---|---|
| Pull-up, chin-up, dips | 1.0 | The reps-derived 1RM matches the added-weight tables (above) |
| Squat, lunge, calf raise | 1.0 | Body weight and added load are carried by the same limbs, so they scale together whatever the split between legs. Only the feet (1.45% each) and shanks (4.65% each) are not borne through the lifting chain: at most 12% for a squat, 3% for a calf raise. For squat, k = 1 also matches the barbell-table cross-check (effective 1RM 280 from reps against 282 from the barbell table). |
| Push-up | 0.70 | [Hewit et al., Res Investig Sports Med, 2019](https://crimsonpublishers.com/rism/fulltext/RISM.000591.php) (22 men): about 70% of body weight through the hands at the start of a bout, falling to 52% as they fatigued. Suprak et al. report 69-75% and Ebben et al. 64% (cited from secondary summaries). |
| Sit-up | 0.678 | Winter's anthropometric table (from Dempster): head, arms and trunk are 67.8% of body weight. |
| Side-lying hip abduction | 0.161 | Winter's table: the whole top leg (thigh 10.0%, shank 4.65%, foot 1.45%). The weight is an ankle weight; see below for why leverage is not modelled. |

Segment masses: Winter, *Biomechanics and Motor Control of Human Movement*, Table 4.1. A weight held on the chest sits further from the hip than the trunk's own centre of mass, so a pound there loads the abs somewhat more than a pound of trunk; this is not modelled.

**Squat.** The squat follows the same rule as every other bodyweight exercise: its curve comes from its own reps table (3 / 26 / 58 / 98 reps, k = 1) and is scaled to its flat price at zero load. Strength Level's barbell squat table is not used, because it describes a different population (a barbell Beginner matches a bodyweight Novice, effective 1RM 282 against 280), and mixing the two needs a join with no evidence for its shape.

| Bar | 0 | 45 lb | 90 lb | 135 lb | 185 lb | 225 lb |
|---|---|---|---|---|---|---|
| Price per rep | 4.4 | 8.3 | 13.1 | 17.0 | 21.8 | 25.5 |

For bars above about 124 lb this is lower than the barbell table would give (185 lb: 21.8 against 34.1). The heaviest logged squat bar is 105 lb.

**Side-lying hip abduction** (`/sidelyinghipabduction`, decided 2026-10-17). Strength Level's floor hip abduction reps table (men, 150 lb row <1 / 9 / 27 / 50, read 2026-10-17, [source](https://strengthlevel.com/strength-standards/floor-hip-abduction/lb); "<1" read as 1) gives a flat price of 11.11 (implied 13.33 / 8.89). One rep is one leg's rep, and the weight is the ankle weight on that leg. It is a [one-side exercise](#one-side-exercises), so each rep pays half the curve.

| Ankle weight | 0 | 5 lb | 8 lb | 10 lb | 15 lb | 20 lb |
|---|---|---|---|---|---|---|
| Price per rep (150 lb) | 5.6 | 9.0 | 10.7 | 12.0 | 15.0 | 17.7 |

- **Why not count leverage.** An ankle weight sits further from the hip than the leg's centre of mass (0.447 of the hip-to-ankle length, Winter), so by torque the leg is worth only 0.161 × 0.447 = 0.072 of body weight in ankle pounds. Checked against logged sets, that k placed this exercise 1.5 to 2 levels above the same lifter's other lifts, so it overpays.
- **What reps to failure imply.** About 20 reps per leg with no weight and about 12 with 8 lb reconcile only at k ≈ 0.34, above the leg's whole mass, which suggests the reps-to-1RM conversion overstates small loads at high reps. Those are two rough estimates, so 0.161, the largest physically sourced value, is used. Fresh maximum sets with and without the ankle weight would let k be fitted.

## One-side exercises

Some exercises work one arm or one leg at a time, and players log every side's reps: 10 reps on each leg is logged as 20. **Each of those reps pays half the curve** (`oneSide` in the pricing record, `--one-side` when approving; decided 2026-10-17).

- **Why half.** Prices are set so that an all-out set using both sides pays the ladder (a two-arm curl, a push-up, a bench press). A one-side rep is half that work, so both sides together pay what one two-side set pays, and one side alone pays half.
- **The table.** A Strength Level table that already counts one side (single leg press, Bulgarian split squat, cable woodchopper, floor hip abduction) is used as it is. A table for both sides, used for a one-arm version, is halved first so that the logged weight is the weight on that side: the single bicep curl uses the bicep curl anchors halved (19.5 / 30.5 / 44.5 / 61.5 lb at 150 lb), so a 10 lb dumbbell sits where 20 lb combined sits.
- **Example.** One arm, 10 reps with a 10 lb dumbbell, pays half of a two-arm set of 10 reps with 10 lb in each hand; both arms, 10 reps each, logged as 20, pay the same as the two-arm set.
- **Single cable leg extension** (`/singlecablelegextension`, seated, a cable on an ankle strap): Strength Level's cable leg extension table (men, 1RM stack setting, 150 lb row 53 / 104 / 175 / 264, read 2026-10-17, [source](https://strengthlevel.com/strength-standards/cable-leg-extension/lb)) does not say whether it counts one leg or two. Read as one leg, logged sets to failure (16 reps a leg at 20 lb) fell below Beginner for a lifter who is Novice to low Intermediate on other lifts, so it is read as both legs and halved: 26.5 / 52 / 87.5 / 132 lb.
- **Which exercises:** single cable leg extension, single leg press, barbell and dumbbell Bulgarian split squats, cable woodchop, side-lying hip abduction, single bicep curl, single-arm dumbbell row and lunges.
- **Single-arm dumbbell row** (`/singlearmdbrow`): Strength Level's dumbbell row table is the one-arm, bench-supported row (its exercise picture) and counts one dumbbell (men, 1RM, 150 lb row 33 / 54 / 81 / 113 lb, read 2026-10-20, [source](https://strengthlevel.com/strength-standards/dumbbell-row/lb)). It already counts one side, so it is used as it is, not doubled, and the logged weight is the one dumbbell.
- **Lunges.** Strength Level does not say how it counts a lunge rep, and its popular workouts mix 3 × 10 with 3 × 20 and 2 × 30. Its reps are read as per leg because the per-step reading is implausible against the squat: a Novice does 26 bodyweight squats but 14 lunge reps, which per step would be 7 per leg, about 4 times the squat's difficulty per leg. Per leg, a lunge is somewhat harder than a squat, as expected with most of the weight on the front leg. Players log every step, so a step pays 3.72 at 150 lb (a squat rep, both legs, pays 4.38).

## Assisted pull-ups

An assisted pull-up sits on the pull-up curve to the left of body weight: the effective weight is 150 lb minus the assistance, scaled to the pull-up's flat price (17.14 at 150 lb) at zero assistance. Strength Level has no separate assisted table; the pull-up table's Beginner entry is a 6 lb assist. Below that the curve extends as for any below-Beginner weight, so the price reaches 0 at an assistance equal to body weight.

| Assistance | 0 | 10 lb | 20 lb | 30 lb | 40 lb | 50 lb |
|---|---|---|---|---|---|---|
| Price per rep | 17.1 | 12.5 | 7.7 | 4.6 | 2.6 | 1.4 |

## Weight conventions

The curve is built from power laws between anchors, so rescaling every weight by the same factor changes no price: a 25 lb hammer curl pays 15.88 a rep whether the anchors and the logged weight are per dumbbell or combined. The convention only affects how weights are entered.

- **Dumbbells:** Strength Level's tables are per dumbbell (the full dumbbell as labelled); they are doubled to the bot's combined convention.
- **Cable stacks and machines:** Strength Level's tables use what lifters log, which is the stack setting, so the bot's stack-setting convention matches by construction. Pulley ratios differ between machines, which is noise inside Strength Level's own data.
- **Barbells:** Strength Level counts the bar, matching bar plus plates.

## Every lift has a table

Every lift in the bot has a Strength Level 1RM table and is priced the same way, including the cable crunch (48 / 85 / 134 / 196 lb), which pays 0.8 a rep at a 20 lb stack, 2.0 at 30 lb, 4.1 at 40 lb and 10.9 at 60 lb. Whether abs follow the usual reps-against-load curve does not matter, because logged sets are placed on Strength Level's own scale. Ab machines are a separate lift.

Seated and lying leg curls are separate lifts with their own Strength Level tables (150 lb row: seated 72 / 112 / 163 / 224 lb, lying 54 / 86 / 127 / 177 lb), because the same stack setting is a different effort on each; a cable or standing curl is closer to lying. Every leg curl logged before the split was priced on the seated table and is now a seated leg curl.

The machine lat pulldown (`/machinelatpulldown`) is a separate lift for a diverging lat pulldown machine whose handles carry less than the stack setting. Its cable runs through a 2:1 loop that the arm lever then partly cancels, so with both handles pulled together the load at the handles is about 0.63 of the stack setting (90% range 0.58-0.67, close to 0.64 at rest and 0.58 after 24 in of pull). The maker publishes no ratio; this was worked out from the cable layout in its assembly manual and a fit to photos of the machine, not measured on one. It uses the lat pulldown table with every weight multiplied by 1.5 (the nearest round figure to 1 / 0.63 = 1.59, at the generous end of the range): its four anchors are the plain lat pulldown's x1.5 (133.5 / 186 / 249 / 322.5 at 150 lb), so a stack setting of 1.5w pays exactly what w pays on the plain lat pulldown. Because price rises faster than weight (see above), this is well under the plain price: at a 220 lb body weight a 180 lb stack setting pays 8.6 a rep against 32.2 on the plain lift.

The reverse grip lat pulldown (`/reversegriplatpulldown`) has its own Strength Level table (men, 150 lb row: 98 / 136 / 183 / 236 lb, read 2026-10-07), about 10% above the plain lat pulldown's 89 / 124 / 166 / 215 at every level.

Bulgarian split squat is two lifts, because Strength Level publishes two 1RM tables (150 lb row): the page that does not name dumbbells, priced as the barbell lift, at 32 / 69 / 123 / 194 lb, and the dumbbell page at 22 / 40 / 63 / 92 per dumbbell, 44 / 80 / 126 / 184 combined. They agree at Intermediate (123 against 126) and differ at the ends (Beginner 32 against 44, Advanced 194 against 184), so a light load pays more on the barbell table and a heavy one slightly more on the dumbbell table (60 lb: 16.4 against 12.7 a rep; 135 lb: 41.3 against 42.7). Neither table includes body weight, so both split squats count part of it as load (decided 2026-10-23); the prices in the previous sentence are from before that change.

**Split squats carry body weight.** A split squat moves the lifter's body as well as the load, so pricing the logged weight alone paid 0 at 0 lb and almost nothing for light sets. Each split squat now counts **k × body weight as load, added both to the logged weight and to every 1RM in its table**, and is priced on that table's curve as usual. No other change is made: both tables keep all four anchors and their own shape, and the price rises with every pound.

- **k = 0.66, the front leg's share of the vertical force.** [Int J Exerc Sci, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12408075/), Table 1, measured both feet on force plates in 9 trained men doing bodyweight Bulgarian split squats. At the bottom with a natural trunk lean the front leg took 391 N of 578 N (wide stance, 0.676) and 390 N of 601 N (narrow, 0.649); the mean is 0.66. Across all six stance and lean conditions the share is 0.61 to 0.72. The share of the total is used rather than of body weight, because the two feet's forces at the bottom sum to less than the reported mean body weight. Assumption: the added load splits between the legs as the body does.
- **Barbell and dumbbells differ at 0 lb.** An unloaded rep pays 1.31 a leg on the barbell table and 0.74 on the dumbbell table (150 lb), because Strength Level's two tables differ at the bottom (Beginner 32 against 44 lb). Each table's own data is kept rather than forcing them to agree (decided 2026-10-23).
- **Why the unloaded price is low.** Counting 0.66 of 150 lb as load, the tables imply about 10 (barbell) and 14 (dumbbell) unloaded reps for a Beginner, so on the 8-rep calibration an unloaded rep sits below Beginner. Pricing it the way bodyweight exercises are priced (from Novice and Intermediate reps) would give 2.6 to 2.9 a leg, but scaling the curve to that multiplies every price by 2.3 (barbell) or 3.9 (dumbbell), so it is not used.
- A weight of 0 or no weight is a rep with the body alone.

| Added load | 0 | 10 lb | 20 lb | 45 lb | 95 lb | 135 lb |
|---|---|---|---|---|---|---|
| Barbell, per leg rep, before | 0 | 0.34 | 1.19 | 5.12 | 14.26 | 20.64 |
| Barbell, per leg rep, now | 1.31 | 2.25 | 3.66 | 8.75 | 17.22 | 23.65 |
| Dumbbells, per leg rep, before | 0 | 0.10 | 0.50 | 3.26 | 13.56 | 21.37 |
| Dumbbells, per leg rep, now | 0.74 | 1.33 | 2.29 | 7.44 | 17.24 | 25.32 |

The other lifts that move the body (deadlift, Romanian deadlifts, good morning, hip thrust) still price the load alone and pay 0 at 0 lb. They are not decided yet.

Romanian deadlift is two lifts for the same reason (150 lb row): `/rdl` is the barbell lift on Strength Level's Romanian deadlift table, 115 / 168 / 235 / 313 lb with the bar, and `/dbrdl` is the dumbbell lift on the dumbbell Romanian deadlift table, 33 / 55 / 83 / 118 per dumbbell, 66 / 110 / 166 / 236 combined (read 2026-10-16, [source](https://strengthlevel.com/strength-standards/dumbbell-romanian-deadlift/lb)). The dumbbell anchors are 57-75% of the barbell ones, so a dumbbell set logged as a barbell one is underpaid.

The machine tricep extension (`/machinetricepextensions`) is priced from Strength Level's machine tricep extension table (150 lb row 58 / 96 / 145 / 204), not the tricep extension table, which is a different exercise (barbell or dumbbell, not a seated stack machine). The chest press (`/chestpress`) is priced from Strength Level's chest press table (150 lb row 70 / 114 / 172 / 242). Strength Level has one machine chest press entry and no separate converging or lever one, so a converging chest press is logged there as the closest match; both weights are the stack setting or the plates loaded.

Preacher curl is two lifts: `/barbellpreachercurl` is priced from Strength Level's preacher curl table (men, 1RM with the bar, 150 lb row 37 / 59 / 87 / 120 lb, read 2026-10-17, [source](https://strengthlevel.com/strength-standards/preacher-curl/lb)), and `/dumbbellpreachercurl` from its dumbbell preacher curl table, combined.

The good morning (`/goodmorning`) is priced from Strength Level's good morning table (men, 1RM, 150 lb row 47 / 91 / 152 / 230 lb, read 2026-10-12, [source](https://strengthlevel.com/strength-standards/good-morning/lb)).

The cable woodchop (`/woodchops`) is priced from Strength Level's cable woodchopper table (men, 1RM, 150 lb row 13 / 36 / 73 / 122 lb, read 2026-10-12, [source](https://strengthlevel.com/strength-standards/cable-woodchopper/lb)). The weight is the stack setting.

The rope overhead tricep extension (`/ropeoverheadtricepextension`) is priced from Strength Level's cable overhead tricep extension table (men, 1RM, 150 lb row 23 / 47 / 80 / 122 lb, read 2026-10-14, [source](https://strengthlevel.com/strength-standards/cable-overhead-tricep-extension/lb)), not the barbell tricep extension table (23 / 49 / 86 / 133), which counts total bar load. The weight is the stack setting. The page does not say which attachment it counts; the rope is logged there as the closest match.

The hip thrust (`/hipthrust`) is priced from Strength Level's hip thrust table (men, 1RM, 150 lb row 93 / 170 / 275 / 406 lb, read 2026-10-12, [source](https://strengthlevel.com/strength-standards/hip-thrust/lb)).

The incline bench press (`/inclinebenchpress`) is the barbell lift, priced from Strength Level's incline bench press table (men, 1RM with the bar, 150 lb row 86 / 119 / 160 / 206 lb, read 2026-10-20, [source](https://strengthlevel.com/strength-standards/incline-bench-press/lb)). Its anchors are about 87% of the flat bench's at every level, so the same weight pays more on the incline. The dumbbell version is `/inclinedumbbellpress`.

The pec deck (`/pecdeck`) is priced from Strength Level's machine chest fly table (men, 1RM, 150 lb row 76 / 117 / 169 / 231 lb, read 2026-10-20, [source](https://strengthlevel.com/strength-standards/machine-chest-fly/lb)), not the cable fly table (12 / 34 / 67 / 112), which is a different movement. The weight is the stack setting.

The EZ bar curl (`/ezbarcurl`) is priced from Strength Level's EZ bar curl table (men, 1RM with the bar, 150 lb row 46 / 65 / 90 / 118 lb, read 2026-10-20, [source](https://strengthlevel.com/strength-standards/ez-bar-curl/lb)), a little above the barbell curl table that `/bicepcurls` uses (39 / 61 / 89 / 123) at the bottom and a little below at the top. The weight is bar plus plates.

The hip abduction (`/hipabduction`) is the seated machine, both legs at once, priced from Strength Level's hip abduction table (men, 1RM, 150 lb row 71 / 122 / 190 / 273 lb, read 2026-10-21, [source](https://strengthlevel.com/strength-standards/hip-abduction/lb); the exercise picture is the seated machine). The weight is the stack setting. Side-lying hip abduction, one leg with an ankle weight, is a separate bodyweight exercise (`/sidelyinghipabduction`).

The leg extension (`/legextension`) is the machine, both legs at once, priced from Strength Level's leg extension table (men, 1RM, 150 lb row 90 / 140 / 205 / 282 lb, read 2026-10-21, [source](https://strengthlevel.com/strength-standards/leg-extension/lb)). The weight is the stack setting. The one-leg cable version is `/singlecablelegextension`.

The seated calf raise (`/seatedcalfraise`) is priced from Strength Level's seated calf raise table (men, 1RM, 150 lb row 54 / 106 / 179 / 271 lb, read 2026-10-21, [source](https://strengthlevel.com/strength-standards/seated-calf-raise/lb); the exercise picture is the plate-loaded seated machine, both legs). Seated, body weight is not on the calves, so it is a plain lift and not the standing calf raise's bodyweight curve. The weight is the plates loaded (or the stack setting on a stack machine).

The machine shoulder press (`/machineshoulderpress`) is priced from Strength Level's machine shoulder press table (men, 1RM, 150 lb row 49 / 88 / 142 / 208 lb, read 2026-10-22, [source](https://strengthlevel.com/strength-standards/machine-shoulder-press/lb)), not the overhead press table that `/overheadpress` uses (57 / 83 / 116 / 154), which is a free barbell. The weight is the stack setting or the plates loaded.

The 1RM tables used (Beginner / Novice / Intermediate / Advanced, men at 150 lb; dumbbell lifts in the combined convention) are in `src/strengthLevelTables.ts` with their source and read date.

## Limits

- Per-rep pricing underpays short heavy sets and overpays long light ones. For an Intermediate bench lifter (1RM 183 lb), a 3-rep all-out set pays about 0.5 of what a 10-rep all-out set pays and a 20-rep set about 1.2; for a Novice (137 lb) the figures are about 0.6 and 0.8. Fixing this needs each set's reps stored.
- The curve at the very light end and above the Advanced anchor is extrapolated.
- Only 15 of 651 logged bodyweight-exercise entries have added weight (calf raise 6, squat 4, lunge 3, push-up 2), so the weighted-bodyweight curves are lightly exercised.

## Sources

Strength Level men's 1RM standards at 150 lb for each lift, for example [bench press](https://strengthlevel.com/strength-standards/bench-press/lb), and Strength Level's [FAQ](https://strengthlevel.com/faq) and [one rep max calculator](https://strengthlevel.com/one-rep-max-calculator), read 2026-10-06. Nuzzo et al. 2024 (full paper read). Hewit et al. 2019 and Winter's Table 4.1 as linked above.
