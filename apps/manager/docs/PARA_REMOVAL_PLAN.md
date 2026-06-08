# Manager Para Removal Plan

## Goal

Remove Para from `apps/manager` and return to a plain wagmi + RainbowKit wallet setup, using `apps/portal` as the reference shape.

This document is for implementation planning and QA handoff. It focuses on:

- where Para is currently coupled into manager
- what should be replaced vs removed
- what needs manual validation after the migration
- what test fallout is expected and can be deferred

## Reference Implementation

Use the portal app as the baseline for the provider stack and wallet UX:

- `apps/portal/src/routes/__root.tsx`
- `apps/portal/src/lib/wagmi.ts`

Portal mounts:

- `WagmiProvider`
- `QueryClientProvider`
- `RainbowKitProvider`

Manager already has part of the wagmi/RainbowKit plumbing in place:

- `apps/manager/src/lib/wagmi.ts`
- `apps/manager/src/utils/test-utils.tsx`
- `apps/manager/src/components/ConnectWallet.tsx`

So this is mostly a removal/simplification exercise, not a new wallet architecture build.

## Main Workstreams

### 1. Replace the provider model

Current manager root wallet setup lives in:

- `apps/manager/src/lib/RootProviders.tsx`
- `apps/manager/src/routes/__root.tsx`

Current state:

- `RootProviders` is wrapped in `ParaProvider`
- Para callbacks are responsible for disconnect cleanup, backend auth reset, local storage reset, and transaction cleanup
- `ParaConnectionCookieSync` mirrors Para wallet state into a cookie
- `ParaWagmiSyncWatcher` exists only because Para and wagmi can diverge

Target state:

- Remove `ParaProvider`
- Mount `WagmiProvider` and `RainbowKitProvider` in manager root, following the portal shape
- Keep existing query/i18n/posthog/smart-account providers
- Rehome wallet disconnect and wallet-change cleanup onto wagmi/RainbowKit-driven effects
- Delete Para-only sync/watcher components

Expected implementation tasks:

- update `apps/manager/src/lib/RootProviders.tsx`
- update `apps/manager/src/routes/__root.tsx`
- remove `apps/manager/src/lib/ParaConnectionCookieSync.tsx`
- remove `apps/manager/src/features/wallet/components/ParaWagmiSyncWatcher.ts`
- replace `apps/manager/src/lib/para.ts` with a wallet-agnostic connection helper, or delete it and move any needed cookie helpers elsewhere

### 2. Simplify smart-account initialization

Current Para-specific smart-account logic lives in:

- `apps/manager/src/lib/smart-account/SmartAccountContext.tsx`
- `apps/manager/src/lib/smart-account/smart-account.machine.ts`
- `apps/manager/src/lib/smart-account/actors/initialize-account.actor.ts`
- `apps/manager/src/lib/smart-account/rhinestone.ts`
- `apps/manager/src/lib/smart-account/types.ts`

Current state:

- the wallet source model distinguishes between `external-wallet` and `para-embedded`
- smart-account initialization can be driven by either wagmi `walletClient` or Para `paraClient`
- Rhinestone setup contains Para account creation and Para signature wrapping

Target state:

- manager should initialize smart accounts from wagmi wallet clients only
- remove the `para-embedded` branch from the state machine and context
- remove `ParaClient` types and actor input paths
- remove `createParaAccount` and `wrapParaAccount` handling from `rhinestone.ts`

Expected implementation tasks:

- `detectWalletSource` in `SmartAccountContext.tsx` should collapse to wagmi-only detection
- `useWalletConnectionSync` should emit a single wallet-connected flow
- `smart-account.machine.ts` should remove `paraClient` from context and events
- `initialize-account.actor.ts` should require `walletClient` only
- `rhinestone.ts` should resolve owner account from `walletClient` only
- comments referencing Para embedded flow should be rewritten to generic EOA/HCA language

This is the highest-risk code path because registration, renewal, migration, and profile writes all depend on smart-account readiness and signer derivation.

### 3. Replace Para UI hooks with RainbowKit / wagmi hooks

Para UI/API usage is spread across the manager app. The important distinction is whether the file:

- only needs "connect/disconnect/open wallet modal" behavior
- depends on Para-only account metadata
- branches on Para embedded vs external wallet behavior

#### Straight replacements

These should move to RainbowKit/wagmi equivalents with limited behavioral change:

- `apps/manager/src/features/navigation/Header/desktop/DisconnectedRightBlock.tsx`
- `apps/manager/src/features/navigation/Header/mobile/MobileConnectButton.tsx`
- `apps/manager/src/features/register-v2/workflow/pricing/components/PaymentCard.tsx`
- `apps/manager/src/features/register/components/Pricing/usePricing.ts`
- `apps/manager/src/features/notifications/RequireBackendAuth.tsx`

