// Pure helpers and domain logic for MigrationTestPanel — no React, fully testable.

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  registrySetApprovalForAllSnippet,
  registrySetResolverSnippet,
  registrySetSubnodeOwnerSnippet,
} from '@ensdomains/ensjs-abi/registry'
import { reverseRegistrarSetNameSnippet } from '@ensdomains/ensjs-abi/reverseRegistrar'
import {
  baseRegistrarAddControllerSnippet,
  baseRegistrarControllersSnippet,
  baseRegistrarOwnerSnippet,
  baseRegistrarReclaimSnippet,
  baseRegistrarRegisterSnippet,
  baseRegistrarSafeTransferFromSnippet,
} from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import {
  nameWrapperSafeTransferFromSnippet,
  nameWrapperSetFusesSnippet,
  nameWrapperSetResolverSnippet,
  nameWrapperSetSubnodeOwnerSnippet,
  nameWrapperSetSubnodeRecordSnippet,
  nameWrapperWrapEth2ldSnippet,
  nameWrapperWrapSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  publicResolverSetAddrSnippet,
  publicResolverSetTextSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { userRegistryRegisterSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  hexToBytes,
  keccak256,
  toBytes,
  toHex,
} from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

// --- V1 contract addresses --------------------------------------------------
// V1 contracts sourced from the ensjs Sepolia chain config (same source as
// preflightChecks.ts) so they can't drift from the canonical deployment.
export const V1_BASE_REGISTRAR =
  ensjsSepolia.ensBaseRegistrarImplementation.address
export const V1_NAME_WRAPPER = ensjsSepolia.ensNameWrapper.address
// Fallback owner of the official Sepolia BaseRegistrar — impersonated to
// re-authorize DEFAULT_ACCOUNT as a controller. ENS revoked all V1 controllers
// at ~block 10927919 as part of the V2 migration cutover.
//
// The registrar's `owner()` has since been transferred on Sepolia, so this
// constant is only a last-resort fallback: `ensureFunded()` reads the live
// `owner()` off the fork and impersonates THAT. Hardcoding the owner is what
// silently broke name creation once ownership moved — impersonating a non-owner
// makes `addController` revert, so DEFAULT_ACCOUNT never becomes a controller
// and every `register()` reverts, leaving phantom names that only exist in the
// subgraph mock.
export const V1_BASE_REGISTRAR_OWNER =
  '0xB359d7d04F750E9C008A5a47Bd2b64134bD180F9' as const
/**
 * The single V1-era resolver this panel uses — both for the V2 RESERVED slot and for names
 * seeded with records. It has to satisfy three things at once, and only this one does on
 * the current fork:
 *
 * 1. **V1-writable** — authorises against V1 ownership (registry → NameWrapper →
 *    `ownerOf`), which is exactly who controls a name that has not migrated yet. The V2
 *    `ensPublicResolver` authorises top-down against the V2 registry, where a RESERVED
 *    name has no owner at all, so records there are unwritable until migration — and
 *    permanently unwritable for a name that can never migrate (e.g. `CANNOT_TRANSFER`).
 * 2. **In the app's `KNOWN_PUBLIC_RESOLVERS` allowlist** — so `resolverStrategyFor`
 *    returns `to-owned-permres` and migration moves records onto a proper V2 resolver. An
 *    unlisted resolver is treated as custom and preserved verbatim, which leaves the
 *    migrated name pointing at a V1 resolver it can never write through.
 * 3. **The same on both sides.** Using one address for the reservation and another for the
 *    records meant the portal read the reservation's resolver while the records lived on
 *    the other, and the records tab showed nothing.
 */
export const V1_PUBLIC_RESOLVER =
  '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as const

/** Alias kept for readability at the record-seeding call sites. */
export const V1_RECORDS_RESOLVER = V1_PUBLIC_RESOLVER

/** Label used for the subname created by the `with subname` option. */
export const SUBNAME_LABEL = 'sub' as const

/** Records written by the `with records` option — keys mirrored into the subgraph mock. */
export const SEEDED_TEXT_KEYS = ['description', 'url'] as const
export const SEEDED_COIN_TYPES = [60] as const

// V2 contracts — sourced from the same ensjs Sepolia manifest as Manager's
// destination contract table so fixture reservations cannot drift to a retired
// deployment while the migration flow targets the active one.
/** V1 ENS registry — used to find the reverse node's resolver. */
export const V1_ENS_REGISTRY = ensjsSepolia.ensLegacyRegistry.address

/** V1 ReverseRegistrar — owns `addr.reverse`, where primary names actually live. */
export const V1_REVERSE_REGISTRAR = ensjsSepolia.ensReverseRegistrar.address

export const V2_ETH_REGISTRY_ADDR = ensjsSepolia.ensRegistry.address
export const V2_ETH_REGISTRAR_ADDR = ensjsSepolia.ensEthRegistrar.address
const V2_MIGRATION_CONTROLLERS = [
  ensjsSepolia.ensUnlockedMigrationController.address,
  ensjsSepolia.ensLockedMigrationController.address,
] as const

/** Anvil account #0 — always has 10 000 ETH on a fresh fork. */
export const DEFAULT_ACCOUNT =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

/**
 * Anvil account #1 — the third party approved by the `frozen-approval` preset.
 * Must not be the owner: ERC-721 rejects approving the current owner.
 */
export const FROZEN_APPROVAL_SPENDER =
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

/**
 * Anvil's well-known accounts, for testing anything involving more than one party:
 * transfers, and the V1 registrant/manager split.
 *
 * Anvil has every one of these unlocked, so `sendTxFrom` can act as any of them without
 * a private key. Account A is the default and the one the panel's subgraph mock has
 * historically assumed.
 */
export const DEV_ACCOUNTS: {
  readonly label: string
  readonly address: Address
}[] = [
  // Anvil #0 and #1 — the only default accounts still plain EOAs on this fork.
  { label: 'A', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
  { label: 'B', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  // Anvil #2-#9 carry 48 bytes of delegation code from the smart-account setup. A contract
  // that does not implement `onERC1155Received` correctly cannot RECEIVE a wrapped name —
  // the transfer reverts inside the callback. Rather than clear their code (which would
  // break the HCA fixtures), use fresh addresses that have never been touched.
  { label: 'C', address: '0xc000000000000000000000000000000000000c01' },
  { label: 'D', address: '0xd000000000000000000000000000000000000D01' },
]

/** Short label for an address, for panel UI and log lines. */
export const accountLabel = (address: string): string =>
  DEV_ACCOUNTS.find((a) => a.address.toLowerCase() === address.toLowerCase())
    ?.label ?? `${address.slice(0, 6)}…`

export const ONE_YEAR = 365 * 24 * 3600

// Bonus added to a name's v1 expiry when it's reserved on v2 during pre-migration
// (contracts-v2 `PREMIGRATION_BONUS_PERIOD = 1 + (GRACE_PERIOD_V1 - GRACE_PERIOD_V2)`
// = ~62 days). The v2 slot stays RESERVED for this window, then AVAILABLE-renewable
// for another GRACE_PERIOD_V2 (28d) — 62 + 28 = 90 days = the full v1 grace, so a
// reserved v1 name is renewable throughout grace. Match it so seeded names have the
// SAME renewable window as production (rather than staying renewable indefinitely).
export const PREMIGRATION_BONUS_PERIOD = 1 + (90 - 28) * 24 * 3600
export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

// --- Fuse bit masks (NameWrapper) -------------------------------------------
export const CANNOT_UNWRAP = 1 as const
export const CANNOT_BURN_FUSES = 2 as const
export const CANNOT_TRANSFER = 4 as const
export const CANNOT_SET_RESOLVER = 8 as const
export const CANNOT_SET_TTL = 16 as const
export const CANNOT_CREATE_SUBDOMAIN = 32 as const
export const CANNOT_APPROVE = 64 as const
export const PARENT_CANNOT_CONTROL = 1 << 16
export const IS_DOT_ETH = 1 << 17

export const ALL_CHILD_FUSES =
  CANNOT_UNWRAP |
  CANNOT_BURN_FUSES |
  CANNOT_TRANSFER |
  CANNOT_SET_RESOLVER |
  CANNOT_SET_TTL |
  CANNOT_CREATE_SUBDOMAIN |
  CANNOT_APPROVE

/**
 * The owner-controlled fuses, in bit order, with what each one means for migration.
 *
 * Only these seven can be burned through `setFuses` — its `ownerControlledFuses`
 * parameter is a `uint16`, so the parent-controlled bits (`PARENT_CANNOT_CONTROL`,
 * `IS_DOT_ETH`, `CAN_EXTEND_EXPIRY`) cannot be set here. The wrapper sets the first two
 * itself when wrapping a `.eth` 2LD; `CAN_EXTEND_EXPIRY` is only reachable on a subname.
 */
export const OWNER_FUSE_OPTIONS: {
  readonly value: number
  readonly label: string
  readonly note: string
}[] = [
  {
    value: CANNOT_UNWRAP,
    label: 'CANNOT_UNWRAP',
    note: 'Makes the name "locked" — routes migration through LockedMigrationController and deploys a WrapperRegistry.',
  },
  {
    value: CANNOT_BURN_FUSES,
    label: 'CANNOT_BURN_FUSES',
    note: 'Frozen fuses become frozen roles: V2 grants no admin roles, so nothing can be re-delegated.',
  },
  {
    value: CANNOT_TRANSFER,
    label: 'CANNOT_TRANSFER',
    note: 'Blocks the ERC-1155 transfer migration depends on. The name can NEVER be migrated.',
  },
  {
    value: CANNOT_SET_RESOLVER,
    label: 'CANNOT_SET_RESOLVER',
    note: 'V2 withholds ROLE_SET_RESOLVER. If a resolver is pinned, migration is blocked unless it is certified in PublicResolverSet.',
  },
  {
    value: CANNOT_SET_TTL,
    label: 'CANNOT_SET_TTL',
    note: 'No V2 equivalent — silently dropped, roles are unchanged.',
  },
  {
    value: CANNOT_CREATE_SUBDOMAIN,
    label: 'CANNOT_CREATE_SUBDOMAIN',
    note: 'V2 withholds ROLE_REGISTRAR on the WrapperRegistry root, so no subnames can ever be created.',
  },
  {
    value: CANNOT_APPROVE,
    label: 'CANNOT_APPROVE',
    note: 'Harmless alone. Fatal if a token approval is outstanding when it is burned (FrozenTokenApproval).',
  },
]

/** Human-readable list of the burned owner fuses, e.g. "CANNOT_UNWRAP | CANNOT_TRANSFER". */
export function fuseSummary(bitmap: number): string {
  const burned = OWNER_FUSE_OPTIONS.filter((f) => (bitmap & f.value) !== 0)
  return burned.length === 0
    ? 'CAN_DO_EVERYTHING'
    : burned.map((f) => f.label).join(' | ')
}

/**
 * Why `bitmap` cannot be burned on a `.eth` 2LD, or `null` if it can.
 *
 * V1 refuses to burn any owner fuse unless `CANNOT_UNWRAP` is already burned — see
 * `NameWrapper._checkFusesAreSettable` / `OperationProhibited`. That revert used to pass
 * unnoticed here, leaving a name whose real fuses were just `PARENT_CANNOT_CONTROL |
 * IS_DOT_ETH` while the panel and the subgraph mock both claimed otherwise.
 */
export function invalidFuseCombination(
  bitmap: number,
  options: CreateNameOptions = {},
): { readonly short: string; readonly reason: string } | null {
  if (options.withSubname && (bitmap & CANNOT_CREATE_SUBDOMAIN) !== 0) {
    return {
      short: 'no subnames allowed',
      reason:
        'CANNOT_CREATE_SUBDOMAIN blocks subname creation — clear it, or drop the subname option.',
    }
  }
  // Check for non-owner-controlled bits FIRST: `fuseSummary` only names the seven owner
  // fuses, so reporting the CANNOT_UNWRAP rule for, say, CAN_EXTEND_EXPIRY would print a
  // baffling "CAN_DO_EVERYTHING cannot be burned without CANNOT_UNWRAP".
  if ((bitmap & ~ALL_CHILD_FUSES) !== 0) {
    return {
      short: 'unsupported fuse bits',
      reason: `0x${(bitmap & ~ALL_CHILD_FUSES).toString(16)} contains non-owner-controlled bits — setFuses takes a uint16 and cannot set PARENT_CANNOT_CONTROL, IS_DOT_ETH or CAN_EXTEND_EXPIRY.`,
    }
  }
  if (bitmap !== 0 && (bitmap & CANNOT_UNWRAP) === 0) {
    return {
      short: 'needs CANNOT_UNWRAP',
      reason: `${fuseSummary(bitmap)} cannot be burned without CANNOT_UNWRAP — V1 only allows owner fuses on a locked name.`,
    }
  }
  return null
}

/**
 * What the migration UI should do with a name carrying `bitmap`, so the panel can warn
 * before a name is created rather than leaving the tester to guess why it never appears.
 */
export function migrationOutcomeFor(bitmap: number): {
  readonly kind: 'migrates' | 'blocked'
  readonly reason: string
} {
  const invalid = invalidFuseCombination(bitmap)
  if (invalid) return { kind: 'blocked', reason: invalid.reason }
  if ((bitmap & CANNOT_TRANSFER) !== 0) {
    return {
      kind: 'blocked',
      reason:
        'CANNOT_TRANSFER — the wrapper refuses the transfer, so this name is permanently unmigratable and the app lists it as ineligible.',
    }
  }
  if ((bitmap & CANNOT_UNWRAP) === 0) {
    return {
      kind: 'migrates',
      reason:
        'Unlocked — migrates via UnlockedMigrationController: unwrapped into V2 with plain registration roles and no WrapperRegistry.',
    }
  }
  return {
    kind: 'migrates',
    reason:
      'Locked — migrates via LockedMigrationController: a WrapperRegistry is deployed and fuses are projected onto the token and root role bitmaps.',
  }
}

// --- Storage keys -----------------------------------------------------------
export const POSITION_STORAGE_KEY = 'ens:migration-tool:pos'

// --- Types ------------------------------------------------------------------
export type PresetType =
  | 'unwrapped'
  | 'wrapped'
  | 'locked'
  | 'locked-all'
  | 'grace'
  | 'grace-renewable-wrapped'
  | 'grace-renewable-unwrapped'
  | 'emancipated'
  | 'custom'
  | 'frozen-approval'

export interface ActiveName {
  label: string
  type: PresetType
  id: string
  /** Unix seconds — V1 expiry, used for subgraph mock and V2 reservation */
  expiryDate: number
  /**
   * Owner-controlled fuses actually burned on chain.
   *
   * Set for `custom` / `frozen-approval` names, where the bitmap cannot be inferred from
   * `type`. `buildMockDomain` reports this verbatim, so the subgraph mock and the chain
   * agree — if they disagree the migration UI classifies the name against fuses it does
   * not really have.
   */
  ownerFuses?: number
  /** Name was seeded with records — mirrored into the subgraph mock. */
  hasRecords?: boolean
  /** Label of the subname created under this name, if any. */
  subnameLabel?: string
  /** Account holding the name. Defaults to account A when absent (legacy entries). */
  ownerAddress?: string
  /** V1 registry controller, when it differs from the registrant (unwrapped only). */
  managerAddress?: string
  /** Name was set as the owner's V1 primary (reverse) name. */
  isPrimary?: boolean
  /** The SUBNAME is the owner's V1 primary — only the parent migrates. */
  subnamePrimary?: boolean
  /** Holder of the subname, when it has been moved away from the parent's owner. */
  subnameOwner?: string
  /**
   * Whether the subname is in the NameWrapper.
   *
   * A child of a WRAPPED parent is minted through the wrapper and so is wrapped; a child
   * of an unwrapped parent is registry-only until `wrapSubname` is used. It changes how the
   * subgraph domain must look, and therefore how the app classifies it.
   */
  subnameWrapped?: boolean
}

export type Pos = { left: number; top: number }

// --- Preset definitions -----------------------------------------------------
export const PRESETS: { type: PresetType; label: string; title: string }[] = [
  { type: 'unwrapped', label: 'Unwrapped', title: 'ERC-721 on BaseRegistrar' },
  { type: 'wrapped', label: 'Wrapped', title: 'NameWrapper, no fuses' },
  {
    type: 'locked',
    label: 'Locked',
    title: 'NameWrapper, CANNOT_UNWRAP fuse burned',
  },
  {
    type: 'locked-all',
    label: 'Locked+All',
    title: 'NameWrapper, all 7 child fuses burned',
  },
  {
    type: 'grace',
    label: 'Grace Period',
    title: 'Locked name expired 45 days ago (clock advanced)',
  },
  {
    type: 'grace-renewable-wrapped',
    label: 'Grace RW (wrapped)',
    title:
      'Wrapped name in grace, v2 reservation active → isRenewable=true. NOTE: after renewal the NameWrapper token stays expired, so migration reverts with ERC1155 insufficient balance.',
  },
  {
    type: 'grace-renewable-unwrapped',
    label: 'Grace RW (unwrapped)',
    title:
      'Unwrapped name in grace, v2 reservation active → isRenewable=true. Renew then migrate works end-to-end (ERC-721 in BaseRegistrar).',
  },
  {
    type: 'emancipated',
    label: 'Emancipated',
    title: 'Locked subname with PARENT_CANNOT_CONTROL',
  },
  {
    type: 'frozen-approval',
    label: 'Frozen Approval',
    title:
      'Locked name approved to a third party, then CANNOT_APPROVE burned — pins the approval forever, so migration reverts with FrozenTokenApproval and the app lists it as ineligible',
  },
]

/**
 * Days of GLOBAL clock drift each preset costs.
 *
 * `increaseTime` moves the whole fork, so a preset that lands a name in grace also ages
 * every other name by the same amount. Creating the three grace presets in one sitting
 * advances ~3.4 years and silently expires everything created earlier — which reads as
 * "only one name is migratable" rather than "your other names expired".
 */
export const PRESET_DRIFT_DAYS: Partial<Record<PresetType, number>> = {
  grace: 410,
  'grace-renewable-wrapped': 410,
  'grace-renewable-unwrapped': 410,
}

export const TYPE_BADGE_COLORS: Record<PresetType, string> = {
  unwrapped: '#4b5563',
  wrapped: '#1d4ed8',
  locked: '#7c3aed',
  'locked-all': '#9333ea',
  grace: '#b45309',
  'grace-renewable-wrapped': '#c2410c',
  'grace-renewable-unwrapped': '#ea580c',
  emancipated: '#065f46',
  custom: '#0f766e',
  'frozen-approval': '#be123c',
}

// --- ABI fragments ----------------------------------------------------------
// All contract ABIs are sourced from @ensdomains/ensjs-abi per-function
// snippets (imported above). NameWrapper: wrapETH2LD / setFuses /
// setSubnodeOwner. BaseRegistrar: register / addController / owner /
// controllers. setApprovalForAll from the registry snippet (standard
// ERC-721/1155 method, encodes identically). V2 registry register from
// v2/userRegistry (identical param types; only names differ).

// --- Crypto helpers ---------------------------------------------------------

/** ETH namehash of "eth" */
export const ETH_NODE =
  '0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae' as const

export function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(label))
}

export function namehashFromLabelAndParent(
  labelHash: `0x${string}`,
  parentNode: `0x${string}`,
): `0x${string}` {
  return keccak256(concat([hexToBytes(parentNode), hexToBytes(labelHash)]))
}

// --- JSON-RPC helpers -------------------------------------------------------

interface RpcReadCall {
  readonly method: string
  readonly params: unknown[]
}

interface RpcBatchResponse {
  readonly id?: number
  readonly result?: unknown
  readonly error?: { readonly message?: string }
}

interface RpcBatchRequest extends RpcReadCall {
  readonly jsonrpc: '2.0'
  readonly id: number
}

const RPC_READ_BATCH_SIZE = 100

export async function rpcCall(
  endpoint: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`)
  const json = (await res.json()) as {
    result?: unknown
    error?: { message: string }
  }
  if (json.error) throw new Error(`RPC error: ${json.error.message}`)
  return json.result
}

/**
 * Send read-only JSON-RPC calls in bounded batches. Batch responses may arrive
 * in any order, so results are restored to input order by request id. If an RPC
 * endpoint does not support batching, retry that chunk as individual reads;
 * per-call failures stay `undefined` for the caller's existing fallback.
 */
async function fetchRpcReadBatch(
  endpoint: string,
  requests: readonly RpcBatchRequest[],
): Promise<RpcBatchResponse[]> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requests),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`)
  const json: unknown = await res.json()
  if (!Array.isArray(json))
    throw new Error('RPC batch response is not an array')
  return json as RpcBatchResponse[]
}

