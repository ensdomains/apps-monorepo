/**
 * makeMigratedName fixture — creates a **V1 name that has been migrated to V2**,
 * the state a large share of real names are in.
 *
 * Unlike the manager's `migration.spec.ts`, which drives the migration through
 * the UI, this registers the V1 name and then calls the real
 * `MigrationHelper.migrate` entrypoint directly on the Anvil fork. That keeps
 * portal tests (which have no migration UI) fast and independent of the manager
 * app, while still producing genuinely migrated on-chain state rather than a
 * hand-faked approximation.
 *
 * All contract addresses come from the ensjs Sepolia chain config — the same
 * source the apps use (`apps/manager/.../migration/contracts/addresses.ts`).
 * `fixtures/makeV1Name.ts` hardcodes an older deployment's V2 registry, so it
 * is deliberately NOT reused here.
 *
 * ## What the three V1 token types become in V2
 *
 * Measured with `scripts/probe-migrated.ts`:
 *
 * | V1 type    | resolver       | subregistry | CAN_TRANSFER_ADMIN | SET_SUBREGISTRY |
 * |------------|----------------|-------------|--------------------|-----------------|
 * | unwrapped  | PublicResolver | `0x0`       | yes                | yes             |
 * | unlocked   | PublicResolver | `0x0`       | yes                | yes             |
 * | locked     | PublicResolver | non-zero    | yes                | **no**          |
 *
 * The locked row is why the transfer tests care: a migrated locked name has a
 * subregistry but its owner cannot execute `setSubregistry` on it. The transfer
 * form must therefore NOT offer "Detach the registry" for such a name — it gates
 * each option on holding the matching role, not merely on there being a target
 * (WEB-446). Offering it was a real bug: the detach steps run before the token
 * moves, so the revert left the resolver detached and the name un-transferred.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { registrySetApprovalForAllSnippet } from '@ensdomains/ensjs-abi/registry'
import {
  baseRegistrarAddControllerSnippet,
  baseRegistrarControllersSnippet,
  baseRegistrarOwnerSnippet,
  baseRegistrarRegisterSnippet,
} from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import {
  nameWrapperSetFusesSnippet,
  nameWrapperWrapEth2ldSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { migrationHelperMigrateSnippet } from '@ensdomains/ensjs-abi/v2/migrationHelper'
import { userRegistryRegisterSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  encodeFunctionData,
  type Hash,
  keccak256,
  namehash,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import type { User } from '../helpers/portal-auth.js'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

const BASE_REGISTRAR = ensjsSepolia.ensBaseRegistrarImplementation.address
const NAME_WRAPPER = ensjsSepolia.ensNameWrapper.address
const V2_REGISTRY = ensjsSepolia.ensRegistry.address
const V2_REGISTRAR = ensjsSepolia.ensEthRegistrar.address
const MIGRATION_HELPER = ensjsSepolia.ensMigrationHelper.address
/** V2 PublicResolver — what `LockedMigrationController.PUBLIC_RESOLVER()` writes. */
const V2_PUBLIC_RESOLVER = ensjsSepolia.ensPublicResolver.address

const ONE_YEAR = 365 * 24 * 60 * 60
const ETH_NODE = namehash('eth')

/** NameWrapper owner-controlled fuse: the name can no longer be unwrapped. */
const CANNOT_UNWRAP = 1

// `setApprovalForAll` is the standard ERC-721/1155 method and encodes
// identically on the BaseRegistrar and the NameWrapper, so one snippet covers
// both — same reasoning as the dev migration tool's helpers.

/** How the V1 name was held before migration. */
export type MigratedNameType = 'unwrapped' | 'unlocked' | 'locked'

