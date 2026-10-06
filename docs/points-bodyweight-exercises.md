# Bodyweight exercises

Flat prices for exercises where the load is your own body, from the row for your weight class. Overview: [points.md](points.md). The ladder these prices come from: [points-foundation.md](points-foundation.md). Added load and assisted versions are in [points-lifts.md](points-lifts.md).

## A flat price per rep

Points = reps × price. The price is flat because the load never changes; effort shows up as reps. Entries store only total reps (3 sets of 10 is stored as 30), so a price that fell or rose with the rep count would need the set structure to be stored.

An exercise's **implied price** at a level is that level's ladder value divided by Strength Level's reps to failure at that level, in the row for the person's body weight (men, 110-310 lb; 150 lb unless they set one with [`/weight`](points-weight-class.md)). Novice implies 120 ÷ reps and Intermediate 240 ÷ reps.

One price cannot match the ladder at every level, because each exercise's rep curve differs a little from the push-up's. The price is the **midpoint of the Novice and Intermediate implied prices**, since the group sits between those two levels ([points-foundation.md](points-foundation.md)). The table is the 150 lb row.

| Exercise | Reps (Novice / Intermediate) | Implied price (Novice / Intermediate) | Price | Gap between levels |
|---|---|---|---|---|
| Push-up | 20 / 40 | 6.00 / 6.00 | 6 | 0% |
| Pull-up | 7 / 14 | 17.14 / 17.14 | 17.14 | 0% |
| Dips | 10 / 20 | 12.00 / 12.00 | 12 | 0% |
| Chin-up | 8 / 14 | 15.00 / 17.14 | 16.07 | 13% |
| Sit-up | 27 / 57 | 4.44 / 4.21 | 4.33 | 5% |
| Squat | 26 / 58 | 4.62 / 4.14 | 4.38 | 10% |
| Leg raise | 12 / 31 | 10.00 / 7.74 | 8.87 | 23% |
| Lunge | 14 / 38 | 8.57 / 6.32 | 7.44 | 26% |
| Ab-roll | 7 / 21 | 17.14 / 11.43 | 14.29 | 33% |
| Burpee | 10 / 35 | 12.00 / 6.86 | 9.43 | 43% |
| Calf raise | 30 / 63 | 4.00 / 3.81 | 1.4 (see below) | |

The gap is how far apart the two levels' implied prices are, so it is the error at either level if one price is used.

Notes:

- Strength Level does not say whether a lunge rep counts each step or each pair.
- As a consistency check, a burpee priced as a squat plus a push-up is 4.38 + 6 = 10.38, within about 10% of the 9.43 from its own table.

## Price by body weight

The Novice and Intermediate reps are read from the person's row (each interpolated linearly in body weight between Strength Level's 10 lb rows, then turned into a price). Every bodyweight exercise follows its own row, with no exceptions; run and swim do not depend on body weight.

| Exercise | 120 lb | 150 lb | 200 lb |
|---|---|---|---|
| Push-up | 6.02 | 6.00 | 6.40 |
| Pull-up (and assisted pull-up at zero assistance) | 17.14 | 17.14 | 18.57 |
| Chin-up | 17.14 | 16.07 | 18.57 |
| Dips | 12.67 | 12.00 | 12.32 |
| Sit-up | 3.82 | 4.33 | 5.28 |
| Squat | 3.96 | 4.38 | 5.23 |
| Lunge | 6.86 | 7.44 | 8.25 |
| Calf raise | 1.24 | 1.40 | 1.69 |
| Ab-roll | 21.00 | 14.29 | 13.50 |
| Assisted ab-roll | 13.44 | 9.14 | 8.64 |
| Burpee | 10.00 | 9.43 | 9.87 |
| Leg raise | 9.09 | 8.87 | 9.74 |

Two prices are not the plain mean of their own table:

- **Calf raise:** the 1.4 at 150 lb is a decision (below), not the table's price. At another weight it is 1.4 × (the person's implied calf-raise price ÷ the implied price at 150 lb), so it keeps its conversion factor and follows the person's row.
- **Assisted ab-roll:** 0.64 × the person's ab-roll price.

## Calf raise: 1.4

The price Strength Level's reps would give is 3.9, but that assumes its reps count the same movement the bot logs, a two-leg bodyweight calf raise. They probably do not.

