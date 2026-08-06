# Direct HCA migration on Sepolia

## Release note

Following HCA registration support in #989, ENS v2 migration now uses the
remediated standalone HCA deployment on Sepolia. The connected wallet remains
the name owner while each gas-safe HCA batch atomically transfers names to the
correct v2 receiver, restores legacy manager access, and replays records. Fresh
HCA setup and required permissions are handled in-flow, with execution paid in
Sepolia ETH.

## Wallet confirmations

The preview displays an expected confirmation count and estimated network fee
for the selected names. Permission state is rechecked before the first wallet
prompt; if it changed, the flow asks the owner to review a refreshed preview
instead of silently adding or removing confirmations. Gas-safe batches are
re-estimated against live state during execution, so a large selection can use
fewer or more batches than the initial conservative estimate. On the successful
path, the common cases are:

| Selection | Existing HCA | Fresh HCA |
| --- | ---: | ---: |
| One unwrapped name | 2 | 3 |
| Wrapped names or multiple same-type names | 2 | 3 |
| Required permissions already exist | 1 | 2 |

The count includes the migration batch, required permission grants, and HCA
deployment when needed. An unwrapped selection of one or two names uses
per-token ERC-721 approvals, which clear automatically when the transfer
succeeds. Operator approvals remain available to the wallet-owned HCA for later
use, so migration does not add a separate revoke transaction. A missing
ETHRegistry approval for manager restoration adds one confirmation. Every
additional gas-safe atomic batch adds one confirmation.

## Operator notes

- The deployment is pinned to `ensdomains/contracts-v2` PR #388 head
  `8d1c89350729f87b3968cf41ef3d683951444a44` through the shared typed manifest
  in `packages/smart-account`.
- Migration uses a wallet-paid EOA transaction to
  `StandaloneHCA.executeByOwner(...)`; it does not use `wallet_sendCalls`, Warp,
  a registration session, or `MigrationHelper` as a fallback.
- Unwrapped registrations transfer directly to `UnlockedMigrationController`.
  Wrapped names transfer to `UnlockedMigrationController`,
  `LockedMigrationController`, or the verified parent `WrapperRegistry`
  according to their lock and hierarchy state. Compatible wrapped transfers
  sharing a receiver are coalesced into one batch call.
- Expected wrapper registries are derived recursively from VerifiableFactory.
  Locked hierarchies execute parent-first and fail closed when a required parent
  is missing, conflicting, uncertified, or cyclic.
- A name is reported complete only after its v2 owner, resolver, manager roles,
  resolver roles, and replayed records have been verified on-chain.
- Every atomic batch gets a durable intent marker before its wallet prompt, and
  its transaction hash replaces that marker before receipt polling. A
  confirmed-success batch that fails post-state verification is blocked from
  resubmission; a reverted batch is rebuilt only after source-token ownership
  is rechecked. Ambiguous pre-hash provider failures remain blocked for manual
  reconciliation, while speed-ups and replacements follow the hash in the
  mined receipt.
- Custom resolvers are preserved. Locked names whose replaceable resolver is
  absent from the live `PublicResolverSet` remain blocked.
- Operator approvals are intentionally persistent and can be reused by the
  wallet-owned HCA. Migration never asks the wallet for a follow-up revoke
  transaction. Per-token approvals clear automatically when their transfers
  succeed.
- The rollout remains behind the existing migration feature flag.

## QA acceptance scenarios

QA should cover fresh and existing HCAs; unwrapped, unlocked wrapped, locked
2LD, and locked/detached descendant names; parent-first locked hierarchies;
legacy managers and records; multiple gas batches and retry reconciliation;
transaction speed-up/replacement; complete atomic rollback; automatic
token-approval clearing; and persistent operator-approval reuse. No migration
E2E implementation is included in this change.

## Release gate

Keep PR #1017 in draft and the feature flag disabled until contracts-v2 PRs
#386 and #388 merge or Pavel confirms both the deployment and the
direct-transfer route; the live `PublicResolverSet` contains every replaceable
resolver; branch conflicts are resolved and CI is green; and QA signs off on
the preview. If any contract or QA gate misses the release window, do not ship
the helper route as a temporary fallback.