Likely replacements:

- `useModal().openModal()` -> `useConnectModal().openConnectModal()`
- Para wallet status checks -> wagmi `useAccount()` / `useWalletClient()`
- Para disconnect -> wagmi `useDisconnect()`

#### Header/account UI that needs redesign, not just rewiring

These currently use Para account metadata or Para-specific affordances:

- `apps/manager/src/features/navigation/Header/account/AccountTriggerContent.tsx`
- `apps/manager/src/features/navigation/Header/account/displayName.ts`
- `apps/manager/src/features/navigation/Header/account/WalletSection.tsx`
- `apps/manager/src/features/navigation/Header/Header.tsx`

Why they matter:

- current display-name logic prefers Para embedded auth identifiers such as email/phone/social identity
- current wallet section shows "Manage Para Wallet"
- current avatar/icon logic distinguishes external vs embedded Para connections

Target state:

- show ENS reverse name first if available
- otherwise show truncated owner/wallet address
- remove Para branding and "Manage Para Wallet"
- disconnect should use wagmi

This is a product/UX simplification, not a feature parity port.

### 4. Replace route guards and connection persistence

Current route gating relies on a Para-owned cookie:

- `apps/manager/src/routes/index.tsx`
- `apps/manager/src/routes/dashboard.tsx`
- `apps/manager/src/routes/migration.tsx`
- `apps/manager/src/routes/p/$name/edit.tsx`
- `apps/manager/src/features/wallet/hooks/useOnDisconnected.ts`

Current state:

- `getParaConnectionCookie()` and `isConnectedToPara()` are used for redirect decisions
- Para logout events are used for immediate navigation away from protected pages

Target state:

- rename or replace the cookie mechanism so it reflects wagmi/RainbowKit connection state instead of Para
- keep SSR-friendly redirect behavior if still needed
- replace Para logout event listeners with wagmi connection-state effects

Important note:

If manager still wants server-side route redirects before hydration, it needs some connection persistence strategy. That can be:

- a renamed generic wallet cookie synced from wagmi state
- wagmi persistence alone, if route behavior can tolerate client-side gating

This choice should be made intentionally. It affects landing-page redirects and protected-route flash behavior.

### 5. Clean up domain/profile/dashboard code that reads the wallet from Para

These files use `useWallet()` mainly to access an address:

- `apps/manager/src/features/dashboard/useOwnedDomains.ts`
- `apps/manager/src/features/dashboard/components/ChoosePrimaryNameDialog.tsx`
- `apps/manager/src/features/profile/components/view/ProfileView.tsx`
- `apps/manager/src/features/register/components/RegistrationInProgress/PaymentDrawer.tsx`
- `apps/manager/src/routes/p/$name/edit.tsx`

Most of these should switch to wagmi `useAccount()` or, where possible, read from `useSmartAccountContext()` instead of querying the wallet twice.

### 6. Remove dependencies, mocks, and Para-specific tests

Direct package cleanup:

- `apps/manager/package.json`

Para-specific tests/mocks that will need rewrite or removal:

- `apps/manager/src/lib/smart-account/SmartAccountContext.mocks.ts`
- `apps/manager/src/lib/smart-account/SmartAccountContext.test.tsx`
- `apps/manager/src/lib/smart-account/rhinestone.test.ts`

Docs that mention Para and will become stale:

- `apps/manager/docs/RHINESTONE_SMART_SESSIONS.md`
- `apps/manager/docs/RHINESTONE_FIXES_HANDOFF.md`
- `apps/manager/docs/RHINESTONE_TEAM_SUMMARY.md`

These docs do not block the migration, but they should be updated or clearly left as historical notes.

## File Inventory

### Core Para integration points

- `apps/manager/src/lib/RootProviders.tsx`
- `apps/manager/src/lib/para.ts`
- `apps/manager/src/lib/ParaConnectionCookieSync.tsx`
- `apps/manager/src/features/wallet/components/ParaWagmiSyncWatcher.ts`

### Smart-account files with Para branches

- `apps/manager/src/lib/smart-account/SmartAccountContext.tsx`
- `apps/manager/src/lib/smart-account/smart-account.machine.ts`
- `apps/manager/src/lib/smart-account/actors/initialize-account.actor.ts`
- `apps/manager/src/lib/smart-account/rhinestone.ts`
- `apps/manager/src/lib/smart-account/types.ts`

### Routes/guards tied to Para connection semantics

- `apps/manager/src/routes/index.tsx`
- `apps/manager/src/routes/dashboard.tsx`
- `apps/manager/src/routes/migration.tsx`
- `apps/manager/src/routes/p/$name/edit.tsx`
- `apps/manager/src/features/wallet/hooks/useOnDisconnected.ts`

### UI/components using Para hooks directly

