# WTCA Fitness Bot

Replaces the hand-edited nightly `#fitness` post. People log with slash commands
(`/pushups 20`), the bot keeps the running totals, and it posts a recap with a
chart at a set time each evening.

- **Runtime:** Node 22+ / TypeScript
- **Storage:** SQLite, single file, no server
- **Charts:** rendered as HTML/CSS/SVG and screenshotted headlessly, so they can
  be restyled by editing a stylesheet

---

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_TOKEN`.
   Treat it like a password; anyone holding it controls the bot.
3. **General Information** tab → copy the **Application ID**. This is `DISCORD_CLIENT_ID`.
4. **Installation** tab (or **OAuth2 → URL Generator**) → scopes `bot` and
   `applications.commands`, bot permissions **Send Messages** and **Attach Files**.
   Open the generated URL and add the bot to your server.

You also need three IDs from Discord itself. Turn on **Settings → Advanced →
Developer Mode**, then right-click to copy:

| What | Where | Goes in |
|---|---|---|
| Server ID | right-click the server icon | `DISCORD_GUILD_ID` |
| Channel ID | right-click `#fitness` | `RECAP_CHANNEL_ID` |

## 2. Configure

```bash
copy .env.example .env
```

Fill in the four values. The rest have working defaults:

| Variable | Default | Meaning |
|---|---|---|
| `TZ_NAME` | `America/New_York` | Timezone for day boundaries and recap timing |
| `DAY_CUTOFF_HOUR` | `4` | A set logged before 4am counts toward the previous day |
| `RECAP_TIME` | `23:00` | When the daily recap posts |
| `DB_PATH` | `%LOCALAPPDATA%\wtca-fitness-bot\fitness.db` | Where the database lives |

## 3. Install and run

```bash
npm install
```

That also downloads a headless Chromium (~115MB), used only for rendering charts.

```bash
npm run register
```

Pushes the slash commands to your server. Run this once at setup, and again
whenever you add an exercise outside Discord. Commands are registered per-server,
so they appear immediately rather than taking up to an hour like global ones.

```bash
npm run serve
```

Or just double-click **`run.bat`**.

---

## Commands

Every exercise is its own command, so the Discord picker autofills it.

### Logging

| Command | Does |
|---|---|
| `/pushups 20` | Adds 20 to today's push-ups. Same shape for pull-ups, chin-ups, sit-ups, ab-rolls, calf-raises, and so on. |
| `/run 3.1` | Miles run, 521 pts per mile. |
| `/swim 1000 [unit]` | Distance swum, 103 pts per 100 yd. Yards by default, or pick meters. |
| `/squats 20 [weight]` | Squats. Weight is added load in lb; leave it blank for a bodyweight squat. |
| `/benchpress reps weight [sets]` | Every weighted lift works like this: bench, narrow grip bench, DB bench, overhead press, leg press, lat pulldown, row, deadlift, RDL, curls, pushdown, cable flies, lateral raise, leg curl, cable crunch, assisted pull-ups. Weight is required. |
| `/new name reps [weight] [sets] [notes]` | Log an exercise that is not in the list yet. It scores 0 and is queued; once an admin prices it, your entries backfill automatically. |
| `/queue` | What is waiting to be priced, who logged it, and the weights used |
| `/undo [exercise] [date]` | Removes your most recent entry (today, or a past day in the current season). |
| `/today` | The day's board as a chart |

How points work: [docs/points.md](docs/points.md) (overview, with pages for bodyweight exercises, lifts, cardio, body weight and pricing a new exercise).

### Stats

| Command | Does |
|---|---|
| `/leaderboard [exercise] [range]` | Who's ahead. Blank exercise = all points combined. Range is this season (default), a past season, last 30/7 days, or all time. |
| `/race [exercise] [range] [days] [daily]` | Running totals over time. `daily:true` shows per-day values instead. |
| `/me [user]` | Season and career card: points by exercise, streak, best day |
| `/seasons` | Hall of fame: every finished season's champion |
| `/name <display> [user]` | The name shown on charts |

### Admin (requires Manage Server)

| Command | Does |
|---|---|
| `/recap` | Posts the recap immediately |
| `/cleanup [count]` | Deletes the bot's own recent messages in the channel (never recaps, season posts or leaderboards) |

There is no in-Discord way to add exercises or change settings. Exercises, prices and
the recap channel and time live in the database; see [deploy/README.md](deploy/README.md).

---

## How the day boundary works

A "fitness day" runs 4am → 4am rather than midnight → midnight, because sets
logged at 1am belong to the previous evening's workout. So `/pushups 20` at
1:30am on the 12th lands on the 11th. Change it with `DAY_CUTOFF_HOUR`, or turn
it off entirely by setting it to `0`.

## Charts

Each chart is HTML and CSS rendered in a headless browser, so restyling means
editing `src/render/theme.ts` — colors, spacing, and type all live in `BASE_CSS`.

Two things in there are load-bearing rather than decorative:

- **Series colors are assigned by join order and stored per user.** Your color
  never changes because someone passed you on the leaderboard. The eight-hue
  order is validated for colorblind separation against the dark background;
  reordering or adding a ninth hue breaks that, which is why a ninth person folds
  into neutral gray instead.
- **Every bar and line carries its name and value as text.** These land in
  Discord as flat PNGs with no hover, so nothing relies on color alone.

`/race` shows running totals by default. Raw per-day values sawtooth to zero on
every rest day and five of those over a month is unreadable — pass `daily:true`
if you want that view over a short window anyway.

## Preview the charts without Discord

```bash
npm run preview
```

Seeds a throwaway database with fake data and writes every chart to `out/`.
Useful for checking a restyle. Does not touch the real database.

---

## Operational notes

**The database is deliberately outside OneDrive.** OneDrive's sync agent copies
files mid-write, which corrupts live SQLite databases. Don't move `DB_PATH` into
a synced folder. To back it up, stop the bot first, then copy the `.db` file.

**This repo is inside OneDrive**, which means `node_modules` gets synced — a lot
of small files. If OneDrive gets slow, right-click the `wtca-fitness-bot` folder
→ **Always keep on this device** off, or move the project to `C:\dev\`.

**The bot is only online while the process is running.** Commands fail silently
in Discord ("application did not respond") when your PC is asleep. Logs are
missed, not queued.

**Moving to a cloud host later:** the only host-specific pieces are `DB_PATH`
(point it at a mounted volume) and the Chromium download, which is why
`playwright install chromium` is wired into `postinstall`. Nothing else assumes
Windows.
