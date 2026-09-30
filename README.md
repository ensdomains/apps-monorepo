# ENS Apps

The web applications ENS Labs builds for the ENS protocol, and the shared code
behind them.

| Deployable | What it is | Deployed at |
| --- | --- | --- |
| [`apps/manager`](apps/manager) | The ENS app for ENSv2: register, renew, migrate from ENSv1, manage names and profiles. TanStack Start on Cloudflare Workers. | https://app.ens.dev |
| [`apps/portal`](apps/portal) | The ENS Explorer for ENSv1 and ENSv2 names, addresses, resolvers and registries. Vite SPA behind a Cloudflare Worker. | https://explorer.ens.dev |
| [`workers/api-worker`](workers/api-worker) | Backend for the manager: auth, favorites, notifications, migration faucet. Hono on Cloudflare Workers with Postgres and Queues. | https://app-api.ens.dev |

The official app origins are listed in [TRADEMARK.md](TRADEMARK.md). ENSv2 is
deployed on Sepolia only; each build targets one network via
`VITE_ENS_NETWORK`, and `mainnet` fails the network check until its indexer
endpoints exist.

## Layout

```
apps/manager, apps/portal, workers/api-worker   the deployables above
packages/
  config                 network profiles and the fail-closed build-time config
  indexer                bigname REST client and app-shaped read types
  transaction-manager    XState + neverthrow transaction lifecycle
  smart-account          Rhinestone smart-account helpers and sessions
  migration              ENSv1 to ENSv2 migration service
  l2-primary, og, shared-schema, utils, locales, weave-loader
  dev-tools, dev-time-travel, dev-migration-tool, dev-dqa-overlay, dqa-server
e2e/                     Playwright suites and their Docker stack
docs/                    cross-cutting design docs
```

## Setup

Node.js LTS and pnpm 12 (`npm install -g pnpm@12`; Corepack cannot launch
pnpm 12). Docker for the api-worker database and the E2E stack.

```bash
pnpm install                      # also installs the git hooks

# Manager, http://localhost:3000
cp apps/manager/.env.example apps/manager/.env
pnpm dev:manager

# Explorer, http://localhost:3001
cp apps/portal/.env.example apps/portal/.env
pnpm --filter portal dev

# API worker, http://localhost:2999
cd workers/api-worker
cp .dev.vars.example .dev.vars    # add an RPC URL
docker compose up -d              # Postgres + local Neon HTTP proxy
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm exec drizzle-kit migrate
pnpm dev
```

Each `.env.example` documents its variables. The debug flags in them
(`VITE_FF_USE_EOA`, `VITE_USE_MOCK_WALLET`, `VITE_ENABLE_DEBUG_FEATURES`) are
for local work only.

The brand typefaces are not in the repository; official deployments load them
from `fonts.ens.dev` and everything else falls back to the generic family. See
[`apps/portal/src/assets/fonts/README.md`](apps/portal/src/assets/fonts/README.md).

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `pnpm typecheck:manager`, `pnpm typecheck:portal`, or `pnpm typecheck` in a package (not `npx tsc`) |
| Tests | `pnpm test:manager`, `pnpm test:portal`, `pnpm --filter api-worker test`, `pnpm test:all` |
| Lint | `pnpm check`, `pnpm check:fix` |
| Build | `pnpm build:manager`, `pnpm build:portal` |
| E2E | `pnpm e2e:infra:up`, then `pnpm e2e:manager` or `pnpm e2e:portal` (see [`e2e/`](e2e/README.md)) |

Lefthook formats staged files on commit and runs `biome ci` on push. CI
typechecks, lints, tests and builds the packages a PR changes; E2E runs for PRs
that touch the apps, packages, lockfile or `e2e/`.

## Conventions

- [STYLEGUIDE.md](STYLEGUIDE.md): the coding standard. [REVIEW.md](REVIEW.md)
  and [`.greptile/`](.greptile): what review flags; Greptile reviews every PR.
- [docs/PACKAGE_CONTRACT.md](docs/PACKAGE_CONTRACT.md): required package
  scripts and `pre*` hooks.
- Before touching transactions or the smart account:
  [`packages/transaction-manager/docs/TRANSACTION_FLOW.md`](packages/transaction-manager/docs/TRANSACTION_FLOW.md),
  [`packages/smart-account/DEBUGGING_INTENTS.md`](packages/smart-account/DEBUGGING_INTENTS.md).
- Dependencies are pinned deliberately; the comments in
  [`pnpm-workspace.yaml`](pnpm-workspace.yaml) explain each constraint.
- Keep PRs focused, run typecheck, tests and `pnpm check` for what you touched,
  and summarize the change in the PR body. Owners in
  [`.github/CODEOWNERS`](.github/CODEOWNERS) are requested automatically.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

`apps/` and `workers/` are AGPL-3.0-only; other code is MIT. `docs/`, `e2e/`,
the ENS marks and all font files are excluded from both. See [LICENSE](LICENSE)
and [TRADEMARK.md](TRADEMARK.md).
