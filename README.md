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
| Time on the wall | Captured automatically from the stopwatch |
| Rest | Captured automatically from the stopwatch |
| Video link | Optional; paste a YouTube, Instagram or TikTok URL |

**The stopwatch runs itself and tracks two clocks.** It starts resting when the
session does. Tap **Start climbing** when the climber pulls on and the clock
switches to timing the go; tap **Log attempt** when they come off and both
durations — the rest beforehand and the time on the wall — are saved with that
attempt, after which the clocks zero and the next rest begins. Pause, and a
reset that clears only the clock you are looking at, are there when a session
doesn't go to plan.

Never tapping *Start climbing* is fine: the attempt simply records rest only, as
it did before climb timing existed.

Because both are tracked, each session and client also reports a **work:rest
ratio** — `1 : 6` means six seconds resting for every second climbing.

Elapsed time is always derived from wall-clock timestamps, so locking the phone,
switching apps or reloading mid-go all keep the true durations, and the phase
you were in survives a reload. The screen is held awake while a session is
running.

**Beta stays where you already posted it.** Paste a link to a clip and it plays
inline in the log — YouTube (including Shorts, with timestamps preserved),
Instagram posts and reels, and TikTok. Nothing is uploaded and nothing is
hosted here, so there is no storage cost and no second copy of anyone's footage
to look after.

Instagram only renders public posts through its embed, and TikTok short links
(`vm.tiktok.com`) hide the id behind a redirect, so both fall back to a tidy
"open in the app" card. That card sits under every embed anyway, because a
frame that silently fails to load can't be detected from outside it.

A pasted link is untrusted input on its way to an `iframe src`, so none is ever
used verbatim: the URL is parsed, the video id extracted, and the embed address
rebuilt from a fixed per-platform template. Anything unrecognised is never
embedded — it degrades to a plain link, and only when the scheme is http(s) and
the host looks like a real domain.

**Venues recognise themselves.** The first time you climb somewhere you type the
name as normal and the app quietly records the coordinates alongside the
session. On later visits it matches your position against the venues it already
knows and pre-fills the field, showing how far away it thinks you are. You can
always type over it.

This needs no geocoding service and no network — matching is arithmetic on
coordinates you have already collected, so it works offline in a basement
bouldering gym. Indoors the position comes from wifi rather than satellites,
which is accurate enough to tell one venue from another but not two gyms in one
building. Declining the location permission costs nothing but the pre-fill.

**A session snapshot** sits at the top of every session, live while you log and
again when you finish. It turns the numbers into something you can picture:
completion percentages are converted into metres of wall actually covered
(each problem counted at 4.5m, credited in proportion to how far up they got),
and that distance is compared to something recognisable — 66% of Big Ben for a
good session, 83% of Mont Blanc for a season, past Everest for a serious year.
A one-line headline picks out whatever genuinely stood out: a grade sent for
the first time, a clean sweep, a day where the effort never dropped below 8.

The landmark is chosen to land near two thirds rather than to be as impressive
as possible — "10% of the Statue of Liberty" reads as a rounding error, "63% of
a lead wall" reads as a morning's work.

**A rest alarm** can be set to 1, 2, 3 or 5 minutes. When the rest is up the
card glows, the phone buzzes and three rising pips sound. Audio is unlocked on
your first touch of the app, because a browser won't let a page make noise
until you've interacted with it — and the alarm fires long after the last tap.

**Logging a go is celebrated** with confetti and an *Allez!*, with the line
underneath following how the attempt actually went.

**After the session**, get a breakdown: attempts, sends, hardest send, average
completion, average effort, total and average rest, time on the wall, work:rest
ratio, and an attempts-by-grade histogram with sends shown as the solid portion
of each bar.

**Per client**, the same stats across every session, plus a best-send-per-session
strip to see whether the coaching is moving the needle.

## Your data

Everything is stored on the device, in IndexedDB. No accounts, no server, no
third party ever sees your clients' names.

That also means a lost or wiped phone takes the log with it, so **Settings →
Export backup (JSON)** is the safety net — it restores through *Restore from
backup* on any device. There's also a CSV export (one row per attempt, joined to
its client, venue, both durations, the session's coordinates and any video
link) for spreadsheets.

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
    types.ts          Client, Session, Climb, and the V-grade ladder
    db.ts             IndexedDB persistence and forward migration
    store.tsx         React context: all reads and mutations
    useSessionTimer.ts  Two-phase stopwatch (rest / climb), survives reloads
    useGeolocation.ts Single position fix for tagging a session
    venues.ts         Matches a fix against venues you have already named
    video.ts          Parses pasted links into safe, embeddable references
    useWakeLock.ts    Keeps the screen on during a session
    useNav.ts         Screen stack wired to the History API
    stats.ts          Session and client summaries, work:rest ratio
    snapshot.ts       Metres climbed, landmark comparisons, the headline
    sound.ts          Rest-alarm tone and haptics, with the audio unlock
    colors.ts         Grade, completion and effort colour scales
  components/        Shared UI and the attempt-logging sheet
  screens/           One file per screen
scripts/
  make-icons.mjs     Generates the launcher icons (no image dependencies)
```

Three decisions worth knowing about:

- **One blob, not a schema.** All data lives in a single IndexedDB record,
  written on every change rather than debounced. A full book of clients is well
  under a megabyte a year, so this keeps reads synchronous in React, makes
  export/import identical to storage, and means a tap is never still waiting on
  a timer when the phone gets locked.
- **Migration is per field, not per file.** `migrate` in `db.ts` rebuilds every
  record with defaults, so a log written by an older version loads with the
  fields it never had filled in rather than arriving as `undefined`.
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