async function retryRpcReadChunk(
  endpoint: string,
  chunk: readonly RpcReadCall[],
  results: (unknown | undefined)[],
  offset: number,
): Promise<void> {
  for (const [index, call] of chunk.entries()) {
    try {
      results[offset + index] = await rpcCall(
        endpoint,
        call.method,
        call.params,
      )
    } catch {
      // Preserve the caller's per-name fallback for an unreadable entry.
    }
  }
}

function restoreRpcReadBatchOrder(
  responses: readonly RpcBatchResponse[],
  requests: readonly RpcBatchRequest[],
  results: (unknown | undefined)[],
  offset: number,
): void {
  const responsesById = new Map(
    responses.flatMap((response) =>
      typeof response.id === 'number' ? [[response.id, response] as const] : [],
    ),
  )
  for (const [index, request] of requests.entries()) {
    const response = responsesById.get(request.id)
    if (response && !response.error) results[offset + index] = response.result
  }
}

async function rpcReadBatch(
  endpoint: string,
  calls: readonly RpcReadCall[],
): Promise<(unknown | undefined)[]> {
  const results = new Array<unknown | undefined>(calls.length).fill(undefined)

  for (let offset = 0; offset < calls.length; offset += RPC_READ_BATCH_SIZE) {
    const chunk = calls.slice(offset, offset + RPC_READ_BATCH_SIZE)
    const requests: RpcBatchRequest[] = chunk.map((call, index) => ({
      jsonrpc: '2.0' as const,
      id: offset + index + 1,
      method: call.method,
      params: call.params,
    }))

    try {
      const responses = await fetchRpcReadBatch(endpoint, requests)
      restoreRpcReadBatchOrder(responses, requests, results, offset)
    } catch {
      await retryRpcReadChunk(endpoint, chunk, results, offset)
    }
  }

  return results
}

