# Manager

The ENS app for ENSv2: search and register names, renew, migrate names from
ENSv1, edit profiles and records, manage the names an address holds, and
subscribe to expiry and transfer notifications. Deployed by ENS Labs at
https://sepolia.app.ens.domains.

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
cp .env.example .env.local # optional overrides
pnpm dev                 # http://localhost:3000
```

The committed defaults target Sepolia and the hosted backend at
`sepolia.app-api.ens.domains`; to run the backend too, see [`workers/api-worker`](../../workers/api-worker).

`VITE_ENS_NETWORK` is required and the build fails without it. Every other
variable is documented inline in [`.env.example`](.env.example). Three of them
are debug-only and must never reach a production deploy:

- `VITE_FF_USE_EOA` skips the smart account and signs every transaction with
  the connected wallet.
- `VITE_USE_MOCK_WALLET` auto-connects wagmi's mock connector for automated
  browsers.
- `VITE_ENABLE_DEBUG_FEATURES` exposes the `/debug/*` routes and the backend
  override. It is on automatically in `vite dev`.

## Environments

`pnpm dev` / `pnpm build` use Sepolia; `pnpm dev:mainnet` / `pnpm build:mainnet`
select mainnet. See [app environment configuration](../../README.md#app-environments)
for env-file layering, local overrides and deployment behavior.

On Sepolia every flow pays in Circle's testnet USDC
([faucet.circle.com](https://faucet.circle.com)); the auto-fund faucet only runs
against the local Anvil fork.

`VITE_AVATAR_UPLOAD_URL` selects the avatar/header upload service independently
of `VITE_ENS_NETWORK`. The committed `.env` and `.env.ci` use
`https://avatar-upload-staging.ens-cf.workers.dev`. The `.env.mainnet` file
defaults to `https://euc.li`, matching the legacy ENS app; the production
release already selects this file through `build:mainnet`.

Override the variable in `.env.mainnet.local` for mainnet builds, or
`.env.local` for default Sepolia builds. A build-environment variable can
override either mode to select either upload service. Changing a deployed
Worker variable does not change a URL already compiled into the browser bundle.

Avatars use `<upload-base>/<name>` and headers append `/h`. Sepolia adds a
`/sepolia` prefix to either path, regardless of the chosen upload service.

Mainnet requires a Bigname endpoint in the network profile or
`VITE_BIGNAME_API_URL`; validation fails until one is supplied. The mainnet
Telegram bot ID is intentionally empty until provisioned. Configure the new
Worker's domain routing and Rhinestone credentials separately:
`RHINESTONE_JWT_PRIVATE_KEY`, `RHINESTONE_INTEGRATOR_ID`,
`RHINESTONE_PROJECT_ID`, `RHINESTONE_APP_ID`, `RHINESTONE_KEY_ID`.
The mainnet token rate limiter uses a separate namespace.

## Notes

- Name upgrades require a browser with Web Locks available. If another app tab is
  upgrading names for the same wallet, network and smart account, return to that
  tab to finish. If the browser cannot safely run the upgrade, open the page in
  an up-to-date browser and try again.
- `pnpm typecheck` builds the api-worker's exported types first.
- `pnpm dev:inspect` runs the dev server with the XState inspector.
- `pnpm cf-typegen` regenerates the Worker bindings after a `wrangler.jsonc` change.
- [`rhinestone-browser-debug/`](rhinestone-browser-debug/README.md) is a
  standalone page for isolating the smart-account flow with a browser wallet.

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
