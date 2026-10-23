# Height and age

How a person's height, and optionally their age, enter the price of some lifts. Overview: [points.md](points.md). The weight class it builds on: [points-weight-class.md](points-weight-class.md). The lift curve it moves: [points-lifts.md](points-lifts.md).

## The rule

**A lift with a height coefficient is scored against lifters of the person's weight and height.** At the same body weight, taller men lift less in the bench press, squat and deadlift. Strength Level's rows average over every height at a weight, so without this they underrate a lifter who is tall for their weight and overrate a short one. This is principle 3 again: a lift that is rarer among men of your weight and height is harder.

- Setting a height (`/height`) and an age (`/age`) is optional, and both are public. With neither set, nothing changes.
- Only the lifts in the table below move. Every other exercise is priced exactly as before.

## The formulas

**Expected height at a body weight.** The average height of men at that weight, from ANSUR II, the US Army's 2012 survey that measured 4,082 men (`src/scripts/fit-ansur.ts`):

ln(expected height in cm) = 4.6741 + 0.1113 × ln(body mass in kg)

That is 171.4 cm at 150 lb, 174.9 cm at 180 lb and 178.8 cm at 220 lb. The residual SD is 3.4%, about 6 cm, and the fit is within about 1 cm of the 10 lb bin means from 120 to 300 lb.

**The factor on a lift's 1RM anchors.**