export async function sendTx(
  endpoint: string,
  to: string,
  data: `0x${string}`,
  value = '0x0',
): Promise<void> {
  const hash = (await rpcCall(endpoint, 'eth_sendTransaction', [
    {
      from: DEFAULT_ACCOUNT,
      to,
      data,
      gas: '0x7A120', // 500 000 gas
      gasPrice: '0x3B9ACA00', // 1 gwei — override fork base fee
      value,
    },
  ])) as string
  await rpcCall(endpoint, 'evm_mine', [])
  await assertTxSucceeded(endpoint, hash, to)
}

/**
 * Fail loudly on a reverted transaction.
 *
 * Anvil accepts and mines reverting transactions, so without this a revert looks exactly
 * like success: the panel reports a name created, but the fuses (or the reservation) were
 * never applied. That produced names whose on-chain state silently disagreed with what the
 * panel and the subgraph mock claimed.
 */
async function assertTxSucceeded(
  endpoint: string,
  hash: string,
  to: string,
): Promise<void> {
  const receipt = (await rpcCall(endpoint, 'eth_getTransactionReceipt', [
    hash,
  ])) as { status?: string } | null
  if (!receipt) throw new Error(`No receipt for ${hash} (to ${to})`)
  if (receipt.status !== '0x1') {
    throw new Error(
      `Transaction to ${to} reverted (status ${String(receipt.status)}, hash ${hash})`,
    )
  }
}

export async function increaseTime(
  endpoint: string,
  seconds: number,
): Promise<void> {
  await rpcCall(endpoint, 'evm_increaseTime', [seconds])
  await rpcCall(endpoint, 'evm_mine', [])
}

export async function getBlockTimestamp(endpoint: string): Promise<number> {
  const block = (await rpcCall(endpoint, 'eth_getBlockByNumber', [
    'latest',
    false,
  ])) as { timestamp: string }
  return Number.parseInt(block.timestamp, 16)
}

// Variant of sendTx that uses a custom `from` (for impersonated accounts).
// Funds the sender with 0.1 ETH first so the gas cost is covered even if the
// impersonated account has zero balance on the fork.
export async function sendTxFrom(
  endpoint: string,
  from: string,
  to: string,
  data: `0x${string}`,
): Promise<void> {
  await rpcCall(endpoint, 'anvil_setBalance', [from, '0x16345785D8A0000']) // 0.1 ETH
  // Impersonate rather than assume the sender is one of Anvil's unlocked accounts, so any
  // address can act — including the fresh ones in `DEV_ACCOUNTS`.
  await rpcCall(endpoint, 'anvil_impersonateAccount', [from])
  let hash: string
  try {
    hash = (await rpcCall(endpoint, 'eth_sendTransaction', [
      { from, to, data, gas: '0xF4240', gasPrice: '0x3B9ACA00' },
    ])) as string
  } finally {
    await rpcCall(endpoint, 'anvil_stopImpersonatingAccount', [from])
  }
  await rpcCall(endpoint, 'evm_mine', [])
  // Same reason as `sendTx`: Anvil mines reverting transactions, so without this a failed
  // write is indistinguishable from a successful one.
  await assertTxSucceeded(endpoint, hash, to)
}

// --- Name creation ----------------------------------------------------------

/**
 * Register a V1 .eth name by calling BaseRegistrar.register() directly.
 * DEFAULT_ACCOUNT must already be an authorized controller on the BaseRegistrar —
 * ensureFunded() does this via impersonation on each Anvil session.
 */
export async function registerV1Name(
  endpoint: string,
  label: string,
  wrapAfterRegister: boolean,
  owner: Address = DEFAULT_ACCOUNT,
  manager?: Address,
): Promise<void> {
  const tokenId = BigInt(labelhash(label))

  await sendTx(
    endpoint,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: baseRegistrarRegisterSnippet,
      functionName: 'register',
      args: [tokenId, owner, BigInt(ONE_YEAR)],
    }),
  )

  if (!wrapAfterRegister) {
    // Registrant/manager split — only reachable while UNWRAPPED, because wrapping hands
    // the registry node to the NameWrapper. `reclaim` is what writes the registry owner,
    // and only the registrant may call it.
    if (manager && manager.toLowerCase() !== owner.toLowerCase()) {
      await sendTxFrom(
        endpoint,
        owner,
        V1_BASE_REGISTRAR,
        encodeFunctionData({
          abi: baseRegistrarReclaimSnippet,
          functionName: 'reclaim',
          args: [tokenId, manager],
        }),
      )
    }
    return
  }

  // Approve + wrap must come FROM the registrant, not from whoever drives the panel.
  await sendTxFrom(
    endpoint,
    owner,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: registrySetApprovalForAllSnippet,
      functionName: 'setApprovalForAll',
      args: [V1_NAME_WRAPPER, true],
    }),
  )

  // Wrap via official NameWrapper (pass zero resolver — not needed for migration testing)
  await sendTxFrom(
    endpoint,
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperWrapEth2ldSnippet,
      functionName: 'wrapETH2LD',
      args: [label, owner, 0, ZERO_ADDRESS],
    }),
  )
}

/** Move a V1 name to another account — wrapped names via the NameWrapper, else ERC-721. */
export async function transferV1Name(
  endpoint: string,
  label: string,
  from: Address,
  to: Address,
  isWrapped: boolean,
): Promise<void> {
  const node = namehashFromLabelAndParent(labelhash(label), ETH_NODE)
  await sendTxFrom(
    endpoint,
    from,
    isWrapped ? V1_NAME_WRAPPER : V1_BASE_REGISTRAR,
    isWrapped
      ? encodeFunctionData({
          abi: nameWrapperSafeTransferFromSnippet,
          functionName: 'safeTransferFrom',
          args: [from, to, BigInt(node), 1n, '0x'],
        })
      : encodeFunctionData({
          abi: baseRegistrarSafeTransferFromSnippet,
          functionName: 'safeTransferFrom',
          args: [from, to, BigInt(labelhash(label))],
        }),
  )
}

/**
 * Move a MIGRATED name to another account in ENSv2.
 *
 * The registry rewrites the owner's roles onto the recipient during transfer, so read the
 * token id fresh: granting a role regenerates the token, and a stale id fails as an
 * opaque `ERC1155InsufficientBalance`.
 */
export async function transferV2Name(
  endpoint: string,
  label: string,
  from: Address,
  to: Address,
): Promise<void> {
  const tokenId = await readV2TokenId(endpoint, label)
  await sendTxFrom(
    endpoint,
    from,
    V2_ETH_REGISTRY_ADDR,
    encodeFunctionData({
      abi: v2SafeTransferFromAbi,
      functionName: 'safeTransferFrom',
      args: [from, to, tokenId, 1n, '0x'],
    }),
  )
}

