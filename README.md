# Sendlog

A climbing session tracker for coaches. Log every boulder attempt for each
client — grade, how much of the problem they completed, how hard it felt, and
how long they rested — from a phone, at the wall, with no signal.

Sendlog is an installable web app (PWA). Open it once in Chrome, add it to your
home screen, and it behaves like any other Android app: own icon, full screen,
works offline.

## What it does

**Start a session** by picking the client and typing the venue. Venues you have
used before come back as one-tap chips.

**Log an attempt** after each go:

| Field | |
|---|---|
| Grade | V0–V6, colour-coded |
| Completed | 0–100% on a slider, with 25/50/75/100 shortcuts |
| Perceived effort | 1–10, labelled from *Warm-up* to *Absolute max* |
| Problem name | Optional; previously logged names at this venue are offered as chips |
| Rest | Captured automatically from the rest timer |

**The rest timer** runs by itself. It starts when the session starts, and each
time an attempt is saved the elapsed rest is stored with it and the clock
restarts. Pause and reset are there when a session doesn't go to plan.

Elapsed time is always derived from wall-clock timestamps, so locking the phone,
switching apps or reloading mid-rest all keep the true rest duration. The screen
is held awake while a session is running.

**After the session**, get a breakdown: attempts, sends, hardest send, average
completion, average effort, total and average rest, and an attempts-by-grade
histogram with sends shown as the solid portion of each bar.

**Per client**, the same stats across every session, plus a best-send-per-session
strip to see whether the coaching is moving the needle.

## Your data

Everything is stored on the device, in IndexedDB. No accounts, no server, no
third party ever sees your clients' names.

That also means a lost or wiped phone takes the log with it, so **Settings →
Export backup (JSON)** is the safety net — it restores through *Restore from
backup* on any device. There's also a CSV export (one row per attempt, joined to
its client and venue) for spreadsheets.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build
```

Node 22 or newer.

### Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Enable it once in the repository's
**Settings → Pages → Source → GitHub Actions**, and the app lands at
`https://<owner>.github.io/<repo>/`.

Open that URL on your phone, then Chrome's **⋮ → Add to Home screen**.

Any static host works too — the build is plain files. Set `VITE_BASE` if the app
is served from a subdirectory.

## How it's put together

```
src/
  lib/
    types.ts         Client, Session, Climb, and the V-grade ladder
    db.ts            IndexedDB persistence (one record, debounced writes)
    store.tsx        React context: all reads and mutations
    useRestTimer.ts  Timestamp-based rest stopwatch, survives reloads
    useWakeLock.ts   Keeps the screen on during a session
    useNav.ts        Screen stack wired to the History API
    stats.ts         Session and client summaries
    colors.ts        Grade, completion and effort colour scales
  components/        Shared UI and the attempt-logging sheet
  screens/           One file per screen
scripts/
  make-icons.mjs     Generates the launcher icons (no image dependencies)
```

Three decisions worth knowing about:

- **One blob, not a schema.** All data lives in a single IndexedDB record. A
  full book of clients is well under a megabyte a year, so this keeps reads
  synchronous in React and makes export/import identical to storage.
- **Navigation is a real stack.** `useNav` pushes History entries, so Android's
  back gesture walks back through the app instead of closing it. Bottom sheets
  push their own entry, so back dismisses the sheet first.
- **Timers never count ticks.** Every duration is `Date.now()` arithmetic, which
  is the only thing that stays honest when a mobile browser throttles a
  backgrounded tab.

### Changing the grade range

`GRADES` in `src/lib/types.ts` is the single source of truth. Add `'V7'`, `'V8'`
and so on, then give each new grade a colour in `GRADE_COLORS` in
`src/lib/colors.ts`. Every picker, stat and chart follows.
