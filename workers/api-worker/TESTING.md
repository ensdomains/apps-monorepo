# API Worker Testing

The API worker interacts with several infrastructure boundaries:

* PostgreSQL through Drizzle and the Neon HTTP driver
* Cloudflare Queues
* scheduled Workers
* external HTTP/GraphQL services such as the ENS indexer
* delivery providers such as email, Web Push, and Telegram

Our testing strategy is designed around those boundaries.

The goal is not to maximize the number of tests or mock every dependency. The goal is to make tests independently trustworthy and easy to understand.

## Incremental adoption

This document describes the preferred direction for **new tests and meaningfully changed backend code**. It is not a requirement to stop feature work and migrate every existing test before making other changes.

The API worker contains legacy tests that predate these patterns. Leave them alone when they are unrelated to the task at hand. When adding a new feature, adding new tests, or substantially changing an existing workflow:

* prefer the patterns in this document for the new or changed surface;
* improve an existing boundary when doing so is small and directly supports the change;
* do not turn a focused feature PR into a broad testing-architecture migration;
* do not copy a legacy testing pattern merely because nearby tests currently use it.

Over time, touched areas should move toward these boundaries naturally. Larger migrations of existing tests should be done deliberately when there is enough value and time to justify them.

Where this document describes a preferred pattern that the repository does not yet have infrastructure for, it should be treated as **direction for future work**, not as a claim that the tooling already exists.

## Core principle

**Mock interfaces we own. Contract-test those interfaces against the dependency they wrap.**

Application logic should not normally need to know how to mock:

* Drizzle query builders
* SQL conflict behavior
* GraphQL client internals
* `fetch` implementation details
* Cloudflare Queue ACK/retry internals

Instead, production code should expose meaningful operations at those boundaries.

For example:

```text
application orchestration
    |
    +--> reconcileNotifications(...)
    |       |
    |       +--> Drizzle / PostgreSQL
    |
    +--> getExpiringNamesPage(...)
    |       |
    |       +--> GraphQL / ENS indexer
    |
    +--> queue consumer
            |
            +--> Cloudflare MessageBatch
```

A fast orchestration test can mock `reconcileNotifications()` or `getExpiringNamesPage()`.

A separate contract test proves that the real implementation behaves correctly against PostgreSQL or a fake external service.

This keeps application tests independent from third-party implementation details without leaving the boundary itself untested.

---

# Test layers

The API worker uses several complementary test layers.

They are not percentages or coverage targets. Use the layer that best owns the behavior being tested.

## 1. Pure unit tests

Use pure unit tests for deterministic policy and transformations.

Examples:

* idempotency-key construction
* notification preference decisions
* delivery fan-out rules
* payload parsing
* error classification
* expiry calculations

Prefer these whenever a behavior does not require infrastructure.

A pure test should usually require little or no mocking.

---

## 2. Orchestration tests

Orchestration tests verify how application operations compose.

They should depend on meaningful interfaces we own rather than mocking third-party APIs.

Example:

```text
get recipients
    ↓
reconcile notifications
    ↓
load delivery context
    ↓
reconcile deliveries
    ↓
enqueue jobs
```

An orchestration test may control:

```text
getFavoriteRecipientsPage()
reconcileExpiryNotifications()
getExpiryDeliveryContext()
reconcileExpiryDeliveries()
```

and then assert that the application reacts correctly to those results.

It should not emulate:

```text
db.insert().values().onConflictDoNothing()
db.query.notifications.findMany()
db.batch()
```

Those are implementation details of the database boundary.

### Good orchestration test

```text
Given:
  notification reconciliation returns an existing notification
  delivery reconciliation returns a queued delivery

When:
  the event is processed

Then:
  the persisted delivery ID is handed to the correct queue
  the source message is ACKed
```

### Poor orchestration test

```text
Mock:
  db.insert
  .values
  .onConflictDoNothing
  db.query.notifications.findMany
  db.batch

Then:
  assert those mocks were called in a particular order
```

The second test primarily tests our simulation of Drizzle.

---

# Database boundaries

Database access should be grouped around meaningful operations.

Do not introduce a generic repository layer over Drizzle.

Good database boundaries include operations such as:

```text
getFavoriteRecipientsPage(...)
reconcileExpiryNotifications(...)
reconcileExpiryDeliveries(...)
countActivePushSubscriptions(...)
```

The function name should describe an application-level persistence contract, not merely the SQL operation used today.

The caller should generally not care whether an operation internally uses:

* one query;
* `db.batch`;
* `ON CONFLICT`;
* a CTE;
* another equivalent SQL strategy.

## Avoid thin ORM mirrors

Avoid abstractions such as:

