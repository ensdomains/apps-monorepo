# ENS Apps

The web applications ENS Labs builds for the ENS protocol, and the shared code
behind them.

| Deployable | What it is | Deployed at |
| --- | --- | --- |
| [`apps/manager`](apps/manager) | The ENS app for ENSv2: register, renew, migrate from ENSv1, manage names and profiles. TanStack Start on Cloudflare Workers. | https://sepolia.app.ens.domains |
| [`apps/portal`](apps/portal) | The ENS Explorer for ENSv1 and ENSv2 names, addresses, resolvers and registries. Vite SPA behind a Cloudflare Worker. | https://sepolia.explorer.ens.domains |
| [`workers/api-worker`](workers/api-worker) | Backend for the manager: auth, favorites, notifications, migration faucet. Hono on Cloudflare Workers with Postgres and Queues. | https://sepolia.app-api.ens.domains |

Shared code lives in `packages/`, end-to-end tests in `e2e/`. The official app
origins are listed in [TRADEMARK.md](TRADEMARK.md). Each build targets one
network: Sepolia by default, or mainnet via the `dev:mainnet` / `build:mainnet`
app scripts.

## Setup

```bash
pnpm install

# Manager, http://localhost:3000
cp apps/manager/.env.example apps/manager/.env.local # optional overrides
pnpm --filter manager dev

# Explorer, http://localhost:3001
cp apps/portal/.env.example apps/portal/.env.local # optional overrides
pnpm --filter portal dev

# API worker, http://localhost:2999
cd workers/api-worker
cp .dev.vars.example .dev.vars    # add an RPC URL
docker compose up -d              # Postgres + local Neon HTTP proxy
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm exec drizzle-kit migrate
pnpm dev
```

The brand typefaces are not in the repository; official deployments load them
from `fonts.ens.dev` and everything else falls back to the generic family. See
[`apps/portal/src/assets/fonts/README.md`](apps/portal/src/assets/fonts/README.md).

## App environments

Manager and Portal use Sepolia for `pnpm dev` and `pnpm build`. Their
`dev:mainnet` and `build:mainnet` scripts select Vite mode `mainnet`.
`.env.mainnet` sets `CLOUDFLARE_ENV=mainnet`, which also selects Wrangler's
`env.mainnet`; the default Worker remains Sepolia.

- `.env`: committed common public settings and Sepolia defaults.
- `.env.local`: ignored personal overrides for common settings.
- `.env.mainnet`: committed mainnet overrides.
- `.env.mainnet.local`: ignored personal mainnet overrides.

Use `.env.mainnet.local` for network-specific overrides: Vite and Wrangler
order `.env.local` and `.env.mainnet` differently. Keep environment selectors
out of `.env.local`. The Vite configs reject browser/Worker target mismatches.
Network endpoints and backend API defaults live in
[`packages/config`](packages/config/src/networks.ts); env overrides remain
available for local development and the existing `.env.ci` E2E templates.

`VITE_*` values are public and compiled into the browser bundle. Local Worker
secrets can go in ignored env files without that prefix; do not also create
`.dev.vars`, which disables Worker-side env-file loading. Deployed Worker
settings/bindings belong in Wrangler and private values in Cloudflare secrets.
Build env files do not provision deployed Worker secrets.

Build the intended environment immediately before deploying its generated
configuration. Selecting an environment only at deploy time cannot retarget an
existing Vite build. PR previews use default Sepolia builds; mainnet Workers
have preview URLs disabled. See each app's README for provisioning requirements.

## Conventions

- [STYLEGUIDE.md](STYLEGUIDE.md) is the coding standard; [REVIEW.md](REVIEW.md)
  and [`.greptile/`](.greptile) define what review flags.
- [docs/PACKAGE_CONTRACT.md](docs/PACKAGE_CONTRACT.md): required package
  scripts and `pre*` hooks.
- Before touching transactions or the smart account:
  [`packages/transaction-manager/docs/TRANSACTION_FLOW.md`](packages/transaction-manager/docs/TRANSACTION_FLOW.md),
  [`packages/smart-account/DEBUGGING_INTENTS.md`](packages/smart-account/DEBUGGING_INTENTS.md).
- Dependencies are pinned deliberately; the comments in
  [`pnpm-workspace.yaml`](pnpm-workspace.yaml) explain each constraint.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

`apps/` and `workers/` are AGPL-3.0-only; other code is MIT. `docs/`, `e2e/`,
the ENS marks and all font files are excluded from both. See [LICENSE](LICENSE)
and [TRADEMARK.md](TRADEMARK.md).
