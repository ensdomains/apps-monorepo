# ENSv2 Migration Case Study

## ENSv1 Token Types

1. **Unwrapped** — `BaseRegistrar` ERC-721 (only 2LD)
2. **Unlocked** — `NameWrapper` ERC-1155 w/o `CANNOT_UNWRAP` (only 2LD)
3. **Emancipated** — `NameWrapper` w/ `PARENT_CANNOT_CONTROL`
    1. **Locked** — w/ `CANNOT_UNWRAP` (2LD+)
    2. **Detached** — w/o `CANNOT_UNWRAP` and parent is **Locked** (3LD+)

## Definitions

- Migration only supports descendants of `"eth"`
- E**mancipated** status is determined by `PARENT_CANNOT_CONTROL`
- **Locked** status is determined by `CANNOT_UNWRAP` — see: `_isLocked()`
    - `CANNOT_UNWRAP` cannot be set without `PARENT_CANNOT_CONTROL`
    - Every **Locked** token is E**mancipated**
- **Detached** status is E**mancipated** and not `IS_DOT_ETH` — see: `_isEmancipatedChild()`
- A child of a **Locked** token can only be migrated if the parent has migrated and the child is **Emancipated** (**Locked** or **Detached**) — see: `_isMigratableChild()`
- `CAN_DO_EVERYTHING` is `0` — the absence of all fuses. A token with `CAN_DO_EVERYTHING` is **Unlocked**
- `ETHRegistry` is the registry for `"eth"` in ENSv2
- `ETHRegistrar` is the registrar for `ETHRegistry`
- `Graveyard` is the burn address for `BaseRegistrar` tokens. It is a single well-known contract that receives and holds burned tokens until expiry, at which point it can clear owned and expired namespaces via its cleanup mechanism
- `ENSV1Resolver` is the ENSv2 resolver used for unmigrated names — it performs wildcard fallback to ENSv1, providing resolution continuity until names are migrated or expire
- `ENSV2Resolver` is the default resolver assigned to migrated names — it is a native ENSv2 resolver that does not fall back to ENSv1

## Migration Receivers

1. `UnlockedMigrationController`
    1. `IERC721Receiver` → **Unwrapped** 2LD only from `BaseRegistrar`
    2. `AbstractWrapperReceiver` → **Unlocked** 2LD
2. `LockedMigrationController`
    1. `LockedWrapperReceiver` → **Locked** 2LD
3. `WrapperRegistry`
    1. `LockedWrapperReceiver` → **Locked** or **Detached** 3LD+

---

- `AbstractWrapperReceiver` is `IERC1155Receiver` and only accepts `NameWrapper` tokens
- `LockedWrapperReceiver` is `AbstractWrapperReceiver` and only accepts **Emancipated** tokens
- `approve()` on `NameWrapper` does **not** authorize transfer — this is non-standard ERC-1155 behavior. Only `setApprovalForAll()` grants transfer permission. This is why `CANNOT_APPROVE` combined with an active `getApproved()` creates a frozen state: the approval cannot be revoked (fuse prevents it) and does not grant transfer rights, but the contract still reverts with `FrozenTokenApproval` if a non-null approval exists during migration

## Migration Assumptions

- Premigration has occurred
    - Expiries "too close" (TBD) to ENSv2 launch will be extended in ENSv1
    - Every ENSv1 name is `RESERVED` on `ETHRegistry` with synced ENSv1 expiry and resolver set to `ENSV1Resolver` which performs wildcard fallback to ENSv1
    - ENSv1 .eth registration is disabled
        - Therefore, there is only one token per 2LD, and owner holds it until expiry
- Migration controllers are granted `ROLE_REGISTER_RESERVED` on `ETHRegistry`
- `ETHRegistrar` lacks `ROLE_REGISTER_RESERVED` therefore `RESERVED` names (unmigrated) cannot be registered until they expire
- After migration, the migration controllers hold transferable tokens but have no upgrade or transfer mechanism
    - ENSv1 registry namespace beneath the 2LD is unchanged

