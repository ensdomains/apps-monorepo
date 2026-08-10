/**
 * makeSubname fixture — plan item H2.
 *
 * Creates N-deep V2 subnames through `UserRegistry`, with a per-level owner
 * and role bitmap. §5.D is written entirely against this, and §5.C's
 * registry-level cases and §5.E's per-name resolver cases need it too.
 *
 * A 2LD in the `.eth` registry has no subregistry until someone deploys one,
 * so creating `c.b.eth` means: give `b.eth` a subregistry, register `c` in it,
 * and — if anything is to live under `c` — give `c` a subregistry in turn.
 * That is the whole shape of the V2 hierarchy, and it is why each level here
 * gets both an owner and a registry.
 *
 * Generalised from the `attachSubregistry` / `registerSubname` pair that lived
 * in `transfer.spec.ts`, which now uses this instead.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  createSubnameV2,
  deploySubregistry,
  setSubregistry,
} from '@ensdomains/ensjs/wallet'
import { proxyDeployedEventSnippet } from '@ensdomains/ensjs-abi/v2'
import {
  type Account,
  type Address,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  stringToBytes,
  toHex,
  zeroAddress,
} from 'viem'
import { publicClient } from '../helpers/anvil-client.js'
import { ETH_REGISTRY, type Role } from '../helpers/role-assertions.js'

const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const VERIFIABLE_FACTORY = ensjsSepolia.ensVerifiableFactory.address
const USER_REGISTRY_IMPL = ensjsSepolia.ensUserRegistryImpl.address

/**
 * `deploySubregistryWriteParameters`'s default admin bitmap — every role, in
 * the nybble-packed encoding. Not exported by ensjs; the app's own
 * `create-subname.helpers.ts` redeclares it the same way.
 */
export const FULL_ROLE_BITMAP = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

export interface SubnameLevel {
  /** Label for this level, e.g. `sub` in `sub.parent.eth`. */
  label: string
  /** Owner of this level. Defaults to the caller. */
  owner?: Address
  /**
   * Roles the owner receives on this level. Defaults to the full bitmap, which
   * is what the portal's own create-subname flow grants.
   */
  roleBitmap?: bigint
  /**
   * Give this level its own subregistry so names can be created beneath it.
   * Implied for every level except the last.
   */
  withSubregistry?: boolean
}

export interface SubnameResult {
  /** Fully-qualified name of the deepest level, e.g. `d.c.b.eth`. */
  name: string
  /** One entry per level created, outermost first. */
  levels: {
    name: string
    label: string
    owner: Address
    /** Registry the level is registered *in* (its parent's subregistry). */
    registryAddress: Address
    /** Registry deployed *for* this level, when it has one. */
    subregistryAddress?: Address
  }[]
}

/**
 * The expiry to give a subname: its parent's, read from the registry.
 *
 * ensjs's `createSubnameV2` defaults `expires` to `Date.now()/1000 + 1 year`,
 * which is wrong here twice over. It uses wall-clock time, which drifts from a
 * fork that time-travels; and a year is longer than a test parent's 28-day
 * term, and a registry refuses a subname that would outlive its parent
 * (`CannotSetPastExpiry`, the same error used for an expiry out of range).
 * Inheriting the parent's expiry is both correct and always in range.
 */
async function parentExpiry(
  registryAddress: Address,
  label: string,
): Promise<bigint> {
  return publicClient.readContract({
    address: registryAddress,
    abi: parseAbi(['function getExpiry(uint256 id) view returns (uint64)']),
    functionName: 'getExpiry',
    args: [BigInt(keccak256(toHex(label)))],
  }) as Promise<bigint>
}

function clientFor(account: Account) {
  return createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(ANVIL_RPC_URL),
  })
}

/**
 * Deploy a `UserRegistry` proxy and attach it to `label` in `registryAddress`.
 *
 * The salt must be unique per call. `deploySubregistry` computes a
 * `DEFAULT_SALT` **once at module load**, so every call in a Playwright worker
 * would otherwise reuse it — and since the CREATE2 address derives from
 * (deployer, salt), the second deploy from the same account reverts on an
 * already-deployed proxy.
 */
