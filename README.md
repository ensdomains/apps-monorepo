# ENS Apps

The web applications ENS Labs builds for the ENS protocol, and the shared code
behind them.

| Deployable | What it is | Deployed at |
| --- | --- | --- |
| [`apps/manager`](apps/manager) | The ENS app for ENSv2: register, renew, migrate from ENSv1, manage names and profiles. TanStack Start on Cloudflare Workers. | https://app.ens.dev |
| [`apps/portal`](apps/portal) | The ENS Explorer for ENSv1 and ENSv2 names, addresses, resolvers and registries. Vite SPA behind a Cloudflare Worker. | https://explorer.ens.dev |
| [`workers/api-worker`](workers/api-worker) | Backend for the manager: auth, favorites, notifications, migration faucet. Hono on Cloudflare Workers with Postgres and Queues. | https://app-api.ens.dev |

Shared code lives in `packages/`, end-to-end tests in `e2e/`. The official app
origins are listed in [TRADEMARK.md](TRADEMARK.md). ENSv2 is deployed on
Sepolia only; each build targets one network via `VITE_ENS_NETWORK`.

## Setup

```bash
pnpm install

# Manager, http://localhost:3000
cp apps/manager/.env.example apps/manager/.env
pnpm --filter manager dev

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

The brand typefaces are not in the repository; official deployments load them
from `fonts.ens.dev` and everything else falls back to the generic family. See
[`apps/portal/src/assets/fonts/README.md`](apps/portal/src/assets/fonts/README.md).

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
