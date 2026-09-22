# Sendlog — working notes

A climbing session tracker for coaches. One person logs boulder attempts for
their clients, from a phone, at the wall. Read `README.md` first for what the
app does; this file is for whoever picks up the work next.

- **Repo** `sargeres/climbing-` (public)
- **Live** https://sargeres.github.io/climbing-/ — deploys on every push to `main`
- **Stack** React 19 + Vite + TypeScript, PWA, IndexedDB. Supabase for the crew feature only.
- **Branch** work goes on `claude/brave-euler-y5mva7` (a parallel session used
  `claude/new-session-oke5s6`; check which branch your PR is on before pushing)

## Where things stand

Live on `main`: client logging, the two-phase stopwatch (rest + time on the
wall), GPS venue recognition, video links, the session snapshot, the rest
alarm, the Allez celebration, and crews.

PR #4 is merged (the `gen_random_bytes` fix and the share control on the
attempt row).

**The app is themed as a two-bit handheld** — four greys, square corners, a
bundled pixel face for chrome only. Colour used to carry the grade ladder and
the completion ramp; both now ride **tone plus dither pattern** instead
(`src/lib/colors.ts`), which as a side effect makes the charts readable for a
red-green colourblind coach. If you add a scale, encode it the same way —
nothing in here may depend on hue.

Also live: per-session delete on the row behind two confirmations, and a
multilingual shout on every logged attempt (`src/lib/shout.ts`) — **confirmed
audible on the user's own phone**, English, Hindi and Malay heard so far.
Instagram sharing is confirmed working on their device too.

**The Sendex** (`src/lib/profile.ts`, `src/lib/creatures.ts`,
`src/screens/ProfileScreen.tsx`) reads a climber's log back as one of the 151
first-generation creatures, with a level 1–99 and a rank out of 12. Three
rules hold it together and breaking any one of them breaks the feature:

1. **Recent sessions dominate.** Session weights halve every two sessions
   back, so a breakthrough afternoon actually moves the number. The first
   version averaged over all time, which made "evolves after each session" a
   lie. The *trait* uses the same weighted window — an early version did not,
   and called someone Napping because of how they climbed in March.
2. **A creature is awarded once.** `collected` excludes it forever, so the
   collection is both the history and the constraint.
3. **The level is the truth, the creature is the costume.** When the fitting
   creatures are used up the matcher drops to the nearest unclaimed one and
   compensates with a title — that is how a level 90 climber becomes an
   Archwizard Growlithe. Verified by seeding a collection of 120 and checking
   the title actually fires; it does not fire in ordinary testing because five
   creatures out of 151 always leaves a close match.

One reading per session, locked by `lastAnalysedSessionId`. Cards for a Sendex
entry, a whole session and a trophy are drawn in `src/lib/storycard.ts`; the
session card leads with the grade chart because that chart means nothing to
non-climbers, which is what makes it read as a game screen.

**Trophies are derived, never recorded** (`src/lib/trophies.ts`). The shelf is
recomputed from the log every time it opens. Watching for a personal best as
it happens loses trophies — the moment is missed while the app is
backgrounded, a later edit invalidates one already banked, a deleted session
leaves one pointing at nothing, and nobody with an existing log gets any. The
only thing stored is `seenTrophies`, so a new one can be badged. Deleting the
session that earned a trophy removes the trophy, and that is covered by a
test.

**Crews have now run against the live project.** Creating a crew, joining by
invite link, sharing an attempt and reading the feed all work on real Supabase.
Commenting failed with "new row violates row-level security policy for table
comments" until the cause was found and `schema.sql` was re-pasted; the project
now reports 10 of 10 policies and every member can comment. **Crews are
verified end to end against the live project**, commenting included.

## The comment RLS failure — fixed

**Cause: a truncated paste of `schema.sql`.** The live database had 7 of 10
policies. `crews`, `crew_members` and `posts` were complete; `comments` had
**none at all**, and RLS on a table with no policies denies everything. The
three comments policies are the last three statements in the file, so a paste
that stopped after `posts_delete_own` installed cleanly and said nothing.

