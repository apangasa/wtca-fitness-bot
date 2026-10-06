# Points

How the WTCA bot scores a workout. This page is the overview. The pages it links to hold the derivations, the data and the sources.

## Principles

1. **Same difficulty, same points,** in any exercise.
2. **Harder, more points.** This is absolute: nobody is compared with themselves.
3. **Difficulty is how rare a performance is among lifters.** The scale is Strength Level's men's standards: Beginner is better than 5% of lifters, Novice 20%, Intermediate 50%, Advanced 80%.
4. **Every number comes from data:** logged data, published tables or studies. The few judgements are named constants, argued where they are used.
5. **Rounding happens only when points are displayed.** Prices and points are never rounded in calculation. Tables in these pages show rounded values for reading.

## How a score is computed

An entry stores an exercise, total reps (or a distance), an optional weight and a day. Points are worked out from the entry and the exercise's pricing record whenever they are read, so changing a pricing record rescores everything logged under that exercise.

- **Points = reps (or distance) × price per rep.**
- **Bodyweight exercises** (push-ups, pull-ups, squats, burpees and so on) pay a flat price per rep, from the row for your weight class (150 lb unless you set a weight).
- **Weighted lifts** pay a price per rep that depends on the weight lifted. Heavier weights pay more than in proportion, because heavier weights are rarer.
- **Weighted bodyweight exercises** (an added load, or an assisted pull-up) follow the lift curve, with body weight counted as part of the load.
- **Cardio** pays per mile (run) or per yard (swim).
- **Sets at one weight combine:** 3 sets of 8 pay exactly what 24 reps at that weight pay. Sets at different weights are separate logs.
- **Closed seasons are frozen** in `season_standings`. A price change never rewrites a trophy; it only changes running totals and career points.

## Prices at a glance

Bodyweight and cardio prices. Bodyweight prices follow your weight class: enter your body weight to see them (the table below is the 150 lb row).

<div data-price-widget data-rows="all"></div>

| Exercise | Price |
|---|---|
| Push-up | 6 per rep |
| Pull-up | 17.1 per rep |
| Chin-up | 16.1 per rep |
| Dips | 12 per rep |
| Burpee | 9.4 per rep |
| Ab-roll | 14.3 per rep |
| Assisted ab-roll | 9.1 per rep |
| Lunge | 7.4 per rep |
| Leg raise | 8.9 per rep |
| Squat | 4.4 per rep |
| Sit-up | 4.3 per rep |
| Calf raise | 1.4 per rep |
| Run | 521 per mile |
| Swim | 103 per 100 yd |
| Flight of stairs, ankle alphabet | 0 (tracked, no points) |

<script type="module" src="assets/price-widget.js"></script>

Examples of weighted-lift prices per rep, at the 150 lb reference body weight:

| Lift | Weights and prices |
|---|---|
| Bench press | 95 lb: 7.9 · 135 lb: 24.3 · 185 lb: 45.6 · 225 lb: 65.5 |
| Deadlift | 135 lb: 4.6 · 225 lb: 26.7 · 315 lb: 51.4 |
| Bicep curl | 30 lb: 3.3 · 50 lb: 15.5 · 70 lb: 28.7 |
| Lateral raise (both dumbbells) | 20 lb: 7.1 · 30 lb: 15.6 · 40 lb: 22.1 |
| Cable crunch (stack) | 20 lb: 0.8 · 30 lb: 2.0 · 40 lb: 4.1 · 60 lb: 10.9 |

Every lift in the bot is priced the same way, from Strength Level's 1RM table for that lift. One rep of 200 lb on bench pays about 53, and two reps of 100 lb pay about 20.

## The pages

| Page | What it covers |
|---|---|
| [points-foundation.md](points-foundation.md) | The rarity scale and the points ladder everything is priced against |
| [points-bodyweight-exercises.md](points-bodyweight-exercises.md) | Flat prices for bodyweight exercises, the calf raise and assisted ab-roll, and activities that earn no points |
| [points-lifts.md](points-lifts.md) | The price curve for weighted lifts, weighted bodyweight exercises, assisted pull-ups and weight conventions |
| [points-cardio.md](points-cardio.md) | Run and swim: the principle, the lifting rate, the reference paces and the limits |
| [points-weight-class.md](points-weight-class.md) | `/weight`: scoring loaded lifts against a person's own weight class |
| [points-new-exercises.md](points-new-exercises.md) | How to price an exercise that is not in the catalog yet |

## In the bot

- **Logging a lift:** every lift is its own command, for example `/benchpress reps weight [sets]`. Weight is required and is the total load in lb: bar plus plates, both dumbbells combined, the stack setting, or the sled load. 3 sets of 8 at one weight is one command; different weights are separate logs.
- **Bodyweight exercises** (`/squats`, `/lunges`, `/pushups`, `/pullups`, `/chinups`, `/situps`, `/calfraises`) take an optional weight, which is added load. With no weight the entry is a bodyweight rep at the flat price. Dips are logged as bodyweight reps.
- **Leaderboards and races** for a weighted lift rank in points, because reps at different weights are different work. Plain exercises rank in their own unit.
- **Points are computed per entry** at that entry's weight, so a day with 115 lb and 135 lb sets prices each correctly.
- **Corrections:** `/undo` removes the latest entry (or one from a past day in the current season). There is no `/set`, because it cannot represent sets at different weights.
- **A lift with no weight scores 0.**

## Limits

- **Entries store total reps at a weight, not sets.** A per-rep price is therefore exactly fair only for sets of one typical length (8 reps; see [points-lifts.md](points-lifts.md)). Pricing each set on its own would need the set structure to be stored.
- **Strength Level is self-reported** by gym-goers and is not a random sample of the population.
- **The ladder's steepness** comes from push-up reps. A gentler ladder would also need per-set data.
- Each page lists the limits that apply to its own numbers.