```text
insertNotification(...)
selectNotification(...)
updateNotification(...)
findManyFavorites(...)
```

when their only purpose is to reproduce Drizzle's API one function at a time.

A single-query function is still useful when the operation itself has meaningful domain semantics.

The distinction is intent, not query count.

---

# Real database contract tests

Database boundaries that rely on PostgreSQL/Drizzle behavior should have focused real database tests.

Use the naming convention:

```text
*.db.test.ts
```

These tests use the production database stack:

```text
test
→ production database function
→ Drizzle
→ Neon HTTP driver
→ local Neon HTTP proxy
→ local PostgreSQL
```

They are deliberately opt-in.

## Running DB tests

Start the local dependencies:

```sh
docker compose up -d --wait
```

Then run:

```sh
pnpm test:db
```

Normal:

```sh
pnpm test
```

must never require Docker, PostgreSQL, or the Neon HTTP proxy.

## Explicit opt-in

Real database tests require:

```text
RUN_REAL_DB_TESTS=1
```

The `test:db` package command sets the opt-in.

DB test files/setup must also independently enforce the opt-in. Do not rely only on the package script.

## Current database harness and safety

The current real-DB harness uses the dedicated local database:

```text
postgres://postgres:postgres@db.localtest.me:5432/api_worker_test
```

The `postgresql:` scheme is also accepted.

`REAL_DB_DATABASE_URL` may explicitly provide that same validated local target. The harness must never fall back to `DATABASE_URL`, `.dev.vars`, staging, or production.

The current validator in `src/test-utils/real-db-config.ts` rejects unexpected:

* hostname;
* port;
* username;
* password;
* database name;
* query options or fragments.

Any destructive DB-test setup must pass this validation first.

Current DB tests use unique generated fixture identifiers and clean up only the fixtures they own (for example generated user UUIDs and rows removed through their cascading relationships). They must not truncate unrelated local data.

Do not run concurrent migration or DB-test runs against the same dedicated test database.

## Current database lifecycle

The current `test-db.setup.ts` behavior is:

```text
api_worker_test does not exist
→ create it

api_worker_test already exists
→ keep the existing database

then
→ apply pending checked-in Drizzle migrations
→ run the selected DB tests
```

It **does not currently recreate the database before each `pnpm test:db` run**. Tests therefore must not depend on an otherwise empty database.

This also means the current harness should not be treated as proof that an already-applied local migration can be edited and replayed from scratch.

A useful future improvement is to recreate the dedicated test database and apply the complete checked-in migration set before a DB-test run. That would provide stronger validation of fresh-schema creation, migration ordering, and edited undeployed migrations. Implement that as an intentional harness change rather than assuming it already happens.

## Current `test:db` scope

The `*.db.test.ts` naming convention is the preferred convention for real database contract tests.

At the moment, however, the package's `test:db` script explicitly selects the existing event-ingestion DB suite. Until the script is generalized to discover all `*.db.test.ts` files, adding another DB-test file also requires updating the package script so the new suite is actually run.


---

# What belongs in a DB contract test?

Test behavior that actually depends on the database implementation.

Good examples:

```text
ON CONFLICT idempotency
unique constraints
keyset pagination
JSONB predicates
database defaults
foreign-key behavior
batch/reconciliation queries
migration-created indexes/constraints
```

Do not duplicate every application test against Postgres.

For example:

If `reconcileNotifications()` guarantees:

> every desired notification has one durable row

its DB tests might cover:

```text
all rows new
all rows existing
mixed new/existing
replay produces no duplicates
```

The queue orchestration tests do not also need to simulate those SQL cases.

---

# Database test fixtures

Use narrowly scoped fixture helpers.

Fixtures should:

* use unique IDs/names;
* create only the records required by the scenario;
* make ownership clear;
* clean up only records they created where cleanup is necessary.

Avoid building a general fixture framework unless repeated real usage justifies it.

Avoid tests whose correctness depends on the entire database being otherwise empty.

---

# Cloudflare Queue tests

Cloudflare Queue behavior should use Cloudflare's Workers Vitest test APIs.

Use the supported primitives for:

```text
MessageBatch creation
ExecutionContext
ACK/retry result inspection
```

rather than implementing our own `Message`, `MessageBatch`, `ack()`, or `retry()` behavior.

Queue consumer tests should normally invoke the real worker queue router when the routing behavior is part of the contract.

Typical queue contracts include:

```text
EVENT_INGESTION_QUEUE
input event
→ durable/application work
→ delivery jobs
→ ACK or retry
```

```text
EMAIL_QUEUE / PUSH_QUEUE / TELEGRAM_QUEUE
delivery job
→ provider boundary
→ delivery status
→ ACK or retry
```

