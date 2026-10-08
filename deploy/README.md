# Deploying to a VM

Built for Oracle Cloud Always Free, but nothing here is Oracle-specific: it is
plain Ubuntu + systemd. For any other host (GCP, a VPS), set `VM_USER` if the
login is not `ubuntu` and everything else is unchanged.

## One-time, on the host's web console

1. Create an Ubuntu 24.04 instance with a public IPv4 address.
   - Oracle free tier: `VM.Standard.A1.Flex`, 4 OCPU / 24 GB.
   - On "Out of host capacity", change Availability Domain or drop to
     `VM.Standard.E2.1.Micro`.
2. Paste `~/.ssh/oracle_wtca_ed25519.pub` as the instance SSH key.
3. **No inbound ports are needed.** The bot only dials out to Discord, so the
   default security list is already correct.

## From this machine

```bash
./deploy/push.sh <ip>           # ship source, install Node + Chromium, set up systemd
./deploy/send-secrets.sh <ip>   # copy .env + database, then start
```

`push.sh` deliberately excludes `.env` and `*.db`, so credentials and history
only move when you run `send-secrets.sh`.

Then stop the bot on your PC — two instances share one Discord token and would
both reply to every command.

## Redeploying after a code change

```bash
./deploy/push.sh <ip>
```

Safe to re-run. It rebuilds and restarts, and leaves the database alone because
that lives in `/var/lib/wtca-fitness-bot/`, outside the app directory.

## Managing exercises

There is no `/addexercise` any more. Exercises are rows in the database, and the starting set is `SEED_EXERCISES` in `src/exercises.ts`.

- **New exercise or lift:** add it to `SEED_EXERCISES` and redeploy. A key that is not in the table yet is inserted; one that already exists is left alone, so values tuned in the database survive restarts.
- **Change a price:** a price lives in the exercise's `pricing` column, a small JSON record (`{"kind":"flat","p":6}`, `{"kind":"lift","oneRM":[99,137,183,236]}`, or a bodyweight curve with `k`, `reps` and `p`; see `src/scoring.ts`, whose catalog tables hold every locked number). `points_per_rep` is only a display value now and `ref_weight`/`weight_mode` only say whether and how the slash command asks for a weight; neither sets a price unless the exercise has no `pricing` (a hand-made row), where the old rule applies. The bot notices an edit made by another process (the approve script, a sqlite3 session) on its next query, with no restart; restart only to register a new slash command. Prices apply to history, except closed seasons, whose boards are frozen.
- **Retire one:** set `active = 0`.
- **Before changing prices near a season boundary,** make sure the closing board has been frozen (`/seasons` shows it).

## The queue: pricing exercises people log with `/new`

Anyone can log an exercise that is not in the list with `/new`. It is stored as a pending
exercise: it scores 0, shows as "(pending)", gets no slash command, and appears in `/queue`.
Entries keep only their reps and weight, and points are worked out from the exercise's row,
so pricing it backfills every entry with no extra step.

Go through the queue from this machine (the `DB_PATH` is required: the service sets it, a
manual run does not):

