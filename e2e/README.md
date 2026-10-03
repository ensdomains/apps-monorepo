# ENS Apps — E2E Tests

## Overview

The E2E test suite lives in `e2e/` at the monorepo root and uses **Playwright** as both the test runner and browser automation tool. Tests are organized per-project under `e2e/projects/`.

> **Manual testing?** To exercise time-based states (grace period, temporary
> premium, expiry) by hand — advancing Anvil **and** the browser clock yourself
> as many times as you like — see [`docs/manual-time-travel.md`](docs/manual-time-travel.md).

---

## Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Test runner + automation | Playwright (`@playwright/test`) | Orchestration, browser control, assertions |
| Wallet | Para (email-based) | Signs transactions in-browser |
| AI test authoring | Playwright Agents (planner/generator/healer) | Dev-time test scaffolding via Claude |

**Config**: `playwright.config.base.ts` — shared settings (single worker, no parallelism, retries on CI only). Each project extends it in `projects/<app>/playwright.config.ts`.

### Pinned images

`anvil` and `mockestrator` are pinned **by digest** in `e2e/infra/docker-compose.yml`. CI runs on throwaway runners and pulls fresh every job, so a service left on a moving tag ships a different build on every run and an upstream push can turn CI red with no change in this repo — an anvil nightly that silently dropped some of the mockestrator's impersonated transactions is what made the manager registration test flaky through August 2026.

The header comment in `docker-compose.yml` records the resolved versions, the evidence, and the procedure for bumping a pin. Alto, the paymaster and Panoptes are intentionally still on moving tags.

---

## Project Structure

```
e2e/
├── playwright.config.base.ts       # Shared config
├── fixtures/
│   ├── playwright.manager.fixture.ts  # Manager app fixture (headless web3 wallet)
│   └── playwright.portal.fixture.ts   # Portal app fixture (headless web3 wallet)
├── helpers/
│   ├── manager-auth.ts             # Manager wallet connect + SIWE modal helpers
│   ├── portal-auth.ts              # Portal wallet connect helpers
│   └── console-monitor.ts          # Transaction state tracking via console logs
├── infra/                          # Docker stack (Anvil + Alto + Paymaster)
├── .claude/agents/                 # Playwright Agents (planner/generator/healer)
├── specs/                          # Test plan directory for Playwright Agents
└── projects/
    ├── manager/                    # Manager app tests
    │   ├── playwright.config.ts
    │   └── tests/
    ├── portal/                     # Portal app tests
    │   ├── playwright.config.ts
    │   └── tests/
    └── cross-app/                  # Cross-app tests
        ├── playwright.config.ts
        └── tests/
```

---

## Wallet Authentication

Both apps connect an injected wallet through their connect dialog using `@ensdomains/headless-web3-provider`:

- **`injectHeadlessWeb3Provider({ page, privateKeys, chains })`** — injects an EIP-1193/EIP-6963 provider that the apps' wallet discovery surfaces as "Headless Web3 Provider"
- **`helpers/manager-auth.ts`** — `connectWithHeadlessWallet(page, wallet)` opens the nav connect modal and authorizes the connection; `authorizeHeadlessConnection(page, wallet)` handles an already-open modal. Also provides the SIWE `dismissBackendAuthModal` / `signInBackendAuthModal` helpers. The manager's Rhinestone HCA signs Intents through the wallet, so the fixture passes signing request kinds as `permitted` to auto-authorize them.
- **`helpers/portal-auth.ts`** — the equivalent `connectWithHeadlessWallet` for the portal app

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MANAGER_APP_URL` | `http://localhost:3000` | Target manager app URL |
| `PORTAL_APP_URL` | `http://localhost:3001` | Target portal app URL |
| `PARA_E2E_EMAIL` | `test1@test.getpara.com` | Test wallet email |
| `PARA_E2E_PIN` | `123456` | OTP / verification code |
| `E2E_DOMAIN` | `e2e-{timestamp}.eth` | Domain to register (fixed = deterministic) |

---

## Test Suite: Registration

**File**: `projects/manager/tests/registration.spec.ts`

Full ENS name registration flow with stablecoin (USDC) payment:

1. Authenticate with Para wallet
2. Search for `E2E_DOMAIN` in the header search bar
3. Click the search result
4. Change registration duration to 2 years ($10 USD)
5. Click "Pay with Stablecoins" → select USDC → "Confirm Payment"
6. Start `ConsoleMonitor` before clicking "BUY NAME"
7. Wait for `monitor.waitForRegistrationComplete(120_000)`
8. Assert `success` state and "Registration Complete" banner

---

## Test Suite: Primary Name

**File**: `projects/manager/tests/primaryName.spec.ts`

Currently skipped (`test.describe.skip`). Two tests:

- **Set Primary Name**: Login → navigate to primetest.eth → Edit Profile → Set Primary Name → wait for two transaction console signals
- **Remove ETH Record**: Login → navigate to primetest.eth → Edit Profile → remove ETH address → save → wait for transaction console signal

---

## Playwright Agents (Dev-Time AI Tooling)

Playwright Agents are dev-time tools for AI-assisted test authoring. They generate standard `@playwright/test` code — they are NOT used at runtime.

### Workflow