```text
DLQ
exhausted failed job
→ delayed requeue OR permanent failure
→ ACK
```

Focus on queue input/output behavior rather than internal call ordering.

---

# Queue producers

It is acceptable to use a minimal recording producer when testing a stage that emits to another Cloudflare Queue.

Example:

```text
real event-ingestion handler
→ recording EMAIL_QUEUE producer
→ captured DeliveryJob
```

The recorded body can then be passed through a real Cloudflare `MessageBatch` into the email consumer.

This lets us test:

```text
stage A output
→ stage B input
```

without implementing an in-memory queue broker.

Do not create a generic fake Cloudflare Queue system.

---

# Full-flow tests

Use a small number of full-flow tests for important workflows.

Full-flow tests should prove that independently tested boundaries compose correctly.

Example:

```text
ExpiryEvent
→ event ingestion
→ persisted notification
→ persisted delivery
→ DeliveryJob
→ email consumer
→ mocked provider
→ delivered status
```

The purpose is not to test every edge case again.

One representative channel is often enough if separate queue contract tests cover the other channels.

Good candidates for full-flow tests include:

* security-sensitive retry recovery;
* durable partial-state repair;
* queue-to-queue identity propagation;
* major user-visible backend workflows.

Avoid enormous end-to-end matrices.

---

# External services and clients

Apply the same owned-boundary principle to external services.

Application code should preferably depend on a meaningful client operation such as:

```text
getExpiringNamesPage(...)
```

rather than knowing how to build/mock the underlying:

```text
GraphQL request
urql exchange
fetch response
HTTP headers
```

## Orchestration tests

Mock the owned client operation:

```text
getExpiringNamesPage() → known domain response
```

and test how the application reacts.

## Client contract tests

When suitable fake-service infrastructure exists, test the real client implementation against that controlled external boundary.

A client contract test should exercise:

```text
real request serialization
real HTTP/GraphQL transport
real response parsing
controlled fake remote service
```

Use named fake-service scenarios when useful for pagination/error cases.

### Current ENS indexer state

Expiry-discovery orchestration already mocks the owned `fetchExpiringNamesPage()` boundary rather than mocking the bigname client or `fetch`. That is the preferred orchestration-test shape.

The API worker does **not currently have a runnable fake-indexer contract harness** that exercises `fetchExpiringNamesPage()` through the real HTTP/GraphQL transport. The fake-indexer example in this document is therefore a preferred future pattern, not an existing test command or service.

If such a harness is added later, the real indexer client should be tested against it while expiry-discovery orchestration tests continue to mock the owned client boundary.

Do not mock GraphQL/client internals in every application test.

---

# External providers

Do not contact real delivery providers during automated tests.

Examples:

* SendGrid
* Web Push endpoints
* Telegram

Test provider adapters using deterministic mocks/fake HTTP responses.

Application/queue tests should depend on the provider boundary rather than on a real network service.

If the provider adapter itself contains important serialization or response handling, test that adapter separately.

---

# Dependency injection

Prefer small explicit dependency objects when orchestration needs controlled boundaries.

Example:

```ts
type Dependencies = {
  readonly reconcileNotifications: typeof reconcileNotifications
  readonly reconcileDeliveries: typeof reconcileDeliveries
}
```

Avoid:

* dependency injection frameworks;
* service locators;
* global mutable test registries;
* classes introduced only for mocking;
* passing the entire application environment when only one dependency is needed.

Production code should wire the real dependencies in one obvious place.

Tests should be able to supply controlled implementations directly.

---

# Mocking guidelines

## Mock

Mock interfaces we own when the test is about their caller.

Examples:

```text
reconcileNotifications
getExpiringNamesPage
sendEmail
```

## Do not deeply mock

Avoid mocking internal APIs of dependencies:

```text
Drizzle query chains
PostgreSQL conflict behavior
GraphQL exchange internals
Cloudflare Message ACK/retry methods
```

## Test the boundary separately

Every meaningful mocked boundary should have an appropriate higher-fidelity test when its implementation matters.

Examples:

```text
database operation
→ *.db.test.ts

indexer client
→ fake-indexer contract test

queue consumer
→ Cloudflare Workers Vitest queue API

provider adapter
→ controlled HTTP/provider mock
```

---

# Avoid duplicated confidence

Do not test the same invariant exhaustively at every layer.

Choose the layer that owns the behavior.

Example:

### DB contract

```text
reconcileNotifications() replay
→ one durable row
```

### Orchestration

```text
reconciled notification
→ continues into delivery processing
```

### Full flow

```text
partially completed event
→ retry repairs final workflow state
```

These are related but distinct responsibilities.

---

# Test naming

Use normal:

```text
*.test.ts
```