```bash
SSH="ssh -i ~/.ssh/oracle_wtca_ed25519 ubuntu@<ip>"
DB=/var/lib/wtca-fitness-bot/fitness.db

# what is waiting, with every raw entry
$SSH "cd /opt/wtca-fitness-bot && sudo env DB_PATH=$DB node dist/scripts/queue.js"

# price one, or fold it into an existing one. Three kinds of price (docs/points-new-exercises.md):
#   --flat <p>        a flat price per rep (per mile or yard for a distance); 0 only tracks it
#   --lift <b,n,i,a>  a weighted lift: Strength Level's men's 1RMs at 150 lb (Beginner,Novice,Intermediate,Advanced),
#                     dumbbells combined. A rep pays by the lift curve at the logged weight; no weight scores 0
#   --bw <p> --k <share> --reps <b,n,i,a> [--assist]
#                     bodyweight with optional added load: <p> is a bodyweight rep's price, k the share of 150 lb counted
#                     as load (1.0 unless sourced), reps Strength Level's reps to failure per level; --assist reads the
#                     weight as assistance. (--onerm <b,n,i,a> replaces --reps when the 1RMs are known directly.)
$SSH "cd /opt/wtca-fitness-bot && sudo env DB_PATH=$DB node dist/scripts/approve-exercise.js approve <key> --label 'Cable Row' --lift 86,123,168,220 --note 'stack setting'"
$SSH "cd /opt/wtca-fitness-bot && sudo env DB_PATH=$DB node dist/scripts/approve-exercise.js approve <key> --label 'Wall Sit' --flat 3"
# --as <new-key> renames it as it is priced (the queued key is whatever the player typed, and it becomes the slash command)
$SSH "cd /opt/wtca-fitness-bot && sudo env DB_PATH=$DB node dist/scripts/approve-exercise.js approve <key> --label 'Wall Sit' --flat 3 --as wallsit"
$SSH "cd /opt/wtca-fitness-bot && sudo env DB_PATH=$DB node dist/scripts/approve-exercise.js merge <key> --into row"

# a new exercise needs its slash command registered
$SSH "sudo systemctl restart wtca-bot"
```

**Noticing the queue.** A Claude Code hook (`.claude/settings.json` runs `tools/check-queue-hook.mjs`) checks the VM when you send a message in a session started in this folder, at most once every 10 minutes. It says nothing when the queue is empty or the VM is unreachable. When something is waiting it adds one line of sanitized names and counts to the model's context (never notes: those are typed by other players). It reads `queue.js --summary`, so redeploy after changing that script.

The script prints how many entries were backfilled and how each person's current-season total
moved. Prices follow `docs/points.md`. Closed seasons stay frozen, so only
the live recount for a past season would change.

## Body weights (/weight)