- **Strength Level does not say** whether its bodyweight calf raise is one leg or two. The page gives no description of the movement, although its seated calf raise standards come as separate single-leg and two-leg pages.
- **Published norms are single-leg and the same size.** In a study of 566 healthy adults aged 20-81, men completed a median of 24 single-legged heel rises to fatigue ([Physiotherapy, 2017](https://www.csp.org.uk/journal/article/physiotherapy-december-2017/updated-reliability-normative-values-standing-heel-rise); women 21, and younger active men did the most). Strength Level's Novice, the 20th percentile, is 30 and its Beginner is 7. That is the magnitude of single-leg reps.
- **So 3.9 is probably a price per single-leg rep.** A two-leg raise takes more reps to fatigue, so each rep should pay less.
- **Two-leg reps are about 2.2 to 3.5 times single-leg reps.** The first line of evidence is calf-specific; the second is a general model applied to calves and carries less weight.
  - *Direct comparison (calf-specific).* In 147 healthy adults aged 20-59, men completed a median of 82 bilateral heel rises to fatigue (85 at ages 20-29, 82 at 30-39; [Monteiro et al., Braz J Phys Ther, 2017](https://www.rbf-bjpt.org.br/en-reference-values-for-bilateral-heel-rise-articulo-S1413355517302411)). The single-leg median for men was 24. The raw ratio is 82-85 ÷ 24, about 3.4-3.5. The true ratio is probably lower: the single-leg sample includes ages up to 81 while the bilateral sample stops at 59, and the single-leg test used a 10° incline, which adds range and cuts reps.
  - *Reps against load (general model, extrapolated to calves).* A meta-regression of 269 studies and 7,289 people ([Nuzzo et al., Sports Med, 2024](https://doi.org/10.1007/s40279-023-01937-7), Fig. 2) gives mean reps to failure at each percentage of 1RM: 26.0 at 50%, 30.4 at 45%, 22.4 at 55%, 60.5 at 25%, 72.8 at 20%. A single-leg raise puts the whole body on one calf; a two-leg raise puts about half on each, assuming an even split. A single-leg set of 24 reps (the male median) is about 53% of 1RM, so half that load is about 26%, which is about 58 reps: a ratio of 2.4. From Strength Level's Novice of 30 single-leg reps (about 45% of 1RM) the same calculation gives 66 two-leg reps, a ratio of 2.2.
- **The price follows from the ratio.** Two-leg Novice reps are 30 × the ratio, so the Novice price is 120 ÷ (30 × 2.2) = 1.82 at the low ratio and 120 ÷ (30 × 3.5) = 1.14 at the high one. At Intermediate it is 240 ÷ (63 × 2.2) = 1.73 and 240 ÷ (63 × 3.5) = 1.09. The range is 1.1 to 1.8, and 1.4 is about its midpoint. The calf-specific comparison alone (ratio 2.5 to 3.5) gives 1.1 to 1.6, with a midpoint of about 1.3, so 1.4 does not depend on the general model.

Limits: the heel-rise studies used different samples and protocols and measured the general population, not gym-goers. Nuzzo et al. did not study calf raises: its authors list calf raise among exercises with minimal data, and its curve comes mostly from bench press, leg press, squat and knee extension and differs between bench press and leg press, so calves may follow a different curve. Its estimates are also least precise at low loads (the 95% interval for the mean at 25% of 1RM is 43 to 86 reps). That Strength Level's reps are single-leg rests on the magnitude match above, not on a statement from Strength Level.

## Assisted ab-roll: 9.14

The exercise is a kneeling rollout on an elbow-support roller, with the forearms flat on the pads. Strength Level has no table for it. It is priced as the person's ab-roll price (14.29 at 150 lb, from Strength Level's ab wheel rollout reps table) × 0.64.

- **Where 0.64 comes from.** [Marchetti et al., MedicalExpress, 2015](https://www.scielo.br/j/medical/a/BK4tJ3s4p95tKh86MKPTy4P/?lang=en&format=pdf) measured rectus abdominis activity in an isometric kneeling ab wheel rollout in 8 resistance-trained men at three shoulder angles. Activity at 90° was 36% lower than at 150° (p = 0.032), so the ratio is 1 − 0.36 = 0.64. The paper reports percentage differences; the ratio assumes each is relative to the larger value, which is consistent across its three comparisons. The authors attribute the difference to the lever arm from the centre of mass.
- **The mapping.** With the forearms on pads the upper arms stay near vertical, so the shoulders stay near the 90° position, while a basic wheel at full reach goes toward 150°. The study did not test the elbow roller; this mapping is an inference.
- **Cross-check.** The lever-arm ratio from Winter's segment lengths (upper arm 0.19 × height against a full arm 0.44) is 0.43, which would give 6.1. The range is 6.1 to 9.1, and the measured figure is used.
- **Assumption.** Price scales in proportion to the demand per rep.

## Activities that earn no points

Trivial activities earn no points. They can be logged for tracking, case by case. The flight of stairs and the ankle alphabet are tracked at 0.

## Sources

Strength Level men's standards by body weight (the 150 lb row is quoted above), read 2026-10-05 and 2026-10-06: [push-ups](https://strengthlevel.com/strength-standards/push-ups/lb), [pull-ups](https://strengthlevel.com/strength-standards/pull-ups/lb), [dips](https://strengthlevel.com/strength-standards/dips/lb), [chin-ups](https://strengthlevel.com/strength-standards/chin-ups/lb), [sit-ups](https://strengthlevel.com/strength-standards/sit-ups/lb), [lying leg raise](https://strengthlevel.com/strength-standards/leg-raise/lb), [bodyweight squat](https://strengthlevel.com/strength-standards/bodyweight-squat/lb), [lunge](https://strengthlevel.com/strength-standards/lunge/lb), [ab wheel rollout](https://strengthlevel.com/strength-standards/ab-wheel-rollout/lb), [burpees](https://strengthlevel.com/strength-standards/burpees/lb), [bodyweight calf raise](https://strengthlevel.com/strength-standards/bodyweight-calf-raise/lb). Calf raise: the Physiotherapy 2017 abstract (the full paper was not available), Monteiro et al. 2017, and Nuzzo et al. 2024 (full paper read), linked above. Assisted ab-roll: Marchetti et al. 2015 (full paper read); Winter, *Biomechanics and Motor Control of Human Movement*, Table 4.1.