for fast tests that run under `pnpm test`.

Use:

```text
*.db.test.ts
```

for tests requiring the opt-in local PostgreSQL stack.

Prefer co-locating tests near the implementation they exercise.

Do not create ticket-number-based permanent test filenames.

Tests should describe enduring application behavior.

---

# Choosing a test layer

When adding a test, ask:

## Is this pure business logic?

Use a unit test.

## Am I testing how several application operations compose?

Use an orchestration test and mock owned boundaries.

## Does correctness depend on actual SQL, constraints, JSONB, Drizzle, or PostgreSQL?

Use a real `*.db.test.ts`.

## Am I testing Cloudflare Queue ACK/retry/routing?

Use Cloudflare's Workers Vitest queue APIs.

## Am I testing our interpretation of an external HTTP/GraphQL protocol?

Test the real client against a fake service.

## Do I need confidence that several already-tested boundaries compose?

Add one focused full-flow test.

If a test requires recreating a third-party library in mocks, the boundary is probably in the wrong place.

---

# A workflow for new backend work

When implementing a backend feature:

1. Identify pure business logic.
2. Identify infrastructure boundaries.
3. Define semantic operations we own at those boundaries.
4. Keep orchestration dependent on those semantic operations.
5. Unit-test pure behavior.
6. Orchestration-test behavior using controlled owned dependencies.
7. Contract-test persistence/client boundaries with their appropriate real/fake dependencies.
8. Add queue contract tests for queue consumers/producers.
9. Add a small full-flow test only when it provides unique confidence.

Do not begin by mocking whatever third-party calls happen to exist in the implementation.

Design the boundary first.

---

# Example: database-backed workflow

Production:

```text
processEvent()
    ↓
getRecipientsPage()
    ↓
reconcileNotifications()
    ↓
reconcileDeliveries()
    ↓
queue jobs
```

Fast orchestration test:

```text
getRecipientsPage            → controlled result
reconcileNotifications       → controlled durable IDs
reconcileDeliveries          → controlled delivery IDs
Cloudflare MessageBatch      → real test API
queue producer               → recorded output
```

Database contracts:

```text
getRecipientsPage.db.test
reconcileNotifications.db.test
reconcileDeliveries.db.test
```

Full flow:

```text
one representative real DB scenario
→ actual boundaries composed
```

---

# Example: external indexer workflow

Production:

```text
expiry discovery
    ↓
getExpiringNamesPage()
    ↓
ExpiryEvents
    ↓
EVENT_INGESTION_QUEUE
```

Fast orchestration test:

```text
getExpiringNamesPage()
→ mocked domain response
→ assert emitted events
```

Future indexer contract test, once a runnable fake-indexer harness exists:

```text
real getExpiringNamesPage()
→ controlled fake ENS indexer
→ assert parsed domain response
```

Today, expiry-discovery tests should mock the owned indexer-client function rather than GraphQL internals. Do not invent a fake service inside an unrelated feature PR solely to satisfy this example.

---

# Commands

Run the following commands from `workers/api-worker`. The package scripts, Compose file, Wrangler configuration, and migration paths used by this testing setup are package-relative.

Run normal tests:

```sh
pnpm test
```

Normal tests must require no running database.

Run type checking:

```sh
pnpm typecheck
```

Run linting:

```sh
pnpm lint
```

Run real database tests:

```sh
docker compose up -d --wait
pnpm test:db
```

Stop local dependencies when finished if desired:

```sh
docker compose stop
```

`pnpm test:db` is explicitly opt-in and uses only the dedicated local test database.

---

# Test quality over quantity

A larger test suite is not automatically better.

Prefer a small test that independently proves a meaningful contract over several tests that duplicate implementation details.

Good tests should:

* survive internal refactors when behavior is unchanged;
* fail when their owned contract is broken;
* be understandable without reverse-engineering a mock framework;
* make the system architecture easier to understand.

Delete obsolete tests and test helpers when stronger boundaries make them unnecessary.

Do not preserve tests solely for test count or coverage percentage.

---

# Safety rules

Automated tests must never:

* connect to production;
* connect to staging without explicit purpose and separate tooling;
* send real emails;
* send real Telegram messages;
* send real Web Push notifications;
* delete data outside their owned local fixtures/database.

Real DB tests must fail closed when database configuration is unexpected.

---

# References inside the codebase

When working on tests, also consult:

* root `STYLEGUIDE.md`
* root `CLAUDE.md`
* the relevant feature/service implementation
* existing nearby tests using the same boundary

When there is tension between generic style guidance and this package-specific testing document, use this document for API-worker testing architecture while continuing to follow the root style rules for TypeScript, error handling, formatting, and code quality.