## General Restrictions

- Migration is impossible if a token cannot be transferred
- `BaseRegistrar` tokens can only be transferred by owner or approved operators
    - underlying `ERC721` implementation allows typed error propagation from `onERC721Received()`
- `NameWrapper` tokens can only be transferred by owner or approved operators
    - `approve()` does not authorize transfer
    - underlying `ERC1155Fuse` implementation allows `Error(string)` reverts during `onERC1155Received()` but converts typed errors to `Error("ERC1155: transfer to non ERC1155Receiver implementer")`
    - `AbstractWrapperReceiver` and `WrappedErrorLib` implement logic to catch, wrap, and unwrap typed errors
    - `safeBatchTransferFrom()` reverts on the first error encountered
- Migration fails if the ENSv2 token receiver is null or not an accepting receiver

## Records Are Not Migrated

Migration transfers name ownership only — ENS records (text records, addresses, contenthash, etc.) are **not** copied to ENSv2.

Resolution continuity is maintained through `ENSV1Resolver`, which performs wildcard fallback to ENSv1. This means:

- Unmigrated names continue to resolve via `ENSV1Resolver` until they expire in ENSv2
- Migrated names are assigned `ENSV2Resolver` by default, which does **not** fall back to ENSv1
- After migration, users must manually set their records on ENSv2 if they want them to resolve
- For **Locked** names with `CANNOT_SET_RESOLVER` burned, the V1 resolver is preserved during migration (since it cannot be changed), maintaining existing record resolution until the user sets records on V2 through other means

## Parent-Child Migration Ordering

Children of a **Locked** parent can only migrate after the parent has migrated. This is a hard requirement enforced on-chain:

1. When a **Locked** 2LD migrates, a new `WrapperRegistry` is deployed as its subregistry
2. Children must be transferred to this `WrapperRegistry` — its address is resolved via `ETHRegistry.getSubregistry(label)`
3. If the parent has not migrated, `getSubregistry()` returns `zeroAddress` and the child migration reverts
4. For deeply nested names (e.g., `deep.sub.nick.eth`), each intermediate parent must have migrated — the registry walk is `ETHRegistry` → nick's `WrapperRegistry` → sub's `WrapperRegistry`
5. Implementations should resolve parent registries **after** confirming 2LD migration receipts, and should account for potential RPC/indexing delays between parent migration confirmation and child registry resolution

# Migration Cases

## Unwrapped

1. Token is transferred to `UnlockedMigrationController`, the only valid receiver:
    - Every other receiver lacks `IERC721Receiver`
2. `safeTransferFrom()` payload `data` must be `abi.encode(LibMigration.Data)` or reverts `InvalidData`
3. `tokenId` must match `keccak256(bytes(Data.label))` or reverts `NameDataMismatch`
4. Token is reclaimed on the `BaseRegistrar`
5. Resolver is cleared
6. Token is transferred to `Graveyard`
7. `Data.label` is registered in `ETHRegistry`
    1. Since premigration has occurred and `UnlockedMigrationController` only has `ROLE_RESERVE_REGISTER`, `Data.label` is `RESERVED` and has the correct `expiry`
    2. `Data.owner`, `Data.resolver` and `Data.subregistry` are used accordingly
    3. The token roles are the same as `ETHRegistrar.register()`

## Unlocked

1. Token is transferred to `UnlockedMigrationController`, the only valid receiver:
    1. `LockedMigrationController` reverts `NameNotLocked`
    2. Every `WrapperRegistry` reverts `NameDataMismatch` (wrong parent)
