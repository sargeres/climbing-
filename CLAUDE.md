# Sendlog — working notes

A climbing session tracker for coaches. One person logs boulder attempts for
their clients, from a phone, at the wall. Read `README.md` first for what the
app does; this file is for whoever picks up the work next.

- **Repo** `sargeres/climbing-` (public)
- **Live** https://sargeres.github.io/climbing-/ — deploys on every push to `main`
- **Stack** React 19 + Vite + TypeScript, PWA, IndexedDB. Supabase for the crew feature only.
- **Branch** work goes on `claude/new-session-oke5s6`

## Where things stand

Live on `main`: client logging, the two-phase stopwatch (rest + time on the
wall), GPS venue recognition, video links, the session snapshot, the rest
alarm, the Allez celebration, and crews.

**Open: PR #4** — ready for review, CI green, not merged. Two fixes:
the `gen_random_bytes` schema bug, and moving the crew share control onto the
attempt row where it can be found.

**Never exercised end to end:** a real share against the live Supabase project.
The sandbox blocks `supabase.co`, so every crew test has run against a local
stand-in. The user's next tap is the real test.

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

## Conventions

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
- Push to `claude/new-session-oke5s6`, open a draft PR, let the user merge.

## Plausible next steps

Nothing here is committed to — ask before building.

- Prove the crew works against the live project, then remove that caveat.
- Realtime or polling on the crew feed; it currently refreshes on open.
- Code-split the Supabase client (~65 KB gzipped) so the crew screen loads it.
- Editing or deleting your own crew posts from the board.
- Extending `GRADES` past V6.
- Per-client progress over time; the snapshot only does session and lifetime.
