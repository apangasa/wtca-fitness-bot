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

- **Below the Beginner weight,** the Beginner-to-Novice exponent continues downward. Price reaches 0 at 0 lb, and light weights pay very little (bench: 45 lb about 0.3 a rep, 70 lb about 2.1). Strength Level has no data below its 5th percentile; the shape follows the rarity principle, under which an effort easier than the 5th-percentile lifter's earns almost nothing.
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

Segment masses: Winter, *Biomechanics and Motor Control of Human Movement*, Table 4.1. A weight held on the chest sits further from the hip than the trunk's own centre of mass, so a pound there loads the abs somewhat more than a pound of trunk; this is not modelled.

**Squat.** The squat follows the same rule as every other bodyweight exercise: its curve comes from its own reps table (3 / 26 / 58 / 98 reps, k = 1) and is scaled to its flat price at zero load. Strength Level's barbell squat table is not used, because it describes a different population (a barbell Beginner matches a bodyweight Novice, effective 1RM 282 against 280), and mixing the two needs a join with no evidence for its shape.

| Bar | 0 | 45 lb | 90 lb | 135 lb | 185 lb | 225 lb |
|---|---|---|---|---|---|---|
| Price per rep | 4.4 | 8.3 | 13.1 | 17.0 | 21.8 | 25.5 |

For bars above about 124 lb this is lower than the barbell table would give (185 lb: 21.8 against 34.1). The heaviest logged squat bar is 105 lb.

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

The machine lat pulldown (`/machinelatpulldown`) is a separate lift for a pulley/lever machine whose stack number is not the load at the handle. It is priced from the same lat pulldown table and anchors, so it pays exactly what a lat pulldown pays until a stack-to-handle ratio is decided and applied to its anchors. a player's lat pulldown entries up to 2026-10-07 were moved to it; a player's stay on the plain lat pulldown.

The 1RM tables used (Beginner / Novice / Intermediate / Advanced, men at 150 lb; dumbbell lifts in the combined convention) are in `src/strengthLevelTables.ts` with their source and read date.

## Limits

- Per-rep pricing underpays short heavy sets and overpays long light ones. For an Intermediate bench lifter (1RM 183 lb), a 3-rep all-out set pays about 0.5 of what a 10-rep all-out set pays and a 20-rep set about 1.2; for a Novice (137 lb) the figures are about 0.6 and 0.8. Fixing this needs each set's reps stored.
- The curve at the very light end and above the Advanced anchor is extrapolated.
- Only 15 of 651 logged bodyweight-exercise entries have added weight (calf raise 6, squat 4, lunge 3, push-up 2), so the weighted-bodyweight curves are lightly exercised.

## Sources

Strength Level men's 1RM standards at 150 lb for each lift, for example [bench press](https://strengthlevel.com/strength-standards/bench-press/lb), and Strength Level's [FAQ](https://strengthlevel.com/faq) and [one rep max calculator](https://strengthlevel.com/one-rep-max-calculator), read 2026-10-06. Nuzzo et al. 2024 (full paper read). Hewit et al. 2019 and Winter's Table 4.1 as linked above.