export type MigratedNameConfig = {
  /** Label without `.eth`; a timestamp suffix is appended for uniqueness. */
  readonly label: string
  /** V1 token type to migrate from. Default `'unwrapped'`. */
  readonly type?: MigratedNameType
  /** Which test account owns the name, before and after migration. Default `'user'`. */
  readonly owner?: User
  /**
   * Extra owner-controlled fuses to burn alongside `CANNOT_UNWRAP`, e.g.
   * `FUSES.CANNOT_TRANSFER`. Only meaningful for `type: 'locked'` — the
   * NameWrapper requires `CANNOT_UNWRAP` before any other owner fuse can be
   * burnt on a 2LD, and the other types never burn it.
   */
  readonly fuses?: number
}

type Dependencies = {
  /**
   * Widened from `(user?: string)` to the real `User` union. A function that
   * only accepts `User` is not assignable to one accepting any `string` —
   * parameter contravariance — so every caller passing a `PortalAccounts`
   * failed to typecheck. That was four call sites, and it is why this package
   * had no `typecheck` script passing.
   */
  accounts: {
    getAddress: (user?: User) => Address
    getPrivateKey: (user?: User) => Hash
  }
}

const waitForTx = (hash: Hash) =>
  publicClient.waitForTransactionReceipt({ hash })

const labelhashOf = (label: string) => keccak256(toHex(label))

/** namehash(`${label}.eth`) computed from the label's hash. */
const nodeFor = (label: string) =>
  keccak256(`0x${ETH_NODE.slice(2)}${labelhashOf(label).slice(2)}`)

/** Send a transaction from an arbitrary address by impersonating it on Anvil. */
async function sendImpersonated(
  from: Address,
  to: Address,
  data: `0x${string}`,
) {
  await testClient.setBalance({ address: from, value: 10n ** 20n })
  await testClient.impersonateAccount({ address: from })
  try {
    await waitForTx(
      await walletClient.sendTransaction({
        account: from,
        to,
        data,
        gas: 3_000_000n,
      }),
    )
  } finally {
    await testClient.stopImpersonatingAccount({ address: from })
  }
}

/**
 * ENS revoked every V1 controller on the BaseRegistrar at the V2 migration
 * cutover, so on a fresh fork nobody can call `register()`. Re-grant it by
 * impersonating the registrar's *live* owner — the owner has been transferred
 * on Sepolia, so it must be read off the fork rather than hardcoded.
 */
async function ensureController(account: Address) {
  const isController = await publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: baseRegistrarControllersSnippet,
    functionName: 'controllers',
    args: [account],
  })
  if (isController) return

  const registrarOwner = await publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: baseRegistrarOwnerSnippet,
    functionName: 'owner',
  })
  await sendImpersonated(
    registrarOwner,
    BASE_REGISTRAR,
    encodeFunctionData({
      abi: baseRegistrarAddControllerSnippet,
      functionName: 'addController',
      args: [account],
    }),
  )

  const granted = await publicClient.readContract({
    address: BASE_REGISTRAR,
    abi: baseRegistrarControllersSnippet,
    functionName: 'controllers',
    args: [account],
  })
  if (!granted) {
    throw new Error(
      `[makeMigratedName] addController did not take effect for ${account} — the BaseRegistrar owner (${registrarOwner}) may have changed again`,
    )
  }
}

/**
 * Create the RESERVED slot the migration controllers need.
 *
 * The controllers hold `ROLE_REGISTER_RESERVED`, not `ROLE_REGISTRAR`, so they
 * can only claim a v2 label that is already RESERVED. Registering with
 * `owner = 0` is what makes the slot RESERVED rather than REGISTERED.
 */
async function reserveInV2(label: string, expiry: bigint) {
  await sendImpersonated(
    V2_REGISTRAR,
    V2_REGISTRY,
    encodeFunctionData({
      abi: userRegistryRegisterSnippet,
      functionName: 'register',
      args: [label, zeroAddress, zeroAddress, V2_PUBLIC_RESOLVER, 0n, expiry],
    }),
  )
}

