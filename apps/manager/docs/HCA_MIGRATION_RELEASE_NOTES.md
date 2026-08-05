# Atomic HCA migration on Sepolia

## Release note

Following HCA registration support in #989, ENS v2 migration now uses the
remediated standalone HCA deployment on Sepolia. Each gas-safe batch migrates
names, restores legacy manager access, and replays records atomically while the
connected wallet remains the owner. Fresh HCA setup and temporary permissions
are handled in-flow, with execution paid in Sepolia ETH.

## Operator notes

- The deployment is pinned to `ensdomains/contracts-v2` PR #388 head
  `8d1c89350729f87b3968cf41ef3d683951444a44` through the shared typed manifest
  in `packages/smart-account`.
- Migration uses a wallet-paid EOA transaction to
  `StandaloneHCA.executeByOwner(...)`; it does not use Warp or a registration
  session.
- A name is reported complete only after its v2 owner, resolver, manager roles,
  resolver roles, and replayed records have been verified on-chain.
- Custom resolvers are always preserved. Locked names whose allowlisted public
  resolver would rotate to PublicResolverV2 are accepted only when the
  supported text/address inventory is empty; names with records remain blocked
  until those records can be replayed atomically.
- Only approvals that were absent at preflight and submitted by this flow are
  recorded for cleanup; pre-existing approvals are never revoked. The ledger is
  persisted before wallet submission, cleanup re-checks live approval state,
  and a failed cleanup is separately retryable without rolling back a verified
  migration.
- The rollout remains behind the existing migration feature flag.

## Release gate

Do not release this deployment target until the contracts-v2 remediation and
address set are confirmed final by the contracts team, or the relevant
contracts PRs have merged. The pinned live `PublicResolverSet` must also include
every legacy public resolver classified as replaceable; preflight intentionally
blocks affected locked names when that membership is missing.