export async function attachSubregistry(
  {
    label,
    registryAddress = ETH_REGISTRY,
  }: { label: string; registryAddress?: Address },
  signer: Account,
): Promise<Address> {
  const client = clientFor(signer)

  const deployHash = await deploySubregistry(
    client as never,
    {
      factoryAddress: VERIFIABLE_FACTORY,
      implAddress: USER_REGISTRY_IMPL,
      salt: BigInt(
        keccak256(
          stringToBytes(
            `subregistry:${registryAddress}:${label}:${signer.address}`,
          ),
        ),
      ),
    } as never,
  )
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash as `0x${string}`,
  })

  const [deployed] = parseEventLogs({
    abi: proxyDeployedEventSnippet,
    eventName: 'ProxyDeployed',
    logs: receipt.logs,
  })
  if (!deployed) {
    throw new Error(
      `[makeSubname] no ProxyDeployed event when deploying a subregistry for ${label}`,
    )
  }
  const subregistryAddress = (deployed.args as { proxyAddress: Address })
    .proxyAddress

  const setHash = await setSubregistry(
    client as never,
    {
      registryAddress,
      label,
      subregistryAddress,
    } as never,
  )
  await publicClient.waitForTransactionReceipt({
    hash: setHash as `0x${string}`,
  })

  return subregistryAddress
}

/**
 * Register a single subname directly into `registryAddress`.
 *
 * The lower-level counterpart to {@link createMakeSubname} for callers that
 * already hold a registry address and just need one name in it.
 */
export async function registerSubname(
  {
    registryAddress,
    label,
    owner,
    roleBitmap = FULL_ROLE_BITMAP,
    parentLabel,
    expires,
  }: {
    registryAddress: Address
    label: string
    owner?: Address
    roleBitmap?: bigint
    /**
     * The parent 2LD's label, used to inherit its expiry. Required unless
     * `expires` is given — see {@link parentExpiry} for why the ensjs default
     * cannot be used here.
     */
    parentLabel?: string
    /** Explicit expiry; overrides `parentLabel`. */
    expires?: bigint
  },
  signer: Account,
): Promise<void> {
  const client = clientFor(signer)
  const hash = await createSubnameV2(
    client as never,
    {
      registryAddress,
      label,
      owner: owner ?? signer.address,
      subregistryAddress: zeroAddress,
      resolverAddress: zeroAddress,
      roleBitmap,
      expires:
        expires ??
        (parentLabel
          ? await parentExpiry(ETH_REGISTRY, parentLabel)
          : undefined),
    } as never,
  )
  await publicClient.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
  })
}

type Dependencies = {
  /** Signer for every write, and the default owner of each level. */
  account: Account
}

export function createMakeSubname({ account }: Dependencies) {
  /**
   * Build a chain of subnames under `parent`.
   *
   * ```ts
   * // c.b.a.eth, where `b` gets its own registry so `c` can live in it
   * await makeSubname({ parent: 'a.eth', levels: [{ label: 'b' }, { label: 'c' }] })
   * ```
   *
   * The parent must already exist as a 2LD; use `makeName`/`makeV2Name` first.
   */
  return async function makeSubname({
    parent,
    levels,
  }: {
    parent: string
    levels: SubnameLevel[]
  }): Promise<SubnameResult> {
    if (levels.length === 0) {
      throw new Error('[makeSubname] at least one level is required')
    }

    const parentLabel = parent.replace(/\.eth$/, '')
    // Every level inherits the 2LD's expiry; a registry rejects a subname that
    // would outlive its parent.
    const parentTermExpiry = await parentExpiry(ETH_REGISTRY, parentLabel)
    // The parent is a 2LD in the .eth registry and needs a registry of its own
    // before anything can be registered beneath it.
    let registryAddress = await attachSubregistry(
      { label: parentLabel },
      account,
    )

    const result: SubnameResult['levels'] = []
    let qualified = parent

    for (const [index, level] of levels.entries()) {
      const owner = level.owner ?? account.address
      const isLast = index === levels.length - 1
      qualified = `${level.label}.${qualified}`

      const hash = await createSubnameV2(
        clientFor(account) as never,
        {
          registryAddress,
          label: level.label,
          owner,
          subregistryAddress: zeroAddress,
          resolverAddress: zeroAddress,
          roleBitmap: level.roleBitmap ?? FULL_ROLE_BITMAP,
          expires: parentTermExpiry,
        } as never,
      )
      await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
      })

      const entry: SubnameResult['levels'][number] = {
        name: qualified,
        label: level.label,
        owner,
        registryAddress,
      }

      // Every level but the last needs a registry for the next one to live in.
      if (level.withSubregistry ?? !isLast) {
        entry.subregistryAddress = await attachSubregistry(
          { label: level.label, registryAddress },
          account,
        )
        registryAddress = entry.subregistryAddress
      }

      result.push(entry)
      console.log(`[makeSubname] created ${qualified} → ${owner}`)
    }

    return { name: qualified, levels: result }
  }
}

export type MakeSubname = ReturnType<typeof createMakeSubname>
export type { Role }
