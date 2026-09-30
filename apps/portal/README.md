# Explorer

The ENS Explorer: browse and manage any ENS name, on ENSv1 or ENSv2, along
with the addresses, resolvers, registries and TLDs around it. Deployed by ENS
Labs at https://explorer.ens.dev. The workspace package is still called
`portal`, so filters and root scripts use that name.

Part of the [ENS apps monorepo](../../README.md); the root README covers
prerequisites, repository-wide commands and conventions.

## What it does

- Name pages: records, ownership and transfers, resolver, registry, roles,
  subnames, token, fuses (Name Wrapper), history, and the edit flows for each.
- Address pages: names held, forward and reverse resolution, history.
- Resolver, registry and TLD pages, with links, nodes and labels.
- Registration and renewal, ENSv1 to ENSv2 migration prompts, and DNS name
  import.
- A Cloudflare Worker in front of the SPA that rewrites the page title, injects
  per-route meta tags, renders Open Graph cards (name, address, resolver,
  registry, TLD), proxies avatars with size caps, and sets the CSP.

## Stack

- React 19 with file-based TanStack Router, built by Vite as a single-page app
- wagmi and viem with a custom wallet modal (EIP-6963 discovery plus
  WalletConnect)
- TanStack Query, XState, neverthrow
- Tailwind CSS 4 with shadcn/Radix components in `src/components/ui`
- i18next, with catalogs from [`@ensdomains/locales`](../../packages/locales)
- Vitest and Testing Library

## Running locally

```bash
cp .env.example .env
pnpm dev                 # http://localhost:3001
```

From the repository root the same is `pnpm --filter portal dev`. In
development the Worker is not run, so meta tags and OG images are served by
`pnpm build && pnpm serve` or by a preview deploy.

`VITE_ENS_NETWORK` is required and the build fails without it. The rest of
[`.env.example`](.env.example) is optional: PostHog, the manager app URL used by
the "Upgrade to v2" banner, and the mock wallet and time-travel switches for
automated testing, which must never reach a production deploy.

## Notes

- `pnpm cf-typegen` regenerates the Worker bindings after a `wrangler.jsonc` change.
- Deploys go through wrangler. The `deploy-portal` workflow that publishes a
  release to IPFS exists but has never run.

## Further reading

- [`src/assets/fonts/README.md`](src/assets/fonts/README.md): why the brand
  typefaces are not in the repository.
- [`packages/og`](../../packages/og): the OG card primitives shared with the
  manager.
- [`e2e/README.md`](../../e2e/README.md) for the Playwright suites.
