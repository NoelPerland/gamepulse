# GamePulse

Game analytics and LiveOps vertical slice. Next.js and TypeScript render a graphite dashboard. A Node.js server handles authenticated ingestion, PostgreSQL queries and WebSocket invalidation. The Unity C# client sends bounded, retryable event batches.

## Architecture

Events contain an immutable UUID, pseudonymous player, session, kind, UTC timestamp and optional level. The database primary key makes retried submissions idempotent. A validated batch commits as one insert. Accepted events trigger a WebSocket notification after persistence. Browsers re-query SQL-derived metrics after notifications and reconnection. Remote configuration uses optimistic version checks so simultaneous edits cannot silently overwrite each other.

The default demo uses disk-backed PostgreSQL via PGlite in `.data/postgres`. Set `DATABASE_URL` to use a standalone PostgreSQL server with the same schema and queries. One application instance owns the embedded database. Multi-instance hosting requires standalone PostgreSQL and a shared notification bus.

## Run

Use Node.js 24. Run `npm ci`, `npm run build`, then `npm start`. Open http://127.0.0.1:3043. The local demo seeds a fictional game once and labels the data as demo. Records and configuration persist through restarts. Use `npm run dev` for development.

Optional process environment variables are `PORT`, `HOST`, `DATABASE_URL`, `GAMEPULSE_DATA_DIR`, `PUBLIC_DEMO` and `SEED_DEMO`. Set `PUBLIC_DEMO=0` to require an operator key for analytics. `SEED_DEMO=0` prevents generated events. The app does not load `.env` files automatically. Set variables in your process or hosting service.

Local write and operator keys are generated in ignored `.data/keys.json`. Run `npm run keys` to read them privately. For hosting, supply strong distinct `GAMEPULSE_WRITE_KEY` and `GAMEPULSE_ADMIN_KEY`, set `PUBLIC_DEMO=0`, use HTTPS and restrict network access. Demo read access never grants ingestion or configuration write access.

## API

- `POST /api/events` accepts one event or an array of 1–100 events. Use `Authorization: Bearer <write-key>` and JSON. Payload limit is64KiB. Success returns201 for accepted events or200 for duplicate-only retries, with accepted/duplicate counts. Invalid batches reject atomically.
- Event kinds are `session_start`, `level_start`, `death`, `level_complete`, and `session_end`. Fields are `id`, `kind`, `player`, `session`, `at`, and `level`. Level is required for level events. Use timezone-qualified timestamps within90days and no more than60seconds ahead.
- `GET /api/summary?days=7` returns metric totals, daily series, level counts, D1 retention and an ordered funnel. Supported ranges are7,14,30days.
- `GET /api/events?days=7&kind=death&q=dock&page=0` searches event identifiers and levels,25events per page. It returns `more` for pagination.
- `GET /api/config` returns versioned game tuning. `PUT /api/config` requires the operator key and `{version,value:{difficulty,bonusXp,eventBanner}}`. Difficulties are easy/normal/hard, XP multiplier1–5, banner at most120characters. Stale versions return409.
- Connect to `/stream` over WebSocket and send `{ "key": "<operator-key>" }` within5seconds. Local public demo readers may send `{}`. The server sends ready, events and config notifications. Refetch after reconnecting.

Except public config, dashboard reads require the operator key when public demo mode is off. Malformed input receives400, unauthenticated ingestion401, unauthorized writes403, missing routes404 and temporary database failure500. Responses are not cached.

## Metric definitions

All day boundaries use UTC. Event and death totals count event rows. Players count distinct pseudonymous IDs with any event in the selected range. Sessions count distinct player/session pairs with a session_start in range. The chart changes between event, player and death counts and exposes daily values on pointer or keyboard interaction.

D1 retention assigns each player to their first observed event day. It includes cohorts in the selected range that have a complete following day and counts a return on that exact next UTC day. Historical first-observed time is not proof of the player's actual install time.

The session funnel requires session_start, then level_start, then level_complete in chronological order within the selected window. A completion without a preceding entry does not advance the funnel. It measures session-level reach, not same-level conversion. Level views count starts/deaths/clears independently and do not claim unique-player completion rates.

## Unity integration

Copy `unity/GamePulseClient.cs` and `unity/FlightExample.cs` into a Unity project. Attach the client and example to GameObjects, set endpoint and development write key in Inspector, and use example methods for level/death/completion events. The SDK reuses UUIDs across retries, batches up to20events and caps its memory queue at256. Failed delivery emits a warning. Call `Track("session_end")` while gameplay is still running when a session ends. App termination delivery is best effort. Queued events do not survive a killed process.

An embedded player write key can be extracted. A publicly distributed game should use a trusted ingestion relay and game-specific validation. This example has not been compiled or played in a Unity Editor in this environment.

## Verification

`npm test` exercises actual PostgreSQL-compatible persistence, atomic invalid-batch rejection, concurrent idempotent retries, exact metric/funnel/retention results, access separation, stale config conflicts and disk restart.

After building, run `npm run test:browser`. Set `CHROME_PATH` to an installed Chromium executable if needed. The test starts its own isolated production server and verifies real ingestion updates the visible metrics, filtered explorer rows, WebSocket reconnect, operator configuration publishing and phone layout. Set `QA_OUTPUT` for screenshots. API and database requests in this regression are real.

## Deployment boundary

This is a functional single-game implementation. Provision a persistent Node host, PostgreSQL backups, TLS, rate limits and operational monitoring before public production use. Per-game tenant isolation, account identity, key rotation UI and a durable client event queue are outside this slice. Seeded demo history is explicitly fictional. No hosted production deployment is claimed.