export function createMakeMigratedName({ accounts }: Dependencies) {
  return async function makeMigratedName(
    config: MigratedNameConfig,
  ): Promise<string> {
    const type = config.type ?? 'unwrapped'
    const ownerKey = config.owner ?? 'user'
    const ownerAddress = accounts.getAddress(ownerKey)
    const ownerAccount = privateKeyToAccount(accounts.getPrivateKey(ownerKey))
    const label = `${config.label}-${Math.floor(Date.now() / 1000)}`

    const sendAsOwner = async (to: Address, data: `0x${string}`) => {
      await waitForTx(
        await walletClient.sendTransaction({
          account: ownerAccount,
          to,
          data,
          gas: 3_000_000n,
        }),
      )
    }

    console.log(`[makeMigratedName] ${label}.eth (v1 type=${type})`)

    // Well-known Anvil accounts carry squatted EIP-7702 delegation code on the
    // Sepolia fork; that breaks ERC-721/1155 mints and receiver checks. Clear it.
    await testClient.setCode({ address: ownerAddress, bytecode: '0x' })
    await testClient.setBalance({ address: ownerAddress, value: 10n ** 21n })
    await ensureController(ownerAddress)

    // ── 1. Register the V1 name (ERC-721 on the BaseRegistrar) ──────────
    await sendAsOwner(
      BASE_REGISTRAR,
      encodeFunctionData({
        abi: baseRegistrarRegisterSnippet,
        functionName: 'register',
        args: [BigInt(labelhashOf(label)), ownerAddress, BigInt(ONE_YEAR)],
      }),
    )

    // ── 2. Wrap it, and burn CANNOT_UNWRAP for the locked variant ───────
    if (type !== 'unwrapped') {
      await sendAsOwner(
        BASE_REGISTRAR,
        encodeFunctionData({
          abi: registrySetApprovalForAllSnippet,
          functionName: 'setApprovalForAll',
          args: [NAME_WRAPPER, true],
        }),
      )
      await sendAsOwner(
        NAME_WRAPPER,
        encodeFunctionData({
          abi: nameWrapperWrapEth2ldSnippet,
          functionName: 'wrapETH2LD',
          args: [label, ownerAddress, 0, zeroAddress],
        }),
      )
    }

    if (type === 'locked') {
      await sendAsOwner(
        NAME_WRAPPER,
        encodeFunctionData({
          abi: nameWrapperSetFusesSnippet,
          functionName: 'setFuses',
          args: [nodeFor(label), CANNOT_UNWRAP | (config.fuses ?? 0)],
        }),
      )
    }

    // ── 3. Reserve the v2 slot (pre-migration snapshot equivalent) ──────
    const block = await publicClient.getBlock()
    await reserveInV2(label, block.timestamp + BigInt(ONE_YEAR))

    // ── 4. Approve the helper on whichever contract holds the token ─────
    const custodian = type === 'unwrapped' ? BASE_REGISTRAR : NAME_WRAPPER
    await sendAsOwner(
      custodian,
      encodeFunctionData({
        abi: registrySetApprovalForAllSnippet,
        functionName: 'setApprovalForAll',
        args: [MIGRATION_HELPER, true],
      }),
    )

    // ── 5. Migrate — the same entrypoint the manager's migration UI calls ─
    const data = {
      label,
      owner: ownerAddress,
      subregistry: zeroAddress,
      resolver: V2_PUBLIC_RESOLVER,
    }
    const migrateArgs =
      type === 'unwrapped'
        ? [[data], [], [], []]
        : type === 'unlocked'
          ? [[], [[data]], [], []]
          : [[], [], [[data]], []]

    await sendAsOwner(
      MIGRATION_HELPER,
      encodeFunctionData({
        abi: migrationHelperMigrateSnippet,
        functionName: 'migrate',
        args: migrateArgs as never,
      }),
    )

    const name = `${label}.eth`
    console.log(`[makeMigratedName] ✅ migrated ${name}`)
    return name
  }
}
