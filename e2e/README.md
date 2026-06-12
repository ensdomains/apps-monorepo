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
| Local dev (optional) | Stagehand (`@browserbasehq/stagehand`) | LLM-driven prototyping of new flows |

**Config**: `playwright.config.base.ts` — shared settings (single worker, no parallelism, retries on CI only). Each project extends it in `projects/<app>/playwright.config.ts`.

---

## Project Structure

```
e2e/
├── playwright.config.base.ts       # Shared config
├── fixtures/
│   ├── playwright.manager.fixture.ts  # Manager app fixture (headless web3 wallet)
│   ├── playwright.portal.fixture.ts   # Portal app fixture (headless web3 wallet)
│   └── stagehand.fixture.ts           # Optional Stagehand fixture (local dev)
├── helpers/
│   ├── manager-auth.ts             # Manager RainbowKit connect + SIWE modal helpers
│   ├── portal-auth.ts              # Portal RainbowKit connect helpers
│   ├── console-monitor.ts          # Transaction state tracking via console logs
│   └── wait-helpers.ts             # sleep() utility
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

Both apps connect an injected wallet via RainbowKit using `@ensdomains/headless-web3-provider`:

- **`injectHeadlessWeb3Provider({ page, privateKeys, chains })`** — injects an EIP-1193/EIP-6963 provider that RainbowKit discovers as "Headless Web3 Provider"
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
pnpm e2e:infra:up    # Start Anvil + Alto + Paymaster
pnpm e2e:infra:down  # Stop the stack

# Against a specific app URL
MANAGER_APP_URL=https://staging.example.com pnpm e2e:manager
```

---

## Test Suite: Registration (Rhinestone)

**File**: `projects/manager/tests/registration-rhinestone.spec.ts`

Same registration flow as the standard registration test (`registration.spec.ts`) but exercises the Rhinestone provider path. The smart account is created via the Rhinestone SDK, and transactions go through the local mockestrator orchestrator.

### Additional Infrastructure

The mockestrator (`public.ecr.aws/rhinestone/mockestrator:latest`) is included in the e2e Docker stack. It simulates the Rhinestone orchestrator locally, using:
- `e2e/infra/mockestrator/rpcs.json` — maps chain 11155111 to the Anvil fork
- `e2e/infra/mockestrator/chains.json` — maps token symbols to our fork's MockUSDC/DAI addresses

### Required Environment Variables

Add these to the manager app's `.env` (in addition to the standard local E2E vars):

```
VITE_FF_RHINESTONE_SESSIONS=true
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