1. **Planner** — describe a test flow in plain English, get a structured test plan
2. **Generator** — turn the plan into a working Playwright spec
3. **Healer** — fix failing tests by inspecting errors and updating selectors

Agent definitions are in `.claude/agents/`. Invoke them via Claude Code or VS Code Copilot.

---

## Running the Tests

```bash
# Manager tests
pnpm e2e:manager

# Portal tests
pnpm e2e:portal

# Cross-app tests
pnpm e2e:cross-app

# Infrastructure
pnpm e2e:infra:down && pnpm e2e:infra:up   # Start Anvil + Alto + Paymaster
pnpm e2e:infra:down  # Stop the stack

# Against a specific app URL
MANAGER_APP_URL=https://staging.example.com pnpm e2e:manager
```

### Smoke vs. nightly

The commands above (`e2e:manager`, `e2e:portal`, `e2e:cross-app`,
`e2e:metadata`, plus `e2e:manager-premium`/`e2e:manager-migration`) are the
**full suite** — every spec, including the 347-cell V1 shape matrix. It
takes multiple hours and is intended to run **nightly**, not on every push.

```bash
pnpm e2e:smoke            # curated smoke suite: portal, then manager
pnpm e2e:smoke:portal     # portal half only
pnpm e2e:smoke:manager    # manager half only
```

`e2e:smoke` runs a small, hand-picked subset (12 tests, ~5 minutes measured)
tagged `@smoke` — chosen by "cost of being wrong" (the same risk-tier logic
as [`docs/e2e-build-goal.md`](./docs/e2e-build-goal.md)), so it's meant to
run on **every push/PR** as a fast gate alongside the nightly full run, not
a replacement for it. The full curated list, the justification for each
test, what's deliberately excluded and why, and the measured runtime are in
[`docs/smoke-suite.md`](./docs/smoke-suite.md). The `@smoke` tag is purely
additive — every smoke test keeps whatever `@scenario:`/`@inv:` tag it
already had, so `pnpm e2e:coverage` is unaffected.

---

## Coverage Ledger

```bash
pnpm e2e:coverage                              # reconcile and regenerate the report
pnpm e2e:coverage --results playwright.json    # verify PASS against a real run
pnpm e2e:coverage --update                     # raise the ratchet after a batch lands
```

`pnpm e2e:coverage` reconciles the scenario registry in
[`coverage/scenarios.ts`](./coverage/scenarios.ts) against the committed specs
and the defect register, and regenerates
[`docs/e2e-coverage.md`](./docs/e2e-coverage.md). A test claims a scenario with
a `@scenario:<ID>` tag:

```ts
test('revokes ROLE_SET_RESOLVER', { tag: ['@scenario:C4'] }, async ({ … }) => {
```

An invariant *sweep site* is claimed the same way, with an `@inv:` tag from
[`coverage/invariants.ts`](./coverage/invariants.ts):

```ts
test('detach is not ordered first', { tag: ['@inv:INV1-resolver-detach'] }, …)
```

Rules — what counts as terminal, when to tag, and what CI enforces — are in
[`docs/e2e-build-goal.md`](./docs/e2e-build-goal.md), and the scenario space
itself is [`docs/e2e-test-catalogue.md`](./docs/e2e-test-catalogue.md). The
generated report is checked in and CI fails if it is stale.
[`coverage/handoff.md`](./coverage/handoff.md) says where the last iteration
stopped.

---

## Test Suite: Registration (Rhinestone)

**File**: `projects/manager/tests/registration-rhinestone.spec.ts`

Same registration flow as the standard registration test (`registration.spec.ts`) but exercises the Rhinestone provider path. The smart account is created via the Rhinestone SDK, and transactions go through the local mockestrator orchestrator.

### Additional Infrastructure

The mockestrator (ENS fork: `ghcr.io/ensdomains/mockestrator`, **pinned by digest** — not the upstream `public.ecr.aws/rhinestone/mockestrator` image) is included in the e2e Docker stack. It simulates the Rhinestone orchestrator locally, using:
- `e2e/infra/mockestrator/rpcs.json` — maps chain 11155111 to the Anvil fork
- `e2e/infra/mockestrator/chains.json` — maps USDC to the standalone deployment's Circle Sepolia USDC (balances/allowances at slots 9/10)

Note that it fills an intent by impersonating the smart account and sending **one transaction per call** in the batch, so — unlike the real orchestrator — a batch can land partially. It still reports the intent `COMPLETED`, carrying only the *last* call's transaction hash. A batch that stops halfway therefore looks like success to the app, which then waits for a receipt that never arrives; see [Pinned images](#pinned-images).

### Required Environment Variables

Add these to the manager app's `.env` (in addition to the standard local E2E vars):

```
VITE_RHINESTONE_ENDPOINT_URL=/orchestrator
VITE_RHINESTONE_CUSTOM_RPC_URLS={"11155111":"http://127.0.0.1:8545"}
```

The `/orchestrator` path is proxied by Vite to `http://127.0.0.1:3007` (mockestrator).

---

## Known Limitations

- **Single worker** (`workers: 1`) is required — tests share a Para wallet state
- `waitForConsolePattern` must be set up **before** the triggering click to avoid race conditions
- Para modal animations may need short `sleep()` calls where no completion signal exists
- Playwright's trace/video/screenshot artifacts are captured on failure (configured in base config)
