# Manager

The ENS app for ENSv2: search and register names, renew, migrate names from
ENSv1, edit profiles and records, manage the names an address holds, and
subscribe to expiry and transfer notifications. Deployed by ENS Labs at
https://app.ens.dev.

Part of the [ENS apps monorepo](../../README.md); the root README covers
prerequisites, repository-wide commands and conventions.

## Stack

- TanStack Start (React 19, file-based TanStack Router, server rendering on
  Cloudflare Workers through the Cloudflare Vite plugin)
- wagmi and viem, with a custom wallet modal (EIP-6963 discovery plus
  WalletConnect) from [`src/lib/wallet`](src/lib/wallet)
- Rhinestone smart accounts for gas-sponsored registration and migration,
  through [`@ens-apps/smart-account`](../../packages/smart-account) and
  [`@ens-apps/transaction-manager`](../../packages/transaction-manager)
- TanStack Query for server state, XState for multi-step flows, neverthrow for
  errors
- Tailwind CSS 4 with shadcn/Radix components in `src/components/ui`
- Lingui for translations, managed in Crowdin
- Vitest, Testing Library and Storybook

## Running locally

```bash
cp .env.example .env
pnpm dev                 # http://localhost:3000
```

From the repository root the same is `pnpm dev:manager`. The example env
targets Sepolia and the hosted backend at `app-api.ens.dev`; to run the backend
too, see [`workers/api-worker`](../../workers/api-worker).

`VITE_ENS_NETWORK` is required and the build fails without it. Every other
variable is documented inline in [`.env.example`](.env.example). Three of them
are debug-only and must never reach a production deploy:

- `VITE_FF_USE_EOA` skips the smart account and signs every transaction with
  the connected wallet.
- `VITE_USE_MOCK_WALLET` auto-connects wagmi's mock connector for automated
  browsers.
- `VITE_ENABLE_DEBUG_FEATURES` exposes the `/debug/*` routes and the backend
  override. It is on automatically in `vite dev`.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `pnpm dev`, or `pnpm dev:inspect` with the XState inspector |
| Typecheck | `pnpm typecheck` (builds the api-worker's exported types first) |
| Tests | `pnpm test`, `pnpm test:coverage` |
| Lint | `pnpm lint`, `pnpm lint:fix` |
| Production build | `pnpm build`, then `pnpm preview` to serve it with wrangler |
| Storybook | `pnpm storybook:dev` |
| Translations | `pnpm i18n:extract`, `pnpm i18n:compile`; push and pull via Crowdin with `i18n:push` / `i18n:pull` |
| Worker types | `pnpm cf-typegen` after changing `wrangler.jsonc` |
| Rhinestone debug page | `pnpm debug:rhinestone-browser`, see [`rhinestone-browser-debug/`](rhinestone-browser-debug/README.md) |

## Layout

```
src/
  routes/            File-based routes: /, /$name, /$address, /register/$name,
                     /renew/$name, /renew-v1/$name, /migration, /dashboard,
                     /notifications, /p/$name, /og/$name, /legal/*, /debug/*
  features/          One folder per product area (register-v2, renew, bulk-renew,
                     migration, profile, dashboard, notifications, search, wallet,
                     grace, weave-registration, og, ...)
  components/        Shared UI, with shadcn primitives under components/ui
  lib/               Providers, wagmi and wallet setup, smart-account wiring,
                     PostHog, locale config
  server/            Server-only code (CSP headers)
  locales/           Lingui catalogs (extracted by the pre-commit hook)
  hooks/ utils/      Shared hooks and helpers
docs/                Feature flags, i18n, and the HCA migration release notes
.storybook/          Storybook config
scripts/             Pre-build network config check
```

## Further reading

- [`docs/FEATURE_FLAGS.md`](docs/FEATURE_FLAGS.md): env-var and per-user flags.
- [`docs/I18N.md`](docs/I18N.md): the Lingui and Crowdin workflow.
- [`docs/HCA_MIGRATION_RELEASE_NOTES.md`](docs/HCA_MIGRATION_RELEASE_NOTES.md):
  how migration batches run through the smart account.
- [`packages/transaction-manager/docs/TRANSACTION_FLOW.md`](../../packages/transaction-manager/docs/TRANSACTION_FLOW.md)
  and [`packages/smart-account/DEBUGGING_INTENTS.md`](../../packages/smart-account/DEBUGGING_INTENTS.md)
  before changing anything in the registration or migration batches.
- [`e2e/README.md`](../../e2e/README.md) for the Playwright suites that
  register and migrate names against a local stack.
