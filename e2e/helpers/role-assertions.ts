/**
 * Role oracles for V2 names — plan item H1.
 *
 * Every §5.C/§5.D/§5.E scenario decides pass/fail on "who holds which role",
 * so this module is the single place that answers it. Reads go through the
 * same ensjs actions the apps use (`getNameRolesForAccount`, `hasRoles`,
 * `getNameRoleAccounts`) and writes through the same
 * `grantRolesWriteParameters` the portal's own grant flow builds, so a test
 * and the UI it exercises cannot disagree about what a role bitmap means.
 *
 * **Do not hand-roll role constants.** V2 roles are nybble-packed — each role
 * owns 4 bits and its admin counterpart sits 128 bits higher
 * (`RegistryRolesLib.sol`), so writing `1n << 3n` for the fourth role produces
 * a value that silently lands in a different role's nybble. ensjs mirrors the
 * Solidity exactly; `Role` below is its type.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  getNameRoleAccounts,
  getNameRolesForAccount,
  hasRoles,
} from '@ensdomains/ensjs/public/v2'
import { labelToCanonicalId, type Role } from '@ensdomains/ensjs/utils/v2'
import {
  grantRolesWriteParameters,
  revokeRolesWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import { expect } from '@playwright/test'
import {
  type Account,
  type Address,
  createWalletClient,
  encodeFunctionData,
  http,
} from 'viem'
import { publicClient } from './anvil-client.js'

const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

/** The `.eth` PermissionedRegistry — where a 2LD's roles live. */
export const ETH_REGISTRY = ensjsSepolia.ensRegistry.address

export type { Role }

export interface RoleTarget {
  /** Label without `.eth`. */
  label: string
  /** Defaults to the `.eth` registry. Pass a subregistry for 3LD+ roles. */
  registryAddress?: Address
}

function signerClient(account: Account) {
  return createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(ANVIL_RPC_URL),
  })
}

const sorted = (roles: readonly string[]) =>
  [...roles].sort((a, b) => a.localeCompare(b))

// ── reads ────────────────────────────────────────────────────────────────

/**
 * The roles `account` holds on `label`, as both the decoded name list and the
 * raw bitmap. Every assertion below is built on this read.
 */
export async function readNameRoles(
  { label, registryAddress = ETH_REGISTRY }: RoleTarget,
  account: Address,
): Promise<{ decoded: Role[]; raw: bigint }> {
  const result = await getNameRolesForAccount(
    publicClient as never,
    {
      registryAddress,
      label,
      account,
    } as never,
  )
  return result as { decoded: Role[]; raw: bigint }
}

/** Whether `account` holds every role in `roles` on `label`. */
export async function accountHasRoles(
  { label, registryAddress = ETH_REGISTRY }: RoleTarget,
  account: Address,
  roles: Role[],
): Promise<boolean> {
  return (await hasRoles(
    publicClient as never,
    {
      registryAddress,
      label,
      roles,
      account,
    } as never,
  )) as boolean
}

/**
 * Every account that holds any role on `label`, mapped to its roles — the
 * on-chain counterpart of the portal's roles *table* (C1).
 *
 * Reconstructed from grant/revoke logs by ensjs, so it needs the full history
 * to be reachable: on the Anvil fork that is true, but do not call it against
 * a pruned node.
 */
export async function readRoleHolders({
  label,
  registryAddress = ETH_REGISTRY,
}: RoleTarget): Promise<Map<Address, string[]>> {
  const result = await getNameRoleAccounts(
    publicClient as never,
    {
      registryAddress,
      label,
    } as never,
  )
  return result as Map<Address, string[]>
}

// ── assertions ───────────────────────────────────────────────────────────