Reproduced exactly: cutting `schema.sql` at that line and running it produces
7 policies, no complaint, and a `diagnose.sql` report identical to the one the
live database gave. Re-running the whole file repairs it and both members can
comment again.

Note it was never a policy *bug* — the policy is correct, and a joined member
can comment on another member's post when the policy is actually installed.
Three causes produce that byte-identical sentence; the other two (a client
`user_id` disagreeing with `auth.uid()`, a commenter who is not a member) were
ruled out before this one was confirmed.

**`schema.sql` now ends with a self-check** that raises if fewer than 10
policies are installed, and prints `Sendlog schema installed - 10 of 10
policies` when they are. A short paste cuts off the self-check too, so the
absence of that line in the results is itself the signal.

**`supabase/diagnose.sql`** reports the installed policy count and attempts
the insert as each member inside a rolled-back subtransaction. Verified to
pass on a healthy database, to name the fault on a broken one, and to store
nothing either way.

It tests **per crew**, against a post in that member's own crew. Its first
version picked the newest post globally and looped over every `crew_members`
row, so on the live database — which has more than one crew — it reported a
member of the *other* crew as `CANNOT comment` on a database that was in fact
completely healthy. A member cannot comment on another crew's post; that
refusal is the rules working. Reproduced and fixed. **A diagnostic that can
cry wolf is worse than none**, because the next real fault is read as more
noise.

## Supabase

Project ref `yfujcgngiraphunjunkk`. The publishable key is committed in
`src/lib/supabase.ts` and is public by design — `supabase/schema.sql` holds the
real security boundary. The user has applied the schema and enabled anonymous
sign-ins.

Anything that changes the schema needs pasting into their SQL editor by hand;
there is no migration runner and no write access from here.

## What this environment can and cannot do

Learned the hard way — check here before concluding something is impossible.

| | |
|---|---|
| `supabase.co` | **Blocked** by egress policy. Don't try to route around it; the proxy says so explicitly. |
| `github.io` | **Blocked.** Verify deploys via the GitHub deployments API instead. |
| GitHub API | Works. The repo is public, so plain `curl` works when the MCP tools are reconnecting. |
| Postgres | **`initdb` is available.** You can run a real PostgreSQL 16 and test SQL and RLS properly. |
| Playwright | Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Install `playwright` in the scratchpad, not the repo. |

### Testing SQL for real

Postgres refuses to run as root, so use an unprivileged user:

```bash
useradd -m pgtest; mkdir -p /tmp/pgtest/{data,sock}; chown -R pgtest /tmp/pgtest
su pgtest -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pgtest/data -U postgres --auth=trust"
su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgtest/data -o '-k /tmp/pgtest/sock -c listen_addresses=\"\"' -l /tmp/pgtest/data/log start"
```

Then reproduce Supabase's layout, or the bugs won't reproduce: pgcrypto in an
`extensions` schema (**not** public), a stubbed `auth.uid()` reading
`request.jwt.claim.sub`, and `anon` / `authenticated` roles. Switch users with
`set role authenticated; set request.jwt.claim.sub = '<uuid>';` to exercise RLS.

### Testing the crew UI

`scratchpad/mocksb.mjs` pattern: a small HTTP server standing in for the
Supabase REST and auth endpoints, with the app built against
`VITE_SUPABASE_URL=http://127.0.0.1:<port>`. Useful for flows and error
handling. **It cannot falsify an assumption about the real API, because it is
built from the same assumptions.** Say so when reporting what it proves.

## Bugs this codebase keeps producing

Check these before writing new code in the same shape.

1. **Effects keyed on a callback identity.** `ActiveSessionScreen` re-renders
   every second to move its clock, so any child effect depending on an inline
   callback is cancelled and restarted every tick. This has broken the bottom
   sheet's history handling *and* the celebration's dismiss timer. Hold the
   callback in a ref and depend on `[]`.

2. **Browser and Node disagree about URLs.** Chromium percent-encodes spaces
   into a hostname where Node throws, so `new URL('https://not a link')`
   *succeeds* in the browser. Validation that passes a Node unit test can be
   wrong in the app. Drive a real browser.