- `apps/manager/src/features/navigation/Header/Header.tsx`
- `apps/manager/src/features/navigation/Header/desktop/DisconnectedRightBlock.tsx`
- `apps/manager/src/features/navigation/Header/mobile/MobileConnectButton.tsx`
- `apps/manager/src/features/navigation/Header/account/AccountTriggerContent.tsx`
- `apps/manager/src/features/navigation/Header/account/displayName.ts`
- `apps/manager/src/features/navigation/Header/account/WalletSection.tsx`
- `apps/manager/src/features/notifications/RequireBackendAuth.tsx`
- `apps/manager/src/features/wallet/components/BackendAuthModal.tsx`
- `apps/manager/src/features/register/components/Pricing/usePricing.ts`
- `apps/manager/src/features/register-v2/workflow/pricing/components/PaymentCard.tsx`
- `apps/manager/src/features/dashboard/useOwnedDomains.ts`
- `apps/manager/src/features/dashboard/components/ChoosePrimaryNameDialog.tsx`
- `apps/manager/src/features/profile/components/view/ProfileView.tsx`
- `apps/manager/src/features/register/components/RegistrationInProgress/PaymentDrawer.tsx`

## Suggested Migration Order

1. Replace the root provider stack with wagmi + RainbowKit and remove Para provider wiring.
2. Introduce a wallet-agnostic connection persistence strategy for redirects, or explicitly drop SSR redirect dependence.
3. Simplify smart-account initialization to wagmi-only.
4. Replace connect/disconnect/modal UI hooks across the app.
5. Remove Para-specific header/account presentation.
6. Rewrite or delete Para-specific tests and mocks.
7. Remove Para packages from `apps/manager/package.json`.

This order reduces the risk of leaving dead Para branches hidden behind UI changes.

## QA Test Plan

These are the flows that should be manually tested after the migration.

### P0: Wallet connection and routing

- Connect with a standard injected wallet from the landing page.
- Refresh after connecting and confirm the app restores the connected session correctly.
- Confirm dashboard route access works when connected.
- Confirm dashboard redirects away when disconnected.
- Confirm migration route gating still works.
- Confirm profile edit route gating still works.
- Disconnect from the header/account menu and confirm redirect/cleanup behavior.

### P0: Smart-account readiness and transaction flows

- Connect a wallet and confirm smart-account initialization completes.
- Confirm the account can still derive `ownerAddress` and `accountAddress`.
- Run a registration flow up to payment/confirmation.
- Run a renewal flow.
- Run a profile record edit flow.
- Run a primary-name update flow.
- Run migration flow entry and at least one migration submission path.

Reason:

These are the flows most exposed to the Para removal because they depend on signer setup, owner address selection, and route gating.

### P1: Backend auth / SIWE-related behavior

- Trigger the backend auth modal for an unverified connected wallet.
- Sign in with wallet and confirm notifications/favorites access still works.
- Disconnect and reconnect with a different wallet and verify auth state is cleared correctly.
- Confirm the "wrong wallet connected" state still behaves correctly.

Reason:

Today some of the cleanup logic is wired through Para callbacks in `RootProviders.tsx`. That behavior must survive the migration.

### P1: Dashboard and owned-domain queries

- Confirm owned names load on the dashboard after connecting.
- Confirm primary-name selection dialog lists names correctly.
- Confirm reverse-name/avatar header presentation still behaves sensibly.
- Confirm any wallet-dependent balances/funding UI still resolves.

### P2: Header and wallet UX

- Connect from desktop header.
- Connect from mobile header.
- Confirm account menu opens and disconnect works.
- Confirm there is no leftover Para branding, iconography, or "Manage Para Wallet" copy.

## Known Likely Breakages

These are expected and should not block the migration itself:

- e2e tests that automate Para modal flows
- tests/mocks that explicitly import `@getpara/*`
- any assertions expecting embedded-wallet-specific display names or UI copy

QA or follow-up engineering likely needs to update:

- wallet connection helpers in e2e
- mocks around smart-account initialization
- header/account UI snapshots

## Open Decisions

These are the only decisions that should be made before implementation starts:

### 1. SSR redirect behavior

Decide whether manager still wants cookie-backed route redirects before hydration, or whether client-side wagmi state is enough.

### 2. Wallet options

Decide whether manager should mirror portal wallet options exactly or keep its current wagmi connector set in `apps/manager/src/lib/wagmi.ts`.

Portal currently uses RainbowKit wallet grouping; manager currently defines wagmi connectors directly. If the goal is "basic RainbowKit setup like portal", portal should be treated as the source of truth.

### 3. Disconnect cleanup ownership

Decide where to centralize:

- transaction-manager reset
- backend auth sign-out
- posthog reset
- local storage cleanup

Para currently provides a single callback hub for this. After removal, that cleanup should move into a wallet-state effect with explicit triggers for disconnect and account switch.
