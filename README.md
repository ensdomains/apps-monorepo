# ENS Apps

The web applications ENS Labs builds for the ENS protocol, and the shared code
behind them. Three deployables live here:

| Deployable | What it is | Deployed at |
| --- | --- | --- |
| [`apps/manager`](apps/manager) | The ENS app for ENSv2: search, register, renew, migrate names from ENSv1, edit profiles and records, manage names, notifications. Server-rendered with TanStack Start on Cloudflare Workers. | https://app.ens.dev |
| [`apps/portal`](apps/portal) | The ENS Explorer: browse and manage names on both ENSv1 and ENSv2 (records, renewals, transfers, DNS import), plus addresses, resolvers and registries, with server-rendered Open Graph cards. A Vite SPA fronted by a Cloudflare Worker. | https://explorer.ens.dev |
| [`workers/api-worker`](workers/api-worker) | The backend for the manager app: SIWE auth, favorites, name notifications (email, Web Push, Telegram), a testnet gas faucet for migrations, and the scheduled sweeps that feed them. Hono on Cloudflare Workers with Postgres, KV and Queues. | https://app-api.ens.dev |

Only deployments served from the origins listed in [TRADEMARK.md](TRADEMARK.md)
are operated by ENS Labs.

ENSv2 is deployed on Sepolia only. The apps target one network per build
(`VITE_ENS_NETWORK`), and today `sepolia` is the only network with a complete
profile; a `mainnet` build fails the network check until its indexer endpoints
exist (see [`packages/config`](packages/config/src/networks.ts)).

## Repository layout

```
apps/
  manager/                 ENS app (TanStack Start, wagmi, XState, Lingui)
  portal/                  ENS Explorer (Vite SPA + Worker for OG images and CSP)
workers/
  api-worker/              Backend API (Hono, Drizzle + Postgres, Queues, crons)
packages/
  config/                  Network profiles and the fail-closed build-time config
  indexer/                 Indexer reads: bigname REST client and app-shaped read types
  transaction-manager/     XState + neverthrow transaction lifecycle (EOA and smart account)
  smart-account/           Rhinestone smart-account helpers and scoped sessions
  migration/               ENSv1 to ENSv2 migration service and contract bindings
  l2-primary/              L2 primary-name helpers
  og/                      Open Graph card rendering shared by both apps
  shared-schema/           Runtime schemas shared by manager and api-worker
  utils/                   Small shared helpers (neverthrow, gas, grace period, DNSSEC)
  dqa-server/              Design QA overlay service (comments, cursors, Linear push)
  locales/                 Translation catalogs
  weave-loader/            WebGL registration loader used by the manager
  dev-tools/               Developer drawer for local and QA builds
  dev-time-travel/         Anvil clock control for grace-period and premium testing
  dev-migration-tool/      Creates ENSv1 name states and triggers migration locally
  dev-dqa-overlay/         Design QA overlay client, loaded from dqa-server
e2e/                       Playwright suites and the Docker stack they run against
docs/                      Cross-cutting design docs
patches/                   pnpm patches applied to third-party packages
```

Each app has its own `README.md`, as do `transaction-manager`, `dqa-server`,
`weave-loader` and `shared-schema`.

## Prerequisites

- Node.js LTS (CI runs `node@lts`; Node 22 is known to work).
- pnpm 12, the version pinned in `package.json` under `packageManager`.
  Install it with `npm install -g pnpm@12`; Corepack cannot launch pnpm 12's
  native binary.
- Docker, only for the api-worker's local Postgres and for the E2E stack.

## Getting started

```bash
git clone git@github.com:ensdomains/apps-monorepo.git
cd apps-monorepo
pnpm install
```

`pnpm install` also installs the git hooks (Lefthook). pnpm does not run
dependency install scripts; the packages that would ask are listed and denied
under `allowBuilds` in `pnpm-workspace.yaml`. The lockfile is frozen in CI, so
an install that wants to change `pnpm-lock.yaml` is a signal, not noise.

### Manager

```bash
cp apps/manager/.env.example apps/manager/.env
pnpm dev:manager            # http://localhost:3000
```

The example env targets Sepolia and the hosted backend. Every variable is
documented inline in [`.env.example`](apps/manager/.env.example); the debug
flags there (`VITE_FF_USE_EOA`, `VITE_USE_MOCK_WALLET`,
`VITE_ENABLE_DEBUG_FEATURES`) are for local work only and must never reach a
production deploy.

### Explorer

```bash
cp apps/portal/.env.example apps/portal/.env
pnpm --filter portal dev    # http://localhost:3001
```

### API worker

```bash
cd workers/api-worker
cp .dev.vars.example .dev.vars   # fill in an RPC URL; provider keys are optional
docker compose up -d             # Postgres + a local Neon HTTP proxy
pnpm dev                         # http://localhost:2999
```

The worker's testing approach, including the real-database tests behind
`pnpm test:db`, is described in
[`workers/api-worker/TESTING.md`](workers/api-worker/TESTING.md).

### Fonts