3. **Supabase hides extensions.** Extensions live in the `extensions` schema,
   so a function with `set search_path = public` cannot see pgcrypto. Prefer
   core functions: `gen_random_uuid()` is in `pg_catalog`, `gen_random_bytes()`
   is not. A PL/pgSQL body isn't resolved until it runs, so this installs clean
   and fails on first use.

4. **Never animate the position of a container holding buttons.** The rest
   alarm did, which made its own controls a moving target. Glow with
   `box-shadow` instead.

5. **Persist immediately, never debounce.** Ending a session navigates straight
   to the summary; a phone locked a moment later would lose a pending write.

6. **Buried affordances don't exist.** The share control sat at the bottom of an
   edit sheet and the person who requested the feature reported it missing. If
   an action belongs to a thing, put it on that thing.

7. **Never send a column the policy compares against `auth.uid()`.** Let the
   column default supply it. A client-supplied copy can only ever agree or
   disagree with the token the request is made with, and disagreement surfaces
   as a flat RLS refusal naming neither half.

8. **A test that cannot fail proves nothing — and a build error hides that.**
   Reverting a fix to check the test catches it produced a tsc error, so the
   preview server kept serving the *previous* bundle and the suite reported
   ALL PASSED against code that no longer existed. Always confirm the negative
   build actually compiled before believing its result.

9. **Assert on the thing you mean, not the thing next to it.** The shout test
   checked which *voice* spoke. A Cantonese word falling back to a Mandarin
   voice reports `zh-CN`, so the assertion passed against a build with the
   voice filter torn out. Reading the `lang` on the rendered word — the
   language actually *chosen* — catches it.

10. **Tree-shaking hides an unused export.** Rendering a card from the
   production bundle failed because nothing called the function yet, so
   Rollup dropped it. Import from source via `vite` (dev), not `vite preview`,
   when exercising something not yet wired — or better, wire it.

11. **A screen the app opens on has nothing beneath it.** `useNav` starts at
   index 0 and `back()` is a no-op there, so opening straight onto the crew
   screen from an invite link left the back control inert *and* let Android's
   back gesture close the app. Seed the stack as `[home, crew]` instead. Both
   halves are covered by the Playwright checks; the gesture half needs a
   "still inside the app" assertion, because a page that has left the app also
   fails to look like the crew screen.

## Conventions

- **A negative test, or it proves nothing.** This applies to diagnostics as
  much as to fixes: check that the tool still reports a fault when there is
  one, and reports none when the database is healthy. Revert the fix, confirm
  the check fails, restore it. The nav fix above passed against the *broken* build on
  four of six assertions until the negative run exposed which two mattered.
- **Drive the real app before claiming it works.** Every feature so far has been
  verified in a Pixel-sized Chromium against the production build, and roughly
  half the bugs above were found that way rather than by reading.
- Report what the tests *don't* cover as plainly as what they do.
- `migrate()` in `src/lib/db.ts` rebuilds every record field by field, so older
  logs load with new fields defaulted rather than `undefined`. Bump
  `DATA_VERSION` and add the field there when extending the model.
- The crew can never break the log: `src/lib/crew.ts` returns a `Result` rather
  than throwing, and the logging path never touches the network.
- `GRADES` in `src/lib/types.ts` is the single source of truth for the V-scale.
- Commit messages explain *why*, including what testing found.
- Push to the branch named at the top of this file, open a draft PR, let the
  user merge.
- **A schema change is only applied when the user pastes it.** There is no
  migration runner, so "the fix is committed" and "the fix is live" are
  different claims. Say which one you mean.

## Plausible next steps

Nothing here is committed to — ask before building.

- An invite link tapped while the app is *already open* only changes the hash,
  and `joinCodeFromUrl()` is read once on mount, so nothing happens. A fresh
  load is the normal case, so this is unfixed and low priority.
- Re-join automatically when the stored crew identity outlives its anonymous
  session; today that combination shows an RLS refusal instead.
- Realtime or polling on the crew feed; it currently refreshes on open.
- Code-split the Supabase client (~65 KB gzipped) so the crew screen loads it.
- Editing or deleting your own crew posts from the board.
- Extending `GRADES` past V6.
- Per-client progress over time; the snapshot only does session and lifetime.