const v2SafeTransferFromAbi = [
  {
    type: 'function',
    name: 'safeTransferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

const v2GetTokenIdAbi = [
  {
    type: 'function',
    name: 'getTokenId',
    stateMutability: 'view',
    inputs: [{ name: 'labelId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

/**
 * Make this name the owner's V1 primary (reverse) name.
 *
 * A primary name is NOT a property of the forward name — it is a separate record on
 * `<address>.addr.reverse`. Migration deliberately never touches it: the app's V1 subgraph
 * query filters out everything under `addr.reverse`, and the reverse registrar has its own
 * operator-driven `batchSetName` migration.
 *
 * That is why this matters for testing: after migrating the forward name, the reverse
 * record still says "<label>.eth", so the primary only keeps verifying if forward
 * resolution in V2 still returns this address. Seed the address record too, or the primary
 * is broken before migration even starts and the test proves nothing.
 */
export async function setV1PrimaryName(
  endpoint: string,
  fullName: string,
  owner: Address,
): Promise<void> {
  await sendTxFrom(
    endpoint,
    owner,
    V1_REVERSE_REGISTRAR,
    encodeFunctionData({
      abi: reverseRegistrarSetNameSnippet,
      functionName: 'setName',
      args: [fullName],
    }),
  )
}

/**
 * Seed records directly on a node, whatever its depth.
 *
 * `seedNameRecords` handles a 2LD, which owns its resolver slot; a subname already has a
 * resolver from `createChildSubname`, so only the records themselves are needed here.
 */
async function seedRecordsOnNode(
  endpoint: string,
  node: `0x${string}`,
  displayName: string,
  owner: Address,
): Promise<void> {
  for (const key of SEEDED_TEXT_KEYS) {
    await sendTxFrom(
      endpoint,
      owner,
      V1_RECORDS_RESOLVER,
      encodeFunctionData({
        abi: publicResolverSetTextSnippet,
        functionName: 'setText',
        args: [node, key, `dev-tool ${key} for ${displayName}`],
      }),
    )
  }
  for (const coinType of SEEDED_COIN_TYPES) {
    await sendTxFrom(
      endpoint,
      owner,
      V1_RECORDS_RESOLVER,
      encodeFunctionData({
        abi: publicResolverSetAddrSnippet,
        functionName: 'setAddr',
        args: [node, BigInt(coinType), owner],
      }),
    )
  }
}

/**
 * Make a SUBNAME the owner's V1 primary.
 *
 * The interesting case for migration: the reverse record points at `sub.parent.eth`, but
 * only the PARENT migrates. Whether the primary still verifies afterwards depends on the
 * subname resolving in whichever registry now answers for it.
 *
 * Seeds the address record first — a reverse record pointing at a name that resolves to
 * nothing was never a working primary, so migrating it would prove nothing.
 */
export async function setSubnamePrimary(
  endpoint: string,
  parentLabel: string,
  sublabel: string,
  owner: Address,
): Promise<void> {
  const parentNode = namehashFromLabelAndParent(
    labelhash(parentLabel),
    ETH_NODE,
  )
  const subNode = namehashFromLabelAndParent(labelhash(sublabel), parentNode)
  const fullName = `${sublabel}.${parentLabel}.eth`
  await seedRecordsOnNode(endpoint, subNode, fullName, owner)
  await setV1PrimaryName(endpoint, fullName, owner)
}

/** The name currently set as `addr`'s V1 primary, or '' if none. */
export async function readV1PrimaryName(
  endpoint: string,
  addr: Address,
): Promise<string> {
  const reverseNode = namehashFromLabelAndParent(
    labelhash(addr.slice(2).toLowerCase()),
    ADDR_REVERSE_NODE,
  )
  const resolver = (await rpcCall(endpoint, 'eth_call', [
    {
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: registryResolverAbi,
        functionName: 'resolver',
        args: [reverseNode],
      }),
    },
    'latest',
  ])) as string
  const resolverAddr = `0x${resolver.slice(-40)}` as Address
  if (/^0x0+$/.test(resolverAddr)) return ''
  const raw = (await rpcCall(endpoint, 'eth_call', [
    {
      to: resolverAddr,
      data: encodeFunctionData({
        abi: reverseNameAbi,
        functionName: 'name',
        args: [reverseNode],
      }),
    },
    'latest',
  ])) as string
  // decode a single dynamic string return
  const len = Number(BigInt(`0x${raw.slice(2 + 64, 2 + 128)}`))
  if (len === 0) return ''
  // Decode the UTF-8 bytes by hand — this runs in the browser, where Buffer is absent.
  const hex = raw.slice(2 + 128, 2 + 128 + len * 2)
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

/** namehash('addr.reverse') */
const ADDR_REVERSE_NODE =
  '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2' as const

const registryResolverAbi = [
  {
    type: 'function',
    name: 'resolver',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

const reverseNameAbi = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

/**
 * Transfer a wrapped SUBNAME (3LD) to another account.
 *
 * The token moves either way, but it only STAYS moved if the child is emancipated: without
 * `PARENT_CANNOT_CONTROL` the parent can call `setSubnodeOwner` and hand it to somebody
 * else, silently undoing the transfer. `isSubnameEmancipated` is what the panel warns on.
 */
export async function transferSubname(
  endpoint: string,
  parentLabel: string,
  sublabel: string,
  from: Address,
  to: Address,
): Promise<void> {
  const parentNode = namehashFromLabelAndParent(
    labelhash(parentLabel),
    ETH_NODE,
  )
  const subNode = namehashFromLabelAndParent(labelhash(sublabel), parentNode)
  await sendTxFrom(
    endpoint,
    from,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperSafeTransferFromSnippet,
      functionName: 'safeTransferFrom',
      args: [from, to, BigInt(subNode), 1n, '0x'],
    }),
  )
}

/** DNS wire format: each label length-prefixed, terminated by a zero byte. */
function dnsEncode(name: string): `0x${string}` {
  const bytes: number[] = []
  for (const label of name.split('.')) {
    const encoded = new TextEncoder().encode(label)
    bytes.push(encoded.length, ...encoded)
  }
  bytes.push(0)
  return `0x${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Wrap an existing SUBNAME into the NameWrapper.
 *
 * Works regardless of whether the parent is wrapped — which is the point: an unwrapped
 * 2LD with a wrapped child is a real V1 shape, and a revealing one for migration. The
 * parent migrates through `UnlockedMigrationController` and gets NO `WrapperRegistry`, so
 * the child has nowhere to migrate into; the app classifies it `unlocked-subname`.
 *
 * `PARENT_CANNOT_CONTROL` cannot be burned here — only a parent can emancipate a child,
 * and an unwrapped parent has no wrapper to do it with.
 */
export async function wrapSubname(
  endpoint: string,
  parentLabel: string,
  sublabel: string,
  owner: Address,
): Promise<void> {
  const fullName = `${sublabel}.${parentLabel}.eth`
  // The wrapper moves the registry node, so it needs operator rights on the registry.
  await sendTxFrom(
    endpoint,
    owner,
    V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: registrySetApprovalForAllSnippet,
      functionName: 'setApprovalForAll',
      args: [V1_NAME_WRAPPER, true],
    }),
  )
  await sendTxFrom(
    endpoint,
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperWrapSnippet,
      functionName: 'wrap',
      args: [dnsEncode(fullName), owner, V1_PUBLIC_RESOLVER],
    }),
  )
}

/** Whether a subname carries `PARENT_CANNOT_CONTROL` — i.e. a transfer of it is durable. */
export async function isSubnameEmancipated(
  endpoint: string,
  parentLabel: string,
  sublabel: string,
): Promise<boolean> {
  const parentNode = namehashFromLabelAndParent(
    labelhash(parentLabel),
    ETH_NODE,
  )
  const subNode = namehashFromLabelAndParent(labelhash(sublabel), parentNode)
  const raw = (await rpcCall(endpoint, 'eth_call', [
    {
      to: V1_NAME_WRAPPER,
      data: encodeFunctionData({
        abi: nameWrapperGetDataAbi,
        functionName: 'getData',
        args: [BigInt(subNode)],
      }),
    },
    'latest',
  ])) as string
  // getData returns (address owner, uint32 fuses, uint64 expiry) — fuses is word 2.
  const fuses = Number(BigInt(`0x${raw.slice(2 + 64, 2 + 128)}`))
  return (fuses & PARENT_CANNOT_CONTROL) !== 0
}

const nameWrapperGetDataAbi = [
  {
    type: 'function',
    name: 'getData',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'fuses', type: 'uint32' },
      { name: 'expiry', type: 'uint64' },
    ],
  },
] as const

/**
 * Hand the V1 registry controller ("manager") to another account.
 *
 * `reclaim` is the registrant's lever and rewrites the registry owner, so it works even
 * when the current manager is somebody else. Unwrapped names only: once wrapped, the
 * registry node belongs to the NameWrapper and there is no separate manager to move.
 */
export async function transferManager(
  endpoint: string,
  label: string,
  registrant: Address,
  newManager: Address,
): Promise<void> {
  await sendTxFrom(
    endpoint,
    registrant,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: baseRegistrarReclaimSnippet,
      functionName: 'reclaim',
      args: [BigInt(labelhash(label)), newManager],
    }),
  )
}

/** Approve an operator for ALL of an account's wrapped names. */
export async function setWrapperApprovalForAll(
  endpoint: string,
  owner: Address,
  operator: Address,
  approved: boolean,
): Promise<void> {
  await sendTxFrom(
    endpoint,
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: registrySetApprovalForAllSnippet,
      functionName: 'setApprovalForAll',
      args: [operator, approved],
    }),
  )
}

/**
 * Whether the name has already been claimed in ENSv2 (status REGISTERED).
 *
 * Decides which contract a transfer has to go through, so it is read from chain rather
 * than inferred from the panel's own record — a name can be migrated from the app while
 * the panel still lists it.
 */
export async function isMigratedInV2(
  endpoint: string,
  label: string,
): Promise<boolean> {
  const result = (await rpcCall(endpoint, 'eth_call', [
    {
      to: V2_ETH_REGISTRY_ADDR,
      data: encodeFunctionData({
        abi: V2_GET_STATUS_ABI,
        functionName: 'getStatus',
        args: [BigInt(labelhash(label))],
      }),
    },
    'latest',
  ])) as string
  return Number(BigInt(result)) === V2_NAME_STATUS.REGISTERED
}

/** Current (version-aware) ENSv2 token id for a label. */
export async function readV2TokenId(
  endpoint: string,
  label: string,
): Promise<bigint> {
  const result = (await rpcCall(endpoint, 'eth_call', [
    {
      to: V2_ETH_REGISTRY_ADDR,
      data: encodeFunctionData({
        abi: v2GetTokenIdAbi,
        functionName: 'getTokenId',
        args: [BigInt(labelhash(label))],
      }),
    },
    'latest',
  ])) as string
  return BigInt(result)
}

export async function setNameFuses(
  endpoint: string,
  label: string,
  fuses: number,
  owner: Address = DEFAULT_ACCOUNT,
): Promise<void> {
  // `setFuses` takes a uint16. Passing a parent-controlled bit (PARENT_CANNOT_CONTROL,
  // IS_DOT_ETH, CAN_EXTEND_EXPIRY) fails deep inside ABI encoding with an opaque
  // "not in safe 16-bit unsigned integer range", so reject it here with the reason.
  if ((fuses & ~ALL_CHILD_FUSES) !== 0) {
    throw new Error(
      `setNameFuses: 0x${fuses.toString(16)} contains non-owner-controlled bits. ` +
        `Only ${fuseSummary(ALL_CHILD_FUSES)} can be burned via setFuses; the wrapper sets ` +
        `PARENT_CANNOT_CONTROL/IS_DOT_ETH itself and CAN_EXTEND_EXPIRY comes from the parent.`,
    )
  }

  const lh = labelhash(label)
  const node = namehashFromLabelAndParent(lh, ETH_NODE)
  // Fuses may only be burned by the name's owner, not by whoever drives the panel.
  await sendTxFrom(
    endpoint,
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperSetFusesSnippet,
      functionName: 'setFuses',
      args: [node, fuses],
    }),
  )
}

/**
 * ERC-721-style `approve` on the NameWrapper.
 *
 * `@ensdomains/ensjs-abi` ships no `approve` snippet for the NameWrapper, so this is the
 * one hand-written fragment in this file. The signature is the ERC-721 standard.
 */
const nameWrapperApproveAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

/** Approve a third party on the wrapped token — used to build the frozen-approval state. */
export async function approveNameWrapperToken(
  endpoint: string,
  label: string,
  spender: Address,
  owner: Address = DEFAULT_ACCOUNT,
): Promise<void> {
  const lh = labelhash(label)
  const node = namehashFromLabelAndParent(lh, ETH_NODE)
  await sendTxFrom(
    endpoint,
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperApproveAbi,
      functionName: 'approve',
      args: [spender, BigInt(node)],
    }),
  )
}

/**
 * Point a wrapped name at `V1_RECORDS_RESOLVER` and seed it with records.
 *
 * Must run BEFORE `CANNOT_SET_RESOLVER` is burned — afterwards the resolver is pinned and
 * `setResolver` reverts. `createV1NameOnAnvil` orders it that way, which also makes
 * "locked name with a pinned resolver that already holds records" reachable.
 */
export async function seedNameRecords(
  endpoint: string,
  label: string,
  owner: Address = DEFAULT_ACCOUNT,
  /** Wrapped names set their resolver through the NameWrapper; unwrapped ones cannot. */
  isWrapped = true,
  /** Registry controller, when it differs from the registrant (unwrapped only). */
  manager?: Address,
): Promise<void> {
  const node = namehashFromLabelAndParent(labelhash(label), ETH_NODE)

  // An unwrapped name has no NameWrapper entry at all, so its resolver lives on the V1
  // registry and only the registry owner (the manager, when there is one) may set it.
  if (isWrapped) {
    await sendTxFrom(
      endpoint,
      owner,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: nameWrapperSetResolverSnippet,
        functionName: 'setResolver',
        args: [node, V1_RECORDS_RESOLVER],
      }),
    )
  } else {
    await sendTxFrom(
      endpoint,
      manager ?? owner,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: registrySetResolverSnippet,
        functionName: 'setResolver',
        args: [node, V1_RECORDS_RESOLVER],
      }),
    )
  }

  for (const key of SEEDED_TEXT_KEYS) {
    await sendTxFrom(
      endpoint,
      owner,
      V1_RECORDS_RESOLVER,
      encodeFunctionData({
        abi: publicResolverSetTextSnippet,
        functionName: 'setText',
        args: [node, key, `dev-tool ${key} for ${label}.eth`],
      }),
    )
  }

  for (const coinType of SEEDED_COIN_TYPES) {
    await sendTxFrom(
      endpoint,
      owner,
      V1_RECORDS_RESOLVER,
      encodeFunctionData({
        abi: publicResolverSetAddrSnippet,
        functionName: 'setAddr',
        args: [node, BigInt(coinType), owner],
      }),
    )
  }
}

/**
 * Create a subname under a panel-created name.
 *
 * The child's fuses depend on the parent: V1 only permits burning
 * `PARENT_CANNOT_CONTROL` on a child whose parent is itself locked, so an unlocked parent
 * gets a plain subname. An emancipated child is the more interesting migration case —
 * it migrates through the parent's `WrapperRegistry` rather than with it.
 */
export async function createChildSubname(
  endpoint: string,
  parentLabel: string,
  sublabel: string,
  parentFuses: number,
  owner: Address = DEFAULT_ACCOUNT,
  /** Wrapped parents mint children through the NameWrapper; unwrapped ones cannot. */
  isWrapped = true,
): Promise<void> {
  const parentNode = namehashFromLabelAndParent(
    labelhash(parentLabel),
    ETH_NODE,
  )
  const now = await getBlockTimestamp(endpoint)
  const expiry = BigInt(now + ONE_YEAR * 2)
  const parentIsLocked = (parentFuses & CANNOT_UNWRAP) !== 0
  const childFuses = parentIsLocked ? PARENT_CANNOT_CONTROL | CANNOT_UNWRAP : 0

  // An unwrapped parent has no NameWrapper entry, so its children are minted on the V1
  // registry instead. Such a child is never migratable (the app classifies it
  // `unlocked-subname`), which is itself worth being able to build.
  if (!isWrapped) {
    await sendTxFrom(
      endpoint,
      owner,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: registrySetSubnodeOwnerSnippet,
        functionName: 'setSubnodeOwner',
        args: [parentNode, labelhash(sublabel), owner],
      }),
    )
    const subNode = namehashFromLabelAndParent(labelhash(sublabel), parentNode)
    await sendTxFrom(
      endpoint,
      owner,
      V1_ENS_REGISTRY,
      encodeFunctionData({
        abi: registrySetResolverSnippet,
        functionName: 'setResolver',
        args: [subNode, V1_RECORDS_RESOLVER],
      }),
    )
    return
  }

  // `setSubnodeRecord`, not `setSubnodeOwner`: the latter leaves the child with NO
  // resolver, so records written to it have nowhere to land — the portal reports no error
  // and simply shows nothing. Give the child the same resolver as everything else here so
  // it is manageable the moment it exists.
  await sendTxFrom(
    endpoint,
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperSetSubnodeRecordSnippet,
      functionName: 'setSubnodeRecord',
      args: [
        parentNode,
        sublabel,
        owner,
        V1_PUBLIC_RESOLVER,
        0n,
        childFuses,
        expiry,
      ],
    }),
  )
}

export async function createEmancipatedSubname(
  endpoint: string,
  parentLabel: string,
  sublabel: string,
): Promise<void> {
  const parentLh = labelhash(parentLabel)
  const parentNode = namehashFromLabelAndParent(parentLh, ETH_NODE)
  const now = await getBlockTimestamp(endpoint)
  const expiry = BigInt(now + ONE_YEAR * 2)
  const subFuses = PARENT_CANNOT_CONTROL | CANNOT_UNWRAP

  await sendTx(
    endpoint,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: nameWrapperSetSubnodeOwnerSnippet,
      functionName: 'setSubnodeOwner',
      args: [parentNode, sublabel, DEFAULT_ACCOUNT, subFuses, expiry],
    }),
  )
}

/** Read the live BaseRegistrar `owner()` off the fork; null if the call fails. */
export async function readRegistrarOwner(
  endpoint: string,
): Promise<`0x${string}` | null> {
  try {
    const result = (await rpcCall(endpoint, 'eth_call', [
      {
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: baseRegistrarOwnerSnippet,
          functionName: 'owner',
        }),
      },
      'latest',
    ])) as string
    if (typeof result !== 'string' || result.length < 66) return null
    return `0x${result.slice(-40)}` as `0x${string}`
  } catch {
    return null
  }
}

/** True if `account` is an authorized controller on the BaseRegistrar. */
export async function isController(
  endpoint: string,
  account: string,
): Promise<boolean> {
  try {
    const result = (await rpcCall(endpoint, 'eth_call', [
      {
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: baseRegistrarControllersSnippet,
          functionName: 'controllers',
          args: [account as `0x${string}`],
        }),
      },
      'latest',
    ])) as string
    return typeof result === 'string' && /[1-9a-f]/.test(result.slice(2))
  } catch {
    return false
  }
}

/**
 * Ensure DEFAULT_ACCOUNT is ready: fund it, clear any EOF contract code, and
 * re-authorize it as a controller on the official BaseRegistrar.
 *
 * ENS revoked all V1 controllers at ~block 10927919 as part of the V2 migration
 * cutover, so on a fresh Anvil fork no one can call BaseRegistrar.register().
 * We fix this by impersonating the BaseRegistrar owner and calling addController().
 *
 * The owner is read live off the fork (`owner()`) rather than hardcoded: it was
 * transferred on Sepolia, and impersonating a stale owner makes `addController`
 * revert silently, so DEFAULT_ACCOUNT never becomes a controller and every
 * `register()` reverts — producing phantom names that exist only in the
 * subgraph mock. We verify the grant landed and throw loudly if it didn't.
 */
export async function ensureFunded(endpoint: string): Promise<void> {
  const TARGET = '0x56BC75E2D63100000' // 100 ETH in wei
  // Clear EOF code so Anvil treats the account as a plain EOA
  await rpcCall(endpoint, 'anvil_setCode', [DEFAULT_ACCOUNT, '0x'])
  await rpcCall(endpoint, 'anvil_setBalance', [DEFAULT_ACCOUNT, TARGET])
  const actual = (await rpcCall(endpoint, 'eth_getBalance', [
    DEFAULT_ACCOUNT,
    'latest',
  ])) as string
  if (BigInt(actual) < BigInt('0x16345785D8A0000') /* 0.1 ETH */) {
    throw new Error(
      `anvil_setBalance did not work — balance is ${actual} (hex). Try running fund-account.sh manually.`,
    )
  }

  if (!(await isController(endpoint, DEFAULT_ACCOUNT))) {
    // Read the LIVE registrar owner off the fork — it has been transferred on
    // Sepolia, so the hardcoded constant is only a fallback if the read fails.
    const registrarOwner =
      (await readRegistrarOwner(endpoint)) ?? V1_BASE_REGISTRAR_OWNER

    // Impersonate the BaseRegistrar owner to re-authorize DEFAULT_ACCOUNT as a controller
    await rpcCall(endpoint, 'anvil_impersonateAccount', [registrarOwner])
    try {
      await sendTxFrom(
        endpoint,
        registrarOwner,
        V1_BASE_REGISTRAR,
        encodeFunctionData({
          abi: baseRegistrarAddControllerSnippet,
          functionName: 'addController',
          args: [DEFAULT_ACCOUNT],
        }),
      )
    } finally {
      await rpcCall(endpoint, 'anvil_stopImpersonatingAccount', [
        registrarOwner,
      ])
    }

    // Anvil includes reverted impersonated txs without throwing, so verify the
    // grant actually landed rather than trusting the send. If it didn't, the
    // owner we impersonated is wrong for this fork — fail loudly instead of
    // silently registering phantom names later.
    if (!(await isController(endpoint, DEFAULT_ACCOUNT))) {
      throw new Error(
        `Failed to authorize ${DEFAULT_ACCOUNT} as a BaseRegistrar controller ` +
          `(impersonated owner ${registrarOwner}). The registrar owner on this ` +
          `fork may have changed again — check BaseRegistrar.owner().`,
      )
    }
  }

  // This must run even when the V1 controller grant already exists: Anvil and
  // the names cookie can survive a deployment-address update during HMR.
  await ensureV2MigrationControllerRoles(endpoint)
}

const ROOT_RESOURCE = 0n
const V2_ROLES_STORAGE_SLOT = 2n
const ROLE_REGISTER_RESERVED = 1n << 4n

const V2_ROOT_ROLES_SLOT = keccak256(
  encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [ROOT_RESOURCE, V2_ROLES_STORAGE_SLOT],
  ),
)

function v2ControllerRoleStorageSlot(account: Address): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [account, V2_ROOT_ROLES_SLOT],
    ),
  )
}

/** Ensure both migration controllers can register reserved names on the fork. */
async function ensureV2MigrationControllerRoles(
  endpoint: string,
): Promise<void> {
  for (const controller of V2_MIGRATION_CONTROLLERS) {
    const storageSlot = v2ControllerRoleStorageSlot(controller)
    const stored = await rpcCall(endpoint, 'eth_getStorageAt', [
      V2_ETH_REGISTRY_ADDR,
      storageSlot,
      'latest',
    ])
    if (typeof stored !== 'string' || !stored.startsWith('0x')) {
      throw new Error(
        `Unable to read V2 roles for migration controller ${controller}`,
      )
    }

    const roles = BigInt(stored)
    const rolesWithReservedRegistration = roles | ROLE_REGISTER_RESERVED
    if (rolesWithReservedRegistration === roles) continue

    await rpcCall(endpoint, 'anvil_setStorageAt', [
      V2_ETH_REGISTRY_ADDR,
      storageSlot,
      toHex(rolesWithReservedRegistration, { size: 32 }),
    ])
  }
}

/**
 * Create a RESERVED slot in the V2 ETH registry for a name by impersonating
 * the ETH_REGISTRAR account (which holds ROLE_REGISTRAR on the registry).
 * Skips silently if the slot is already reserved.
 * For grace-period names (expiryDate in the past), also skips — those slots
 * would immediately be AVAILABLE and migration controllers can't use them.
 */
export async function reserveInV2(
  endpoint: string,
  label: string,
  expiryDate: number,
): Promise<void> {
  const now = await getBlockTimestamp(endpoint)
  if (expiryDate <= now) return // expired slot = AVAILABLE, controllers can't migrate
  const currentStatus = await getV2NameStatus(endpoint, label)
  if (currentStatus === V2_NAME_STATUS.RESERVED) return
  if (currentStatus === V2_NAME_STATUS.REGISTERED) return
  if (currentStatus !== V2_NAME_STATUS.AVAILABLE) {
    throw new Error(`Unable to read the V2 registry status for ${label}.eth`)
  }

  await reserveKnownAvailableNameInV2(endpoint, label, expiryDate)
}

async function reserveKnownAvailableNameInV2(
  endpoint: string,
  label: string,
  expiryDate: number,
): Promise<void> {
  await rpcCall(endpoint, 'anvil_impersonateAccount', [V2_ETH_REGISTRAR_ADDR])
  try {
    const data = encodeFunctionData({
      abi: userRegistryRegisterSnippet,
      functionName: 'register',
      args: [
        label,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        V1_PUBLIC_RESOLVER,
        0n,
        BigInt(expiryDate),
      ],
    })
    await sendTxFrom(
      endpoint,
      V2_ETH_REGISTRAR_ADDR,
      V2_ETH_REGISTRY_ADDR,
      data,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      !msg.includes('LabelAlreadyReserved') &&
      !msg.includes('AlreadyRegistered')
    )
      throw err
  } finally {
    await rpcCall(endpoint, 'anvil_stopImpersonatingAccount', [
      V2_ETH_REGISTRAR_ADDR,
    ])
  }

  const updatedStatus = await getV2NameStatus(endpoint, label)
  if (
    updatedStatus !== V2_NAME_STATUS.RESERVED &&
    updatedStatus !== V2_NAME_STATUS.REGISTERED
  ) {
    throw new Error(
      `Failed to reserve ${label}.eth in the active V2 registry (status ${String(updatedStatus)})`,
    )
  }
}

/**
 * Top-level dispatch — creates the V1 name on Anvil, reserves it in V2,
 * and returns { label, expiryDate } for the active names list.
 */
/**
 * Lifecycle state to leave a newly-created name in.
 *
 * `grace` and `premium` are reached by ADVANCING THE FORK CLOCK, which is global — every
 * other name on the fork moves forward too. The advance is kept as small as the target
 * state allows (see `LIFECYCLE_DRIFT_DAYS`), but it is never zero.
 */
export type NameLifecycle = 'active' | 'grace' | 'premium'

/** V2 `ETHRegistrar.GRACE_PERIOD` — a name is only biddable once expiry + this has passed. */
export const V2_GRACE_PERIOD_SECONDS = 28 * 24 * 3600

/** How far into the premium window `premium` lands a name. ~$10k of a 21-day decay. */
export const PREMIUM_AGE_SECONDS = Math.round(13.3 * 24 * 3600)

/** Days of global clock drift each lifecycle costs — surfaced in the UI. */
export const LIFECYCLE_DRIFT_DAYS: Record<NameLifecycle, number> = {
  active: 0,
  grace: 3,
  premium: Math.round((V2_GRACE_PERIOD_SECONDS + PREMIUM_AGE_SECONDS) / 86_400),
}

export type CreateNameOptions = {
  /** Lifecycle state to leave the name in. Default `active`. */
  readonly lifecycle?: NameLifecycle
  /** Account that ends up holding the name. Defaults to account A. */
  readonly owner?: Address
  /**
   * V1 registry controller ("manager"), when it should differ from the registrant.
   *
   * Only meaningful for UNWRAPPED names: wrapping hands the registry node to the
   * NameWrapper, so a wrapped name has no separate manager. The app mirrors this split by
   * granting the manager `ROLE_SET_RESOLVER` in V2 (`classifyNames` → `managerAddress`).
   */
  readonly manager?: Address
  /** Also create `sub.<label>.eth` under the new name. */
  readonly withSubname?: boolean
  /** Point the name at a resolver and seed it with text + address records. */
  readonly withRecords?: boolean
  /**
   * Set this name as the owner's V1 primary (reverse) name.
   *
   * Implies `withRecords`, because a primary only verifies when forward resolution returns
   * the same address — without the ETH address record the reverse record points at a name
   * that resolves to nothing.
   */
  readonly withPrimary?: boolean
}

export type CreatedName = {
  label: string
  expiryDate: number
  ownerFuses?: number
  hasRecords?: boolean
  subnameLabel?: string
  subnameWrapped?: boolean
  ownerAddress: string
  managerAddress?: string
  isPrimary?: boolean
}

export async function createV1NameOnAnvil(
  endpoint: string,
  label: string,
  type: PresetType,
  /** Owner-controlled fuse bitmap — only used by the `custom` preset. */
  customFuses = 0,
  options: CreateNameOptions = {},
): Promise<CreatedName> {
  const base = await createBaseName(endpoint, label, type, customFuses, options)
  // `custom` weaves the extras into its own fuse ordering (records before the resolver is
  // pinned, subname before subdomains are closed off). Every other preset burns its fuses
  // up front, so the extras are applied here afterwards instead.
  if (type === 'custom') return base
  return applyExtras(endpoint, base, type, options)
}

/**
 * Add subname / records / primary to a name a preset has already built.
 *
 * Each of these is blocked by a fuse the preset may have burned, so check first and say
 * which one rather than letting the write revert with a bare `OperationProhibited`.
 */
async function applyExtras(
  endpoint: string,
  base: CreatedName,
  type: PresetType,
  options: CreateNameOptions,
): Promise<CreatedName> {
  const wantsSubname = options.withSubname === true
  const wantsRecords =
    options.withRecords === true || options.withPrimary === true
  const wantsPrimary = options.withPrimary === true
  if (!wantsSubname && !wantsRecords) return base

  const owner = (base.ownerAddress ?? DEFAULT_ACCOUNT) as Address
  const presetFuses = PRESET_OWNER_FUSES[type] ?? 0

  if (wantsSubname && (presetFuses & CANNOT_CREATE_SUBDOMAIN) !== 0) {
    throw new Error(
      `"${type}" burns CANNOT_CREATE_SUBDOMAIN, so it cannot have a subname. Use the custom builder, or drop the subname option.`,
    )
  }
  if (wantsRecords && (presetFuses & CANNOT_SET_RESOLVER) !== 0) {
    throw new Error(
      `"${type}" burns CANNOT_SET_RESOLVER, so no resolver can be attached and records (or a primary) cannot be seeded.`,
    )
  }

  let result = base
  if (wantsRecords) {
    const isWrapped =
      type !== 'unwrapped' && type !== 'grace-renewable-unwrapped'
    await seedNameRecords(
      endpoint,
      base.label,
      owner,
      isWrapped,
      base.managerAddress as Address | undefined,
    )
    result = { ...result, hasRecords: true }
  }
  if (wantsSubname) {
    await createChildSubname(
      endpoint,
      base.label,
      SUBNAME_LABEL,
      presetFuses,
      owner,
      type !== 'unwrapped' && type !== 'grace-renewable-unwrapped',
    )
    result = {
      ...result,
      subnameLabel: SUBNAME_LABEL,
      subnameWrapped:
        type !== 'unwrapped' && type !== 'grace-renewable-unwrapped',
    }
  }
  if (wantsPrimary) {
    await setV1PrimaryName(endpoint, `${base.label}.eth`, owner)
    result = { ...result, isPrimary: true }
  }
  return result
}

/** Owner-controlled fuses each preset burns — used to reject impossible extras up front. */
const PRESET_OWNER_FUSES: Partial<Record<PresetType, number>> = {
  unwrapped: 0,
  wrapped: 0,
  locked: CANNOT_UNWRAP,
  'locked-all': ALL_CHILD_FUSES,
  grace: CANNOT_UNWRAP,
  'grace-renewable-wrapped': CANNOT_UNWRAP,
  'grace-renewable-unwrapped': 0,
  emancipated: CANNOT_UNWRAP,
  'frozen-approval': CANNOT_UNWRAP | CANNOT_APPROVE,
}

async function createBaseName(
  endpoint: string,
  label: string,
  type: PresetType,
  customFuses: number,
  options: CreateNameOptions,
): Promise<CreatedName> {
  await ensureFunded(endpoint)
  const owner = options.owner ?? DEFAULT_ACCOUNT
  switch (type) {
    case 'custom': {
      const invalid = invalidFuseCombination(customFuses, options)
      if (invalid) throw new Error(invalid.reason)
      await registerV1Name(endpoint, label, true, owner)

      // Order matters, and every step here is gated by a fuse burned later:
      //   1. CANNOT_UNWRAP first — a child may only be emancipated under a locked parent.
      //   2. Records before CANNOT_SET_RESOLVER pins the resolver.
      //   3. Subname before CANNOT_CREATE_SUBDOMAIN closes the door.
      //   4. Everything else last, in one call, so CANNOT_BURN_FUSES cannot freeze the
      //      rest of the bitmap out before it is applied.
      if ((customFuses & CANNOT_UNWRAP) !== 0) {
        await setNameFuses(endpoint, label, CANNOT_UNWRAP, owner)
      }
      if (options.withRecords || options.withPrimary) {
        await seedNameRecords(endpoint, label, owner)
      }
      if (options.withPrimary)
        await setV1PrimaryName(endpoint, `${label}.eth`, owner)
      if (options.withSubname) {
        await createChildSubname(
          endpoint,
          label,
          SUBNAME_LABEL,
          customFuses,
          owner,
        )
      }
      if (customFuses !== 0)
        await setNameFuses(endpoint, label, customFuses, owner)

      const lifecycle = options.lifecycle ?? 'active'
      const ts = await getBlockTimestamp(endpoint)

      if (lifecycle === 'active') {
        const expiryDate = ts + ONE_YEAR
        await reserveInV2(endpoint, label, expiryDate)
        return {
          label,
          expiryDate,
          ownerFuses: customFuses,
          ownerAddress: owner,
          ...(options.withRecords || options.withPrimary
            ? { hasRecords: true }
            : {}),
          ...(options.withPrimary ? { isPrimary: true } : {}),
          ...(options.withSubname
            ? { subnameLabel: SUBNAME_LABEL, subnameWrapped: true }
            : {}),
        }
      }

      // Reserve with a deliberately short window, then advance past it. Registering with
      // a long duration and warping a year forward (what the fixed `grace` presets do)
      // drags every other name on the fork with it.
      const shortWindow = 600
      const expiryDate = ts + shortWindow
      // The premigration bonus keeps a name renewable throughout v1 grace, which is the
      // point of `grace` — but for `premium` it just delays the reservation lapsing and
      // adds ~62 days of pointless clock drift, so only `grace` gets it.
      await reserveInV2(
        endpoint,
        label,
        lifecycle === 'grace'
          ? expiryDate + PREMIGRATION_BONUS_PERIOD
          : expiryDate,
      )

      // grace: past the v1 expiry but still inside the v2 reservation → renewable.
      // premium: past expiry + v2 GRACE_PERIOD, i.e. biddable, priced on a 21-day decay
      //          (`ETHRegistrar._availablePeriod`).
      const advance =
        lifecycle === 'grace'
          ? shortWindow + LIFECYCLE_DRIFT_DAYS.grace * 86_400
          : shortWindow + V2_GRACE_PERIOD_SECONDS + PREMIUM_AGE_SECONDS
      await increaseTime(endpoint, advance)

      return {
        label,
        expiryDate,
        ownerFuses: customFuses,
        ownerAddress: owner,
        ...(options.withRecords || options.withPrimary
          ? { hasRecords: true }
          : {}),
        ...(options.withPrimary ? { isPrimary: true } : {}),
        ...(options.withSubname
          ? { subnameLabel: SUBNAME_LABEL, subnameWrapped: true }
          : {}),
      }
    }
    case 'frozen-approval': {
      // Order matters: the approval must exist BEFORE CANNOT_APPROVE is burned. That is
      // the only way to reach a permanently-pinned approval, which is what makes the
      // migration controller reject the token with FrozenTokenApproval.
      await registerV1Name(endpoint, label, true, owner)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP, owner)
      await approveNameWrapperToken(
        endpoint,
        label,
        FROZEN_APPROVAL_SPENDER,
        owner,
      )
      await setNameFuses(endpoint, label, CANNOT_UNWRAP | CANNOT_APPROVE, owner)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return {
        label,
        expiryDate,
        ownerFuses: CANNOT_UNWRAP | CANNOT_APPROVE,
        ownerAddress: owner,
      }
    }
    case 'unwrapped': {
      await registerV1Name(endpoint, label, false, owner, options.manager)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'wrapped': {
      await registerV1Name(endpoint, label, true, owner)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'locked': {
      await registerV1Name(endpoint, label, true, owner)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP, owner)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'locked-all': {
      await registerV1Name(endpoint, label, true, owner)
      await setNameFuses(endpoint, label, ALL_CHILD_FUSES, owner)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'grace': {
      await registerV1Name(endpoint, label, true, owner)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP, owner)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts
      await increaseTime(endpoint, ONE_YEAR + 45 * 86_400)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'grace-renewable-wrapped': {
      // Like `grace` (v1 name pushed 45 days into its 90-day grace window), but
      // the v2 slot is RESERVED with an expiry that OUTLASTS the v1 expiry.
      // `ETHRenewerV1.isRenewable` gates on the v2 reservation, not the v1 grace
      // clock, so this is the only state that is BOTH in-grace AND renewable.
      // WRAPPED variant: renewal extends the BaseRegistrar but NOT the
      // NameWrapper's stored expiry, so after renewal the ERC-1155 token stays
      // expired and migration reverts (ERC1155 insufficient balance) — use this
      // to reproduce that; use the unwrapped variant for the migrate happy-path.
      await registerV1Name(endpoint, label, true, owner)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP, owner)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR // true v1 expiry (in the past after the advance below)
      // Reserve at v1 expiry + bonus, exactly as production pre-migration does, so
      // the renewable window is the real 90 days (not indefinite).
      await reserveInV2(endpoint, label, expiryDate + PREMIGRATION_BONUS_PERIOD)
      await increaseTime(endpoint, ONE_YEAR + 45 * 86_400)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'grace-renewable-unwrapped': {
      // Unwrapped counterpart of `grace-renewable-wrapped`: renewable in grace
      // (v2 reservation outlasts the v1 expiry) but held directly as the ERC-721
      // in the BaseRegistrar — so renewal revives the same token migration
      // transfers, and renew→migrate completes end-to-end.
      await registerV1Name(endpoint, label, false, owner, options.manager)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      // Reserve at v1 expiry + bonus, matching production pre-migration.
      await reserveInV2(endpoint, label, expiryDate + PREMIGRATION_BONUS_PERIOD)
      await increaseTime(endpoint, ONE_YEAR + 45 * 86_400)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
    case 'emancipated': {
      const sublabel = `sub-${label}`
      await registerV1Name(endpoint, label, true, owner)
      await setNameFuses(endpoint, label, CANNOT_UNWRAP, owner)
      await createEmancipatedSubname(endpoint, label, sublabel)
      const ts = await getBlockTimestamp(endpoint)
      const expiryDate = ts + ONE_YEAR
      await reserveInV2(endpoint, label, expiryDate)
      return {
        label,
        expiryDate,
        ownerAddress: owner,
        ...(options.manager ? { managerAddress: options.manager } : {}),
      }
    }
  }
}

// --- Subgraph mock ----------------------------------------------------------

/**
 * Build a minimal V1 subgraph domain object for a panel-created name.
 * Injected into getNamesForAddress responses so the migration UI finds the name.
 */
export function buildMockDomain(name: ActiveName): unknown {
  const lh = labelhash(name.label)
  const node = namehashFromLabelAndParent(lh, ETH_NODE)
  const isWrapped =
    name.type !== 'unwrapped' && name.type !== 'grace-renewable-unwrapped'
  const owner = (name.ownerAddress ?? DEFAULT_ACCOUNT).toLowerCase()
  // Registry controller. For a wrapped name that is the NameWrapper; for an unwrapped one
  // it is the manager when the V1 registrant/manager split is in play, else the registrant.
  const registryOwner = isWrapped
    ? V1_NAME_WRAPPER.toLowerCase()
    : (name.managerAddress ?? owner).toLowerCase()
  const now = Math.floor(Date.now() / 1000)

  // The wrapper always adds these two when wrapping a `.eth` 2LD.
  let fuses = PARENT_CANNOT_CONTROL | IS_DOT_ETH
  if (name.ownerFuses !== undefined) {
    // Explicit bitmap (custom / frozen-approval) — report exactly what was burned on
    // chain. Deriving it from `type` here would let the mock disagree with the wrapper.
    fuses |= name.ownerFuses
  } else {
    if (name.type !== 'unwrapped' && name.type !== 'wrapped')
      fuses |= CANNOT_UNWRAP
    if (name.type === 'locked-all') fuses |= ALL_CHILD_FUSES
  }

  return {
    id: node,
    labelName: name.label,
    labelhash: lh,
    name: `${name.label}.eth`,
    isMigrated: false,
    createdAt: String(now - 3600),
    resolvedAddress: null,
    // Panel-created names are wrapped with a ZERO resolver (see `registerV1Name`), so
    // report no resolver. Claiming one here is not cosmetic: the app reads this field as
    // `v1ResolverAddress`, and `resolverStrategyFor` keeps any resolver that is not in
    // `KNOWN_PUBLIC_RESOLVERS` ('keep-v1') so it never strands records on a custom
    // resolver. Advertising a resolver the name does not actually have therefore made
    // migration carry a V1-era resolver into V2 — and a V1 resolver authorises writes
    // against V1 ownership, which post-migration is the graveyard. The name resolved but
    // every record write reverted, permanently.
    // Only names seeded with records actually have a resolver on chain; everything else
    // is wrapped with ZERO (see `registerV1Name`). `V1_RECORDS_RESOLVER` is allowlisted,
    // so migration moves the records onto an owned V2 resolver rather than keeping V1.
    resolver: name.hasRecords
      ? { id: V1_RECORDS_RESOLVER, address: V1_RECORDS_RESOLVER }
      : null,
    owner: { id: registryOwner },
    registrant: { id: owner },
    wrappedOwner: isWrapped ? { id: owner } : null,
    parent: { name: 'eth', id: ETH_NODE, wrappedDomain: null },
    registration: {
      registrationDate: String(now - 3600),
      expiryDate: String(name.expiryDate),
    },
    wrappedDomain: isWrapped
      ? { expiryDate: String(name.expiryDate), fuses }
      : null,
  }
}

/**
 * Build the subgraph domain for a name's SUBNAME, or null when it has none.
 *
 * The child is a domain in its own right, and the app only ever offers to migrate names it
 * sees in `getNamesForAddress`. Emitting just the 2LD meant a panel-created child could
 * never be migrated: the parent would move to V2 and the child would sit in V1, invisible.
 *
 * `parent.wrappedDomain.fuses` matters — `classifyName` reads the PARENT's fuses to decide
 * whether an unlocked child is a migratable `detached-child` or an ineligible
 * `unlocked-subname`.
 */
export function buildMockSubnameDomain(name: ActiveName): unknown | null {
  if (!name.subnameLabel) return null
  const parentLh = labelhash(name.label)
  const parentNode = namehashFromLabelAndParent(parentLh, ETH_NODE)
  const subLh = labelhash(name.subnameLabel)
  const subNode = namehashFromLabelAndParent(subLh, parentNode)
  const owner = (
    name.subnameOwner ??
    name.ownerAddress ??
    DEFAULT_ACCOUNT
  ).toLowerCase()
  // `ownerFuses` is only recorded for the custom builder; every other preset burns a
  // fixed set, so fall back to that. Getting this wrong made a child of a LOCKED parent
  // report an unlocked parent, which classifies as ineligible `unlocked-subname` instead
  // of a migratable `locked-child`.
  const parentOwnerFuses = name.ownerFuses ?? PRESET_OWNER_FUSES[name.type] ?? 0
  const parentFuses = parentOwnerFuses | PARENT_CANNOT_CONTROL | IS_DOT_ETH
  const parentIsWrapped =
    name.type !== 'unwrapped' && name.type !== 'grace-renewable-unwrapped'
  const isWrapped = name.subnameWrapped ?? parentIsWrapped
  // Mirrors `createChildSubname`: emancipated under a locked parent, plain otherwise.
  const childFuses =
    (parentFuses & CANNOT_UNWRAP) !== 0
      ? PARENT_CANNOT_CONTROL | CANNOT_UNWRAP
      : 0

  return {
    id: subNode,
    labelName: name.subnameLabel,
    labelhash: subLh,
    name: `${name.subnameLabel}.${name.label}.eth`,
    isMigrated: false,
    createdAt: String(Math.floor(Date.now() / 1000) - 3600),
    resolvedAddress: null,
    resolver: {
      id: V1_RECORDS_RESOLVER,
      address: V1_RECORDS_RESOLVER,
    },
    // A registry-only child is owned by its holder directly; a wrapped one by the
    // NameWrapper, with the holder in `wrappedOwner`.
    owner: { id: isWrapped ? V1_NAME_WRAPPER.toLowerCase() : owner },
    registrant: null,
    wrappedOwner: isWrapped ? { id: owner } : null,
    parent: {
      name: `${name.label}.eth`,
      id: parentNode,
      // Only report a wrapped parent — an unwrapped 2LD has no wrapper entry, and
      // `classifyName` reads this to decide whether a child can be a `detached-child`.
      wrappedDomain: parentIsWrapped ? { fuses: parentFuses } : null,
    },
    // Subnames have no BaseRegistrar registration — only 2LDs do.
    registration: null,
    wrappedDomain: isWrapped
      ? { expiryDate: String(name.expiryDate), fuses: childFuses }
      : null,
  }
}

// --- Anvil on-chain sync helpers --------------------------------------------

const V2_NAME_STATUS = {
  AVAILABLE: 0,
  RESERVED: 1,
  REGISTERED: 2,
} as const

const V2_GET_STATUS_ABI = [
  {
    type: 'function',
    name: 'getStatus',
    stateMutability: 'view',
    inputs: [{ name: 'anyId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

function baseRegistrarReadCall(
  selector: `0x${string}`,
  label: string,
): RpcReadCall {
  const tokenIdPadded = labelhash(label).slice(2).padStart(64, '0')
  return {
    method: 'eth_call',
    params: [
      { to: V1_BASE_REGISTRAR, data: `${selector}${tokenIdPadded}` },
      'latest',
    ],
  }
}

function v2StatusReadCall(label: string): RpcReadCall {
  return {
    method: 'eth_call',
    params: [
      {
        to: V2_ETH_REGISTRY_ADDR,
        data: encodeFunctionData({
          abi: V2_GET_STATUS_ABI,
          functionName: 'getStatus',
          args: [BigInt(labelhash(label))],
        }),
      },
      'latest',
    ],
  }
}

function decodeV2NameStatus(result: unknown): number | null {
  try {
    if (typeof result !== 'string' || result === '0x') return null
    return Number(BigInt(result))
  } catch {
    return null
  }
}

async function getV2NameStatuses(
  endpoint: string,
  labels: readonly string[],
): Promise<(number | null)[]> {
  const results = await rpcReadBatch(
    endpoint,
    labels.map((label) => v2StatusReadCall(label)),
  )
  return results.map(decodeV2NameStatus)
}

async function getV2NameStatus(
  endpoint: string,
  label: string,
): Promise<number | null> {
  return (await getV2NameStatuses(endpoint, [label]))[0] ?? null
}

/**
 * Returns true if the .eth label is registered in the official BaseRegistrar on
 * the Anvil fork (ownerOf returns a non-zero address). This is the same
 * contract preflightChecks.ts uses for eligibility, so alignment is critical.
 */
export async function isNameOnAnvil(
  endpoint: string,
  label: string,
): Promise<boolean> {
  return (await getNamesOnAnvil(endpoint, [label]))[0] ?? false
}

/** Read V1 registration existence in bounded JSON-RPC batches. */
export async function getNamesOnAnvil(
  endpoint: string,
  labels: readonly string[],
): Promise<boolean[]> {
  const results = await rpcReadBatch(
    endpoint,
    labels.map((label) => baseRegistrarReadCall('0x6352211e', label)),
  )
  return results.map(
    (result) =>
      typeof result === 'string' && result.length > 2 && result !== '0x',
  )
}

/**
 * Live BaseRegistrar expiry (unix seconds) for a .eth label on the Anvil fork,
 * or null if unregistered/unreadable. The panel stores each name's expiryDate at
 * creation, which goes STALE after an in-app renewal (or time-travel) — and the
 * subgraph mock feeds `registration.expiryDate` into migration eligibility
 * (`classifyName` → `hasExpiredDotEthRegistration`). Reading it live keeps the
 * mock in step with on-chain state so a renewed grace name correctly becomes
 * migratable instead of staying classified `expired-registration`.
 */
export async function getOnchainExpiry(
  endpoint: string,
  label: string,
): Promise<number | null> {
  return (await getOnchainExpiries(endpoint, [label]))[0] ?? null
}

/** Read live BaseRegistrar expiries in bounded JSON-RPC batches. */
export async function getOnchainExpiries(
  endpoint: string,
  labels: readonly string[],
): Promise<(number | null)[]> {
  const results = await rpcReadBatch(
    endpoint,
    labels.map((label) => baseRegistrarReadCall('0xd6e4fa86', label)),
  )
  return results.map((result) => {
    try {
      if (typeof result !== 'string' || result === '0x') return null
      const expiry = Number(BigInt(result))
      return expiry > 0 ? expiry : null
    } catch {
      return null
    }
  })
}

function fixtureReservationExpiry(name: ActiveName): number | null {
  if (name.type === 'grace') return null
  if (
    name.type === 'grace-renewable-wrapped' ||
    name.type === 'grace-renewable-unwrapped'
  ) {
    return name.expiryDate + PREMIGRATION_BONUS_PERIOD
  }
  return name.expiryDate
}

interface ExistingFixtureReservation {
  readonly nameIndex: number
  readonly label: string
  readonly expiryDate: number
}

async function getExistingFixtureReservationStatuses(
  endpoint: string,
  names: readonly ActiveName[],
  existingNames: readonly boolean[],
): Promise<
  Map<number, ExistingFixtureReservation & { readonly status: number | null }>
> {
  const candidates = names.flatMap((name, nameIndex) => {
    if (!existingNames[nameIndex]) return []
    const expiryDate = fixtureReservationExpiry(name)
    return expiryDate == null
      ? []
      : [{ nameIndex, label: name.label, expiryDate }]
  })
  if (candidates.length === 0) return new Map()

  const now = await getBlockTimestamp(endpoint)
  const activeCandidates = candidates.filter(
    ({ expiryDate }) => expiryDate > now,
  )
  const statuses = await getV2NameStatuses(
    endpoint,
    activeCandidates.map(({ label }) => label),
  )

  return new Map(
    activeCandidates.map((candidate, index) => [
      candidate.nameIndex,
      { ...candidate, status: statuses[index] ?? null },
    ]),
  )
}

async function ensureExistingFixtureReservation(
  endpoint: string,
  reservation: ExistingFixtureReservation & { readonly status: number | null },
): Promise<void> {
  if (reservation.status === V2_NAME_STATUS.RESERVED) return
  if (reservation.status === V2_NAME_STATUS.REGISTERED) return
  if (reservation.status !== V2_NAME_STATUS.AVAILABLE) {
    throw new Error(
      `Unable to read the V2 registry status for ${reservation.label}.eth`,
    )
  }
  await reserveKnownAvailableNameInV2(
    endpoint,
    reservation.label,
    reservation.expiryDate,
  )
}

/**
 * For any active names missing from the Anvil fork (fork was reset), re-create
 * them and return an updated list with fresh expiryDates.
 */
export async function ensureNamesOnAnvil(
  endpoint: string,
  names: ActiveName[],
): Promise<ActiveName[]> {
  const result: ActiveName[] = []
  const existingNames = await getNamesOnAnvil(
    endpoint,
    names.map((name) => name.label),
  )

  if (existingNames.some(Boolean))
    await ensureV2MigrationControllerRoles(endpoint)

  const existingReservations = await getExistingFixtureReservationStatuses(
    endpoint,
    names,
    existingNames,
  )

  for (const [index, name] of names.entries()) {
    const exists = existingNames[index] ?? false
    if (exists) {
      const reservation = existingReservations.get(index)
      if (reservation)
        await ensureExistingFixtureReservation(endpoint, reservation)
      result.push(name)
    } else {
      const { label, expiryDate } = await createV1NameOnAnvil(
        endpoint,
        name.label,
        name.type,
      )
      result.push({ ...name, label, expiryDate })
    }
  }
  return result
}

// --- localStorage helpers ---------------------------------------------------

// Panel-created names are persisted in a COOKIE rather than localStorage so the
// list is shared across the portal (:3001) and manager (:3000) dev servers —
// cookies are scoped by host, not port, whereas localStorage is per-origin.
// This lets the subgraph mock in one app inject names created in the other,
// which is required for the manager migration list to see portal-created names.
// Cookie-safe name (no colons — those are separators the cookie grammar
// disallows in a name, even though some browsers tolerate them).
const NAMES_COOKIE_NAME = 'ens_migration_tool_v1_names'
const NAMES_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function readNamesCookie(): string | null {
  const prefix = `${NAMES_COOKIE_NAME}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix))
      return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}

export function readStoredNames(): ActiveName[] {
  try {
    const raw = readNamesCookie()
    if (!raw) return []
    return JSON.parse(raw) as ActiveName[]
  } catch {
    return []
  }
}

export function writeStoredNames(names: ActiveName[]): void {
  try {
    // No domain attribute → defaults to the current host (localhost), shared
    // across ports. SameSite=Lax keeps it same-site only.
    const value = encodeURIComponent(JSON.stringify(names))
    document.cookie = `${NAMES_COOKIE_NAME}=${value}; path=/; max-age=${NAMES_COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    /* storage disabled */
  }
}

export function readStoredPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Pos>
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return { left: parsed.left, top: parsed.top }
    }
    return null
  } catch {
    return null
  }
}

export function clampPos(pos: Pos, el: HTMLElement | null): Pos {
  if (typeof window === 'undefined') return pos
  const width = el?.offsetWidth ?? 280
  const height = el?.offsetHeight ?? 320
  const maxLeft = Math.max(4, window.innerWidth - width - 4)
  const maxTop = Math.max(4, window.innerHeight - height - 4)
  return {
    left: Math.min(Math.max(4, pos.left), maxLeft),
    top: Math.min(Math.max(4, pos.top), maxTop),
  }
}