2. `safeTransferFrom()` payload `data` must be `abi.encode(LibMigration.Data)` or `safeBatchTransferFrom()` payload `data` must be `abi.encode(LibMigration.Data[])` or reverts `InvalidData`
3. Token must be **Unlocked** or reverts `NameIsLocked`
4. `tokenId` must match `namehash("{Data.label}.eth")` or reverts `NameDataMismatch`
    - **Unlocked 3LD+** cannot be migrated and must be registered directly (see [Unlocked 3LD+](#unlocked-3ld))
5. Token is unwrapped to `Graveyard`
    - `Graveyard` is the token owner until expiry
    - `NameWrapper` is the `ENSRegistry` owner
6. Resolver is cleared
    - Note: `CANNOT_SET_RESOLVER` cannot be burned while **Unlocked**
7. `Data.label` is registered in `ETHRegistry`
    1. Since premigration has occurred and `UnlockedMigrationController` only has `ROLE_RESERVE_REGISTER`, `Data.label` is `RESERVED` and has the correct `expiry`
    2. `Data.owner`, `Data.resolver` and `Data.subregistry` are used accordingly
    3. The token roles are the same as `ETHRegistrar.register()`

## Emancipated

1. Token is transferred to the unique receiver dependent on its name:
    - For 2LD, `LockedMigrationController` is the only valid receiver:
        - `UnlockedMigrationController` reverts `NameIsLocked`
        - Every `WrapperRegistry` reverts `NameDataMismatch` (wrong parent)
    - For 3LD+, the `WrapperRegistry` where `getWrappedName()` corresponds to the parent is the only valid receiver:
        - `UnlockedMigrationController` reverts `NameIsLocked`
        - `LockedMigrationController` reverts `NameDataMismatch` (wrong parent)
        - Every other `WrapperRegistry` reverts `NameDataMismatch` (wrong parent)
    - If there is no `WrapperRegistry`, the parent hasn't migrated yet
        - Token must be extended in ENSv1 to stay active
        - The name cannot be registered in ENSv2 until it migrates or expires
        - The ENSv2 resolver returns `ENSV1Resolver` during this period
2. `safeTransferFrom()` payload `data` must be `abi.encode(LibMigration.Data)` or `safeBatchTransferFrom()` payload `data` must be `abi.encode(LibMigration.Data[])` or reverts `InvalidData`
3. `tokenId` must match `namehash("{Data.label}.{getWrappedName()}")` or reverts `NameDataMismatch`
    - Note: `LockedMigrationController.getWrappedName() = "eth"`
4. The token must be: **Locked** or **Detached** or reverts `NameNotLocked`

## Emancipated → Locked

1. `getApproved()` must be null or reverts `FrozenTokenApproval`
    - If `CANNOT_APPROVE = false`, approval is automatically cleared during transfer
2. Token is not unwrapped
    - `LockedMigrationController` is the token owner until expiry
    - `NameWrapper` is the `ENSRegistry` owner
3. Resolver is cleared unless `CANNOT_SET_RESOLVER` is burned and `Data.resolver` is replaced with the current ENSv1 resolver
4. `Data.label` is registered in the parent registry:
    1. The parent registry is derived from the receiver:
        1. For 2LD, `LockedMigrationController._getRegistry() = ETHRegistry`
            - Since premigration has occurred and `LockedMigrationController` only has `ROLE_RESERVE_REGISTER`, `Data.label` is `RESERVED` and has the correct `expiry`
        2. For 3LD+, every `WrapperRegistry._getRegistry()` is itself
            - The `expiry` is copied from the **Locked** token
            - `WrapperRegistry._inject()` registers the name without needing `ROLE_REGISTER`
    2. `Data.owner` and `Data.resolver` are used accordingly
    3. The `subregistry` is set to a newly deployed `WrapperRegistry`
        - `Data.owner` is granted the following `ROOT_RESOURCE` roles:
            1. `CANNOT_CREATE_SUBDOMAIN = false` → `ROLE_REGISTRAR`
            2. `CANNOT_BURN_FUSES = false` → admin roles for any granted roles so far
            3. `ROLE_RENEW` and `ROLE_RENEW_ADMIN`
        - `WrapperRegistry` is canonical and cannot be changed
    4. The token is granted the following roles:
        1. `CAN_EXTEND_EXPIRY = true` → `ROLE_RENEW`
        2. `CANNOT_SET_RESOLVER = false` → `ROLE_SET_RESOLVER`
        3. `CANNOT_BURN_FUSES = false` → admin roles for any granted roles so far
        4. `CANNOT_TRANSFER = false` → `ROLE_CAN_TRANSFER_ADMIN`

## Emancipated → Detached

1. Token is unwrapped to `Graveyard`
2. Resolver is cleared
3. `Data.label` is registered in the parent registry:
    1. `Data.owner`, `Data.resolver` and `Data.subregistry` are used accordingly
    2. The token roles are the same as `ETHRegistrar.register()`

## Locked vs. Detached: Observable Differences

When a 3LD+ name migrates, the on-chain path depends on whether it is **Locked** or **Detached**:

| | **Locked** (has `CANNOT_UNWRAP`) | **Detached** (no `CANNOT_UNWRAP`, parent is **Locked**) |
|---|---|---|
| V1 token | Preserved — migration controller holds it until expiry | Unwrapped to `Graveyard` |
| Subregistry | New `WrapperRegistry` deployed | `Data.subregistry` used as-is |
| Roles granted | Based on fuse state (see [Emancipated → Locked](#emancipated--locked)) | Same as `ETHRegistrar.register()` (full default roles) |
| `CANNOT_SET_RESOLVER` | If burned: V1 resolver preserved | Always cleared |
| `CANNOT_BURN_FUSES` | If burned: no admin-equivalent roles granted | N/A — full admin roles granted |
| `CANNOT_CREATE_SUBDOMAIN` | If burned: no `ROLE_REGISTRAR` on subregistry | N/A — `ROLE_REGISTRAR` granted |

## Unlocked 3LD+

**Unlocked** subnames (wrapped 3LD+ without `CANNOT_UNWRAP`) **cannot** be migrated via the transfer-based migration flow. The migration controllers reject them:

- `UnlockedMigrationController` only accepts 2LD names (reverts `NameDataMismatch` for non-.eth parents)
- `LockedMigrationController` and `WrapperRegistry` require **Emancipated** status (reverts `NameNotLocked`)

These names must be registered directly on ENSv2 after their parent has migrated. The parent's `WrapperRegistry` owner (who has `ROLE_REGISTRAR`) can register them as new ENSv2 names. Existing V1 records will continue to resolve via `ENSV1Resolver` until the V2 registration replaces them or the name expires.

## Unmigratable

1. **Unwrapped** or **Unlocked** and not transferable due to owner
2. **Unlocked 3LD+** — must be registered directly on ENSv2 (see [Unlocked 3LD+](#unlocked-3ld))
3. **Locked** and not transferable due to owner or `CANNOT_TRANSFER = true`
4. **Locked** with `CANNOT_APPROVE = true` and non-null `getApproved()`
5. **Emancipated 3LD+** with parent that has not migrated yet
6. Names that exist only as `ENSRegistry` records without any token (neither `BaseRegistrar` ERC-721 nor `NameWrapper` ERC-1155) — these are legacy registry-only names with no migration path

## Unmigrated

- ENSv1 tokens eventually expire leaving registry state frozen
    - `resolver` and `owner` are frozen
    - If wrapped, `NameWrapper`-aware resolvers (eg. `PublicResolver`) are frozen
- `ETHRegistrar` can renew unmigrated names at cost
- `ENSV1Resolver` will resolve until expired in ENSv2
- `Graveyard` can clear owned and expired namespaces

## Batch Transfer Behavior

- `BaseRegistrar` (ERC-721) does not support native batch transfers. Multiple unwrapped names are batched via `Multicall3.aggregate3` — this is **all-or-nothing**: if any single transfer reverts, the entire multicall reverts. Implementations should consider individual fallback for unwrapped names
- `NameWrapper` (ERC-1155) supports `safeBatchTransferFrom` — this also reverts on the first error encountered. Implementations should fall back to individual `safeTransferFrom` calls when a batch fails, tracking individual failures as skipped names rather than aborting the entire migration
- All names in a `safeBatchTransferFrom` call must share the same `from` address (token holder) and the same `to` address (migration receiver)

## Revert Error Catalog

Migration contracts use typed errors to communicate specific failure reasons:

| Error | When it fires |
|---|---|
| `InvalidData` | `safeTransferFrom` / `safeBatchTransferFrom` payload `data` is not valid `abi.encode(LibMigration.Data)` or `abi.encode(LibMigration.Data[])` |
| `NameDataMismatch` | `tokenId` does not match the hash derived from `Data.label` and the receiver's expected parent |
| `NameIsLocked` | Token sent to `UnlockedMigrationController` has `CANNOT_UNWRAP` set (should go to `LockedMigrationController` or `WrapperRegistry` instead) |
| `NameNotLocked` | Token sent to `LockedMigrationController` or `WrapperRegistry` is not **Emancipated** (missing `PARENT_CANNOT_CONTROL`) |
| `FrozenTokenApproval` | **Locked** token has `CANNOT_APPROVE` burned and `getApproved()` returns a non-null address — the approval cannot be revoked and blocks migration |

Note: `NameWrapper`'s `ERC1155Fuse` implementation converts typed errors from `onERC1155Received()` to generic `Error("ERC1155: transfer to non ERC1155Receiver implementer")`. `AbstractWrapperReceiver` and `WrappedErrorLib` implement wrapping/unwrapping logic to preserve typed errors through this limitation.

## NameWrapper Fuse Implications

Reference: [INameWrapper.sol](https://github.com/ensdomains/ens-contracts/blob/staging/contracts/wrapper/INameWrapper.sol#L10-L21)

- `CANNOT_UNWRAP` → **Locked**
- `CANNOT_BURN_FUSES` → not granted admin-equivalent roles
- `CANNOT_TRANSFER` → not granted `ROLE_CAN_TRANSFER_ADMIN` on token
- `CANNOT_SET_RESOLVER` → not granted `ROLE_SET_RESOLVER` on token; V1 resolver is preserved during migration
- `CANNOT_SET_TTL` → ignored
- `CANNOT_CREATE_SUBDOMAIN` → not granted `ROLE_REGISTRAR` on subregistry
- `CANNOT_APPROVE` → reverts if `getApproved()` is not null
- `PARENT_CANNOT_CONTROL` → see [definitions](#definitions)
- `IS_DOT_ETH` → see [definitions](#definitions)
- `CAN_EXTEND_EXPIRY` → `ROLE_RENEW` on token
- `CAN_DO_EVERYTHING` → `0` (absence of all fuses) — token is **Unlocked**

## Resolver Handling

| Scenario | Resolver set on ENSv2 |
|---|---|
| Premigration (unmigrated name) | `ENSV1Resolver` — wildcard fallback to ENSv1 |
| Migration of **Unwrapped** or **Unlocked** name | `ENSV2Resolver` (default) |
| Migration of **Locked** name without `CANNOT_SET_RESOLVER` | `ENSV2Resolver` (default) |
| Migration of **Locked** name with `CANNOT_SET_RESOLVER` | Existing V1 resolver address is preserved |
| Migration of **Detached** name | `ENSV2Resolver` (default) |
| Unmigrated name after expiry | Resolution stops |

## Implementation Considerations

- **Pagination**: The ENSv1 subgraph returns a maximum of 1000 results per query. Implementations should use cursor-based pagination or multiple queries to handle accounts with more than 1000 names
- **Transaction timeouts**: `waitForTransactionReceipt` should include a timeout to avoid hanging indefinitely on stuck transactions
- **Chain validation**: Contract addresses should be validated against the connected chain ID to prevent transactions against wrong-network contracts
- **Error decoding**: Implementations should decode typed revert errors (see [Revert Error Catalog](#revert-error-catalog)) to provide actionable feedback rather than generic "transfer failed" messages