Anyone can set an optional body weight with `/weight set` (110-310 lb, the range of Strength Level's tables), look up their own or anyone's with `/weight show [user]` and drop it with `/weight clear`. The replies appear in the channel; only an out-of-range error is private. The weight is not shown in charts, recaps or leaderboards. Unset means 150 lb, the reference lifter, so nobody's score changes until they opt in.

- It changes **loaded lifts**, which are scored against Strength Level's men's by-bodyweight rows for that weight (anchors interpolated linearly in body weight), and **weighted bodyweight exercises** (added load, assisted pull-ups), whose load is k x body weight. A bodyweight rep with no added load pays the same flat price for everyone.
- The data is `src/strengthLevelTables.ts` (source and read date in its header). An exercise follows body weight only if its pricing record has a `table` (the catalog ones do; `approve-exercise --table <key>` adds one for a newly priced exercise; without it the exercise scores the same for everyone).
- The current value applies to all of that person's history in a running season; closed seasons stay frozen in `season_standings`.
- Storage: `user_weight` (current) and `user_weight_log` (append-only, a clear is a NULL weight). Admin view: `tsx src/scripts/inspect-db.ts` lists both (read-only); on the VM: `node tools/live-db.mjs "SELECT * FROM user_weight_log"`.
- Scoring picks the weight up through the `entry_points(key, amount, weight, user_id)` SQL function; the bot reloads weights when another process writes the database, and `/weight` itself invalidates the cache.

## Querying the live database

The production database is on the VM. Local `out/*.db` files are rehearsal copies that go stale within hours.
One command reads it, read-only (the VM has no `sqlite3` binary, and the file needs `sudo`):

```bash
node tools/live-db.mjs "SELECT key, label, pricing, ref_weight FROM exercises WHERE key = 'lunges'"
node tools/live-db.mjs --json "SELECT COUNT(*) AS n FROM entries"
```

Only a single SELECT, WITH or PRAGMA is accepted, and the VM opens the file read-only as well, so a write cannot land.
Changes to live data go through the scripts and deploy flow in this file.

## Data fixes (never in the repo)

A fix to the data itself (moving, correcting or removing entries) names real people and applies to one database, so it is **not a migration and is never committed**: the repo is public. Migrations in `src/db/index.ts` are only for schema and for pricing or exercise-level changes that apply to everyone. A fix can be any shape (one entry, one person's day, everyone's entries from a date), so run it as SQL with the local-only `tools/live-db-write.mjs`:

```bash
# 1. dry run (the default): runs the SQL in a transaction on the VM, shows what would change, rolls back
node tools/live-db-write.mjs "UPDATE entries SET exercise_key = '<key>' WHERE <which rows>"
# 2. apply: --expect is the exact number of rows it must change (any other count rolls everything back)
node tools/live-db-write.mjs "<same SQL>" --apply --expect <n> --label "what and why"
```

It refuses DDL and an UPDATE or DELETE with no WHERE, backs the database up to `/var/backups/wtca/pre-datafix-<time>.db` before applying, and appends each applied fix to `tools/data-fixes.log` (local only) so a restored backup can be fixed again. `--db <file>` runs it against a local rehearsal copy instead of the VM. The bot notices the write on its next query; no restart.

## Fast deploy (what a normal code change uses)

Run `npm run check` first. Then, from the repo root:

```bash
KEY=~/.ssh/oracle_wtca_ed25519; HOST=ubuntu@<ip>
tar czf /tmp/wtca-src.tgz src tsconfig.json package.json && scp -i $KEY /tmp/wtca-src.tgz $HOST:/tmp/wtca-src.tgz
ssh -i $KEY $HOST 'cd /opt/wtca-fitness-bot &&
  sudo rm -f /var/backups/wtca/pre-change.db &&
  sudo node -e "const D=require(\"better-sqlite3\");new D(\"/var/lib/wtca-fitness-bot/fitness.db\",{readonly:true}).exec(\"VACUUM INTO \x27/var/backups/wtca/pre-change.db\x27\")" &&
  sudo tar xzf /tmp/wtca-src.tgz && sudo nice -n 19 npx tsc &&
  sudo systemctl restart wtca-bot && sleep 15 &&
  sudo journalctl -u wtca-bot --since "-1min" --no-pager | grep -E "Logged in|registered|next run|rror"'
```

- The backup comes first, because a migration or price change cannot be undone any other way. Rename it per change (`pre-<what>.db`) if you want to keep it.
- `nice` keeps the compile from starving the running bot, which would make live commands time out.
- A restart drops commands for about 15 seconds. Give the user a heads-up first if they may be mid-workout.
- Journal timestamps are UTC (4 hours ahead of New York in October).
- A script-only change (anything under `src/scripts`) needs the compile but not the restart.

## Operating it

```bash
ssh -i ~/.ssh/oracle_wtca_ed25519 ubuntu@<ip>

sudo systemctl status wtca-bot
sudo journalctl -u wtca-bot -f       # live logs
sudo systemctl restart wtca-bot
```

The service is `Restart=always` and enabled at boot, so it survives both crashes
and host reboots.

## Pulling the database back

```bash
scp -i ~/.ssh/oracle_wtca_ed25519 ubuntu@<ip>:/var/lib/wtca-fitness-bot/fitness.db ./backup.db
```

Stop the service first, or use `sqlite3 ... "VACUUM INTO"` on the host, so the
copy is not missing recent writes still held in the WAL.

**Re-copying over an old snapshot:** delete the `-wal` and `-shm` sidecars too.

```bash
rm -f backup.db backup.db-wal backup.db-shm
```

Replacing only `backup.db` leaves the previous copy's WAL beside it, and SQLite
replays that WAL into the fresh file on open — so the "clean" snapshot silently
comes back carrying whatever you did to the old one. This has now caused a
confusing false result twice; it is not a theoretical risk.