/**
 * The universal role oracle of plan §3.3 in its strictest form: `account`
 * holds **exactly** `expected` on `label` — no more, no less.
 *
 * Prefer this over {@link assertHasRoles} wherever the plan states a complete
 * role set (the V1 fuse → V2 mapping of §3.4, post-migration bitmaps,
 * post-transfer bitmaps). A subset check cannot catch an over-grant, and an
 * over-grant is the failure that matters — it hands someone authority the
 * contract never meant them to have.
 */
export async function assertRoleBitmap(
  target: RoleTarget,
  account: Address,
  expected: Role[],
): Promise<void> {
  const { decoded } = await readNameRoles(target, account)
  const actualSet = sorted(decoded)
  const expectedSet = sorted(expected)
  const missing = expectedSet.filter((r) => !actualSet.includes(r))
  const extra = actualSet.filter((r) => !expectedSet.includes(r))

  expect(
    actualSet,
    `Role bitmap mismatch for ${account} on ${target.label}.eth\n` +
      `  missing:    ${missing.length > 0 ? missing.join(', ') : '(none)'}\n` +
      `  unexpected: ${extra.length > 0 ? extra.join(', ') : '(none)'}`,
  ).toEqual(expectedSet)
}

/** `account` holds at least `roles` on `label`. */
export async function assertHasRoles(
  target: RoleTarget,
  account: Address,
  roles: Role[],
): Promise<void> {
  const { decoded } = await readNameRoles(target, account)
  const missing = roles.filter((r) => !decoded.includes(r))
  expect(
    missing,
    `${account} is missing ${missing.join(', ')} on ${target.label}.eth ` +
      `(holds: ${decoded.join(', ') || 'nothing'})`,
  ).toEqual([])
}

/** `account` holds none of `roles` on `label`. */
export async function assertLacksRoles(
  target: RoleTarget,
  account: Address,
  roles: Role[],
): Promise<void> {
  const { decoded } = await readNameRoles(target, account)
  const present = roles.filter((r) => decoded.includes(r))
  expect(
    present,
    `${account} unexpectedly holds ${present.join(', ')} on ${target.label}.eth`,
  ).toEqual([])
}

// ── writes (setup, not assertions) ───────────────────────────────────────

/**
 * Grant `roles` on `label` to `account`, signed by `signer`.
 *
 * This is a *setup* primitive — use it to build the precondition a scenario
 * needs, never to make an assertion pass. A test that grants itself the role
 * the UI was supposed to grant is testing nothing.
 */
export async function grantNameRoles(
  { label, registryAddress = ETH_REGISTRY }: RoleTarget,
  account: Address,
  roles: Role[],
  signer: Account,
): Promise<void> {
  await sendRoleTx(
    grantRolesWriteParameters,
    { label, registryAddress },
    account,
    roles,
    signer,
  )
}

/** Revoke `roles` on `label` from `account`, signed by `signer`. */
export async function revokeNameRoles(
  { label, registryAddress = ETH_REGISTRY }: RoleTarget,
  account: Address,
  roles: Role[],
  signer: Account,
): Promise<void> {
  await sendRoleTx(
    revokeRolesWriteParameters,
    { label, registryAddress },
    account,
    roles,
    signer,
  )
}

/**
 * Grant and revoke differ only in which params builder they call — both
 * resolve the name to its canonical resource id the same way the portal's
 * `grantRoles`/`revokeRoles` helpers do.
 */
async function sendRoleTx(
  buildParams:
    | typeof grantRolesWriteParameters
    | typeof revokeRolesWriteParameters,
  { label, registryAddress }: Required<RoleTarget>,
  account: Address,
  roles: Role[],
  signer: Account,
): Promise<void> {
  const client = signerClient(signer)
  const params = buildParams(client as never, {
    registryAddress,
    account,
    resource: labelToCanonicalId(label),
    roles,
  })
  const hash = await client.sendTransaction({
    account: signer,
    to: registryAddress,
    data: encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as never,
    } as never),
    chain: publicClient.chain,
  })
  await publicClient.waitForTransactionReceipt({ hash })
}