The Dinamo typefaces the apps use (ABC Monument Grotesk, ABC Marist) are not in
this repository and are not covered by its licenses. Official deployments load
them at runtime from `fonts.ens.dev`; anywhere else the CSS falls back to the
generic family. See [`apps/portal/src/assets/fonts/README.md`](apps/portal/src/assets/fonts/README.md)
and the fonts section of [LICENSE](LICENSE).

## Everyday commands

Run these from the repository root unless noted.

| Task | Command |
| --- | --- |
| Typecheck an app | `pnpm typecheck:manager`, `pnpm typecheck:portal`, or `pnpm typecheck` inside any package |
| Unit tests | `pnpm test:manager`, `pnpm test:portal`, `pnpm --filter api-worker test`, or `pnpm test:all` |
| Lint and format | `pnpm check` (Biome), `pnpm check:fix` to apply |
| Unused code | `pnpm knip` |
| Build | `pnpm build:manager`, `pnpm build:portal` |
| Storybook (manager) | `pnpm --filter manager storybook:dev` |
| Translations (manager) | `pnpm --filter manager i18n:extract`, see [`apps/manager/docs/I18N.md`](apps/manager/docs/I18N.md) |
| E2E | `pnpm e2e:infra:up`, then `pnpm e2e:manager` / `pnpm e2e:portal` / `pnpm e2e:cross-app` |

Typecheck from the app directory with `pnpm typecheck`, not `npx tsc`: the
manager's typecheck first builds the api-worker's exported types, and a bare
`tsc` skips that step and the project config.

### Git hooks

Lefthook runs on every commit and push:

- pre-commit: Biome formats the staged files, and the manager's Lingui catalogs
  are re-extracted when its sources change.
- pre-push: `biome ci` over the repository. Lint errors block the push.

## Testing

- Unit and component tests use Vitest; each package with tests exposes
  `pnpm test`, and most of them `pnpm test:coverage`.
- The api-worker mocks the interfaces it owns and contract-tests them against
  the real dependency; see its [TESTING.md](workers/api-worker/TESTING.md).
- End-to-end tests are Playwright suites under [`e2e/`](e2e), run against a
  Docker stack (Anvil fork of Sepolia with an ENSv2 snapshot, a bundler, a
  paymaster, the indexer, and a local mock of the Rhinestone orchestrator).
  [`e2e/README.md`](e2e/README.md) covers the stack, the headless wallet, and
  manual time travel for grace-period and premium testing.

CI typechecks, lints and tests the packages changed by a PR, verifies the
builds, runs the E2E suites, and runs `npm audit` and CodeQL on every push to
`main` and weekly.

## Conventions

- [STYLEGUIDE.md](STYLEGUIDE.md) is the coding standard: file structure,
  naming, TypeScript, React and state patterns, neverthrow error handling,
  TanStack Query and Router, Tailwind, testing, Biome. Rules are tiered (Must,
  Default, Guideline) and any rule can be broken with a justifying comment.
- [REVIEW.md](REVIEW.md) and [`.greptile/`](.greptile) define what code review
  flags. Greptile reviews every PR against `.greptile/config.json`, so read
  it before opening one.
- [docs/PACKAGE_CONTRACT.md](docs/PACKAGE_CONTRACT.md) defines the script names
  each kind of package must expose and how `pre*` hooks encode build
  dependencies.
- [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md): keep the React layer
  thin; business logic lives in functions and XState machines.
- [CLAUDE.md](CLAUDE.md) (also `AGENTS.md`) holds the instructions coding
  agents follow in this repository.

Package-specific design docs worth reading before touching the area:

- [`packages/transaction-manager/docs/TRANSACTION_FLOW.md`](packages/transaction-manager/docs/TRANSACTION_FLOW.md):
  the transaction lifecycle, and the EOA versus smart-account paths.
- [`packages/smart-account/DEBUGGING_INTENTS.md`](packages/smart-account/DEBUGGING_INTENTS.md):
  how to replay a failed registration intent and read validator errors.
- [`apps/manager/docs/FEATURE_FLAGS.md`](apps/manager/docs/FEATURE_FLAGS.md):
  env-var and per-user feature flags.

## Contributing

Pull requests are welcome. Keep each PR focused on one change, run the
typecheck, tests and `pnpm check` for the packages you touched, and summarize
what changed in the PR body. Branches for tracked work are named after the
ticket (`linear/web-1234`). Code owners for the workflows, the api-worker, the
E2E suite and the core packages are listed in
[`.github/CODEOWNERS`](.github/CODEOWNERS) and are requested automatically.

Dependencies are pinned deliberately: the workspace enforces a minimum release
age, refuses trust downgrades, and pins the last Apache-2.0 release of the
WalletConnect provider. The comments in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml) explain each constraint; read them
before bumping anything they mention.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md):
ENS runs a bug bounty on Immunefi that covers these applications.

## License

Code under `apps/` and `workers/` is licensed under AGPL-3.0-only; everything
else is MIT. The ENS marks and all font files are excluded from both. See
[LICENSE](LICENSE) for the exact terms and exclusions, and
[TRADEMARK.md](TRADEMARK.md) for what you must change before deploying a
modified version.
