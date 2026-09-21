# Notification queue tests

Run from `workers/api-worker`:

```sh
pnpm test
pnpm typecheck
pnpm lint
```

These commands need no running database or Docker. The four persistence tests
are skipped by default, including when their file is selected directly.

## Real PostgreSQL tests

```sh
docker compose up -d --wait
pnpm test:db
docker compose stop
```

`test:db` explicitly sets `RUN_REAL_DB_TESTS=1` and selects only
`src/queues/event-ingestion.db.test.ts`. The file independently checks the flag,
passed into workerd as a test binding. Setup creates `api_worker_test` if absent and
applies the checked-in Drizzle migrations (including the intentional `0004`
migration). It does not reset an existing database.

The only accepted URL is the local connection
`postgres://postgres:postgres@db.localtest.me:5432/api_worker_test`
(`postgresql:` is also accepted). `REAL_DB_DATABASE_URL` can explicitly supply
this URL; any other host/database/credentials or query options fail before setup.
`DATABASE_URL` from your shell or `.dev.vars` is never used by this suite.
Cleanup deletes only generated fixture user UUIDs and their cascading rows.
The dedicated database remains available for inspection. Interrupted runs may
leave fixtures behind; subsequent runs use fresh UUIDs and do not depend on an
empty database. Do not run concurrent migrations against this database.

## What each layer establishes

- `event-ingestion.test.ts`: stable identity/preferences, channel routing using
  persisted delivery IDs, malformed-message ACKs and independent source retries.
  DB responses are fixed at the boundary; they do not implement SQL or state.
- `delivery.test.ts`: actual email/push/Telegram consumers record success/failure
  and ACK/retry correctly. A terminal email replay is ACKed without a send.
  DLQ examples establish delayed channel requeue and permanent failure.
- `terminal-status.test.ts`: compact service checks for all four delivery statuses.
- `event-ingestion.db.test.ts`: real `getDatabase()` → Drizzle Neon HTTP → local
  proxy → Postgres. Covers 501 favorites with owner precedence and 501 owner
  channels (multiple delivery write chunks), durable partial
  notification recovery, replay uniqueness, and the push JSONB active-count SQL.

The replay case also stages the pipeline: seed real rows, ingest an expiry event,
record the emitted email job, then feed that exact body into the real email queue
consumer. It checks the database-generated ID and `delivered` state, and verifies
that delivering the recorded duplicate job does not contact the provider again.

All queue contracts use `createMessageBatch`, `createExecutionContext`, and
`getQueueResult` through `runQueue`, which invokes `worker.queue` and its router.
Only the producer transport is recorded; there is no fake broker, ACK implementation,
SQL parser, conflict simulator or stateful ORM. Delivery contract tests control DB
reads and inspect requested writes; the real-DB suite proves actual persistence.
SendGrid/Telegram calls and Web Push encryption/HTTP are mocked. No real provider
is contacted. DLQ tests supply exhausted jobs explicitly; they do not simulate
Cloudflare's retry scheduler or wait for its retry budget to elapse.

Existing expiry-discovery tests retain the indexer → ExpiryEvent producer contract;
this refactor does not add a second scheduled/E2E harness.

References: [Cloudflare queue test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/),
[Cloudflare recipes](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/),
[local Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy).
