# Points foundation

The scale and the ladder that every price in the bot is derived from. Overview: [points.md](points.md).

## The two rules

1. **Same difficulty, same points,** in any exercise.
2. **Harder, more points.** This is absolute. A person is never compared with themselves.

## Difficulty is rarity

How hard an effort is, is measured by how rare the performance is among lifters. The scale is Strength Level's men's standards at 150 lb, the reference lifter (women's standards run lower, so only the men's column is used):

| Level | Stronger than |
|---|---|
| Beginner | 5% of lifters |
| Novice | 20% |
| Intermediate | 50% |
| Advanced | 80% |

Beginner (5%) is Strength Level's lowest level; nothing below it is defined. Elite (95%) is not used. Advanced is used only as the top anchor when interpolating lift prices, so that heavier weights have a price; nobody is assumed to be at that level.

Example: 20 push-ups and a 10-rep bench at a Novice's 10-rep weight are both "better than 20% of lifters". Equal rarity means equal difficulty, so they pay the same.

Strength Level is self-reported by gym-goers. It is a population of people who log lifts, not a random sample, and its levels are defined within the exercise being logged.

## The ladder

An all-out effort at a given rarity pays the same in every exercise:

| Level | Beginner | Novice | Intermediate | Advanced |
|---|---|---|---|---|
| All-out effort pays | 30 | 120 | 240 | 384 |

The ladder is the push-up's all-out set at each level, priced at 6 points a rep: Strength Level's push-up reps to failure at 150 lb are 5 / 20 / 40 / 64, so 30 / 120 / 240 / 384. The push-up is the unit because bodyweight exercises pay a flat price per rep, so their all-out set is simply reps × price. That fixes the ladder's steepness: pay doubles from Novice to Intermediate because push-up reps do.

Every other price follows from the ladder:

- A bodyweight exercise's flat price is the ladder value divided by the reps to failure at that level, in the person's weight-class row ([points-bodyweight-exercises.md](points-bodyweight-exercises.md)).
- A lift's price per rep at a weight is the ladder value divided by the set length, at the weight where that level's all-out set sits ([points-lifts.md](points-lifts.md)).
- Cardio pays the points of a typical set per minute of training, times the minutes a mile or 100 yd takes at a reference pace ([points-cardio.md](points-cardio.md)).

## Where the group sits

Most logged single sets fall between Novice and Intermediate (all logged entries as of 2026-10-06, leaving out obvious multi-set sums). For lifts, of 21 person-and-lift pairs (each person's best estimated 1RM from sets of 15 reps or fewer), 2 were below Beginner, 9 between Beginner and Novice, 8 between Novice and Intermediate and 2 above Intermediate. The sample is small, and many sets are submaximal, so true levels are probably a little higher.

This is why prices that cannot match the ladder at every level are fitted to the midpoint of Novice and Intermediate.

## Limits

- The ladder is per set. It has no time dimension, which is why cardio needs a separate bridge ([points-cardio.md](points-cardio.md)).
- A gentler ladder (less pay for a higher level) would need each set's reps stored.