factor = exp(β × (height − expected height at the person's weight))

- **What it does.** All four anchors are multiplied by it. Each cm above the expected height lowers them by a fixed percentage.
- **Where β comes from.** [Isenmann et al. 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13338387/) fit ln(1RM) as a sum of a height term, mass terms and age terms in 196 men, from beginners to international powerlifters, with height measured. There is no height × mass term. A table indexed by mass alone therefore holds the expected height's share, and only the person's distance from it is missing.
- **Why one factor for all four levels.** The model has one residual SD, so a given percentile sits at the same ratio to the expected 1RM at every height.
- **What it does to the curve.** Scaling the anchors by the factor moves the curve along the weight axis: a weight W pays what W ÷ factor paid before. Between anchors the price is a power law with exponent about 2.4, so a 10% shift in the anchors moves the price about 25%.

**A lift that also moves the body** (the deadlift, RDLs and a squat with a weight, with k × body weight as load; [points-lifts.md](points-lifts.md)): the factor moves the bar 1RMs, and the body is added after. Isenmann measured the bar alone.

| β per cm (men, reduced model) | Bench press | Back squat | Deadlift |
|---|---|---|---|
| Height | −0.0158 | −0.02408 | −0.01987 |

**The deadlift coefficient is the reduced model's.** Isenmann reports two models.

- The complete model kept, for each lift, whichever predictors were significant. For the deadlift that left age out, and height came to −0.00999.
- The reduced model uses one predictor set for all three lifts: height, age, age², ln m and ln m². With age back in, height is −0.01987, so height and age were correlated in that sample. Bench and squat had age in both models, and their height coefficients barely move.
- The bot scores against mass and height and leaves age neutral unless it is set. Among adult US men, average height barely changes with age (NHANES 2015–2018: 175.8 cm at 20–29, 176.3 cm at 30–39), so the age-adjusted coefficient is the one that carries over. The authors also chose the reduced model for their own scores.

## Which lifts

A lift gets a coefficient only in one of three cases:

1. Isenmann measured it.
2. It is the same movement as one of those lifts, done with another implement, grip or bench angle. A variant's 1RM runs at a near-constant fraction of the barbell 1RM: Smith bench = 0.95 × free-weight bench ([Cotterman et al. 2005](https://pubmed.ncbi.nlm.nih.gov/15705030/)), and the dumbbell and Smith gaps are fixed percentages ([Saeterbakken et al. 2011](https://pubmed.ncbi.nlm.nih.gov/21225489/)). In the log model a constant fraction cancels, so β carries over.
3. A study measured it directly.

Nothing gets a coefficient because its movement looks like a measured lift's.

| Lifts | β per cm | Evidence |
|---|---|---|
| Bench press | −0.0158 | Measured (Isenmann) |
| Close-grip bench, incline bench, dumbbell bench, incline dumbbell press | −0.0158 | Same movement as the bench |
| Chest press | −0.0158 | Same movement as the bench. [Stanelle et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC9219326/) measures the machine directly at about −0.010 |
| Squat with a weight (`/squats` priced on the barbell squat table, [points-lifts.md](points-lifts.md)) | −0.02408 | Measured (Isenmann, back squat). It moves the table's bar 1RMs; the body is added after. A squat with no weight is a bodyweight exercise and does not move |
| Deadlift | −0.01987 | Measured (Isenmann) |
| RDL, dumbbell RDL | −0.01987 | Same movement as the deadlift |
| Leg press, single-leg press | −0.02408 | Stanelle measures the leg press directly at −0.010 to −0.014, the same sign as the squat. Decided 2026-10-23 to use the squat's coefficient: Stanelle's chest press also runs at about 0.6× Isenmann's bench, so its smaller numbers are taken as its scale, not a different effect |
| Every other lift | 0 | Below |

Lifts with no coefficient:

- **Single-joint lifts are measured, and the effect is close to zero.** Curls, triceps, lateral raises, leg extensions, leg curls and calf raises come out between about −0.006 and +0.006 per cm once torque is converted to load at the hand or pad. Most confidence intervals include zero ([Harbo et al. 2012](https://doi.org/10.1007/s00421-011-1975-3); [Douma et al. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC3996060/); Stanelle 2021; [Moraux et al. 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3617997/); [Zhang et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10734189/)). The lat pulldown is about −0.004 in one study.
- **Overhead and shoulder presses: not measured.** A search of about 1,000 papers found no study of them against height at fixed mass, and shoulder torque at fixed mass comes out near zero (Harbo). Machine, dumbbell and Smith shoulder presses follow the overhead press.
- **Not measured:** Bulgarian split squats, good morning, hip thrust, rows, face pulls, rear-delt flies, chest flies, pec deck, hip abduction, cable crunch and woodchops.
- **Bodyweight exercises.** In 795 soldiers, taller men did worse at pull-ups (partial r −0.12) and push-ups (−0.22) at fixed mass, and no different at sit-ups ([Farina et al. 2022](https://pubmed.ncbi.nlm.nih.gov/34302352/)). That is a correlation, not a slope, so it cannot set a price.
- **Wingspan.** It is not collected. Arm length did not survive into Isenmann's men's models, and in ANSUR II men span is 1.033 × height with a coefficient of variation of 2.6%.

## Optional age

The same reduced models give age terms, so age can be set too. It changes nothing for a group in its mid-20s, but it would for an older one.

factor_age = exp(g(age) − g(27.8)), with g(a) = γ₁ × a + γ₂ × a²

| | γ₁ | γ₂ |
|---|---|---|
| Bench press | 0.00576 | −0.00018 |
| Back squat | −0.00105 | −0.00015 |
| Deadlift | 0.00137 | −0.00015 |

- **27.8 is an assumption.** Strength Level publishes no user ages, so the mean age of Isenmann's sample stands in for the age built into its tables.
- **How age is counted.** `/age` takes a birth year, and an entry's age is its year less the birth year. That can run a year high before the birthday, which moves the factor by under 1%.
- **One model, always.** With no age set, the age factor is exactly 1 and the height coefficient is still the reduced model's.

| Age | 20 | 25 | 30 | 40 | 50 | 60 |
|---|---|---|---|---|---|---|
| Bench anchors × | 1.02 | 1.01 | 0.99 | 0.92 | 0.83 | 0.72 |
| Squat anchors × | 1.07 | 1.03 | 0.98 | 0.87 | 0.75 | 0.63 |
| Deadlift anchors × | 1.05 | 1.02 | 0.98 | 0.90 | 0.80 | 0.68 |

## Size of the effect

Price multiplier at 180 lb (expected height 174.9 cm), for a weight between the Novice and Intermediate anchors:

| Height | 165 cm | 170 cm | 175 cm | 180 cm | 185 cm | 190 cm |
|---|---|---|---|---|---|---|
| Bench | ×0.69 | ×0.83 | ×1.00 | ×1.21 | ×1.47 | ×1.77 |
| Deadlift | ×0.62 | ×0.79 | ×1.01 | ×1.28 | ×1.63 | ×2.07 |

One SD of height at a given weight is about 6 cm, which moves the bench price about ±25%. The same height means different things at different weights: 180 cm is 8.6 cm above expected at 150 lb, but 1.2 cm above at 220 lb.

## In the bot

- **`/height`:** `set` takes `cm`, or `feet` and `inches`; also `show [user]` and `clear`. The accepted range is 150–206 cm, the range of Isenmann's sample.
- **`/age`:** `set` takes a birth year; also `show [user]` and `clear`. The accepted ages are 16–64, the sample's range.
- **Replies** are public. An out-of-range value gets a private error.
- **History:** works like body weight. An entry keeps the height and birth year the person had when they logged it (`entries.height_cm`, `entries.birth_year`), so a change affects only what is logged afterwards. A person's first value also goes onto their earlier entries in the running season that have none. A later change or a clear does not touch the past, and closed seasons stay frozen.
- **Storage:** `user_body` holds the current values and `user_body_log` is an append-only record of every change. A clear is logged as an empty value.
- **Pricing record:** a lift's `height` field (`press`, `squat` or `hinge`). A squat with a weight carries it on its `loaded` table. Migration 17 gave it to every lift priced on a table in the list above. `approve-exercise --lift` adds it from the table, or from `--height`.

## Limits

- **One cohort.** The coefficients come from 196 men in one study, and no confidence interval is printed for height.
- **Population proxy.** ANSUR II is measured Army men, not Strength Level users; their height at a weight is assumed to match. Above about 270 lb the bins thin out, so the fit extrapolates there.
- **Self-report.** Height is self-reported and public, as weight is. Men over-report height by about 1 cm ([Merrill & Richardson 2009](https://www.cdc.gov/PCD/issues/2009/oct/08_0229.htm)), which moves the bench factor by about 1.6%. Claiming extra height raises a person's lift points, so it is a trust system with the same visibility as `/weight`.
- **Variant transfer rests on small samples.** The studies behind it had 12–32 people. No study checks whether a person's variant-to-barbell ratio changes with height, and the incline has no data by bench angle.
- **A gap within each person.** A tall lifter's bench is adjusted but their curls are not.

## Sources

- Isenmann E, Geisler S, Havers T et al. Normalization of muscle strength measures in barbell exercises by sex, age, and anthropometry: notes on allometry. *Sci Rep* 2026;16:20797. Table 2 and the model-selection text read 2026-10-22.
- ANSUR II male public data ([OpenLab, Penn State](https://www.openlab.psu.edu/ansur2/)), fitted 2026-10-23.
- Fryar CD et al. Anthropometric reference data, United States 2015–2018. *Vital Health Stat* 3(46), 2021 ([CDC](https://stacks.cdc.gov/view/cdc/100478)).
- Harbo T, Brincks J, Andersen H. *Eur J Appl Physiol* 2012;112:267-75 (Tables 1–2 read).
- Douma RKW et al. *BMC Sports Sci Med Rehabil* 2014;6:10.
- Stanelle ST et al. *Sports Med Health Sci* 2021;3:34-39 (equation figures read).
- Moraux A et al. *BMC Musculoskelet Disord* 2013;14:104.
- Zhang et al. *BMC Public Health* 2023;23:2558.
- Cotterman ML, Darby LA, Skelly WA. *J Strength Cond Res* 2005;19:169.
- Saeterbakken AH et al. *J Sports Sci* 2011.
- Farina EK et al. *Mil Med* 2022;187:1381 (Table I read).
- Merrill RM, Richardson JS. *Prev Chronic Dis* 2009;6(4):A121.
