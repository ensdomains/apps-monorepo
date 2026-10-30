/**
 * Measures the on-chain ground truth the subname-transfer scenarios are
 * written against (WEB-128 / PR #1120), the way `probe-detach.ts` did for
 * WEB-446. Nothing here asserts — it seeds each shape and prints what the
 * chain actually says, so the test plan's oracle table is measured rather
 * than inferred from reading the app.
 *
 *   npx tsx scripts/probe-subname-transfer.ts
 *
 * For each shape it reports the four reads the transfer route depends on
 * (`getOwner`, `getResolver`, `getSubregistry`, `getExpiry`) plus the three
 * `hasRoles` reads behind `useParentAuthority`'s warning — each against the
 * registry the app itself would use, which is the whole subtlety:
 *
 * - reclaim now        ROLE_UNREGISTER      on the SUBNAME's resource, in the
 *                                           registry that holds the subname
 * - re-issue on expiry ROLE_REGISTRAR       at ROOT resource 0 of that same
 *                                           registry (`_register` asserts
 *                                           against ROOT_RESOURCE, so a
 *                                           per-name check reads false)
 * - repoint registry   ROLE_SET_SUBREGISTRY on the PARENT's own token, in the
 *                                           PARENT's registry
 *
 * `getResolver` is read from the subname's own registry slot, not through the
 * UniversalResolver — that distinction is exactly what #1120 changed, and an
 * inherited resolver must read as `0x0` here.
 */

import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import {
  type Address,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
  zeroAddress,
} from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import { createMakeName } from '../fixtures/makeName.js'
import {
  attachSubregistry,
  FULL_ROLE_BITMAP,
  registerSubname,
} from '../fixtures/makeSubname.js'
import { createAccounts } from '../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../helpers/anvil-client.js'
import { ETH_REGISTRY } from '../helpers/role-assertions.js'
import { noopTime } from './seed-name.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

const clientFor = (account: PrivateKeyAccount) =>
  createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(ANVIL_RPC_URL),
  })

const REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
  'function getExpiry(uint256 id) view returns (uint64)',
  'function ownerOf(uint256 id) view returns (address)',
  'function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)',
  'function setResolver(uint256 tokenId, address resolver)',
])

/**
 * Nybble-packed role bits, as the registry encodes them. Declared here rather
 * than hand-shifted at each call site: V2 packs each role into its own nybble
 * with the admin counterpart 128 bits higher, so `1n << 3n` silently lands in
 * a different role's nybble.
 */
const ROLE = {
  ROLE_REGISTRAR: 1n << 0n,
  ROLE_UNREGISTER: 1n << 12n,
  ROLE_SET_SUBREGISTRY: 1n << 20n,
  ROLE_CAN_TRANSFER_ADMIN: 1n << 28n,
} as const

/**
 * Clear one role from a full bitmap. Both the role's own nybble AND its admin
 * counterpart 128 bits higher have to go: masking only the admin bit leaves
 * the role itself set, and `hasRoles` then still answers true. Whole nybbles
 * (`0xF`), not single bits, because V2 packs a count into each one.
 */
const without = (bitmap: bigint, role: bigint): bigint => {
  const shift = BigInt(role.toString(2).length - 1)
  return bitmap & ~(0xfn << shift) & ~(0xfn << (shift + 128n))
}

const read = {
  resolver: (registry: Address, label: string) =>
    publicClient.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'getResolver',
      args: [label],
    }),
  subregistry: (registry: Address, label: string) =>
    publicClient.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'getSubregistry',
      args: [label],
    }),
  expiry: (registry: Address, label: string) =>
    publicClient.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'getExpiry',
      args: [labelToCanonicalId(label)],
    }),
  hasRoles: (
    registry: Address,
    resource: bigint,
    roleBitmap: bigint,
    account: Address,
  ) =>
    publicClient.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'hasRoles',
      args: [resource, roleBitmap, account],
    }),
}

async function ownerOf(registry: Address, label: string): Promise<Address> {
  try {
    return (await publicClient.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [labelToCanonicalId(label)],
    })) as Address
  } catch {
    return zeroAddress
  }
}

type Shape = {
  key: string
  what: string
  /** Roles the subname's owner gets. Full bitmap unless the shape says less. */
  subnameRoles?: bigint
  /** Give the subname its own resolver rather than inheriting the parent's. */
  ownResolver?: boolean
  /** Parent and subname owned by the same wallet. */
  parentIsSelf?: boolean
  /** Explicit subname owner, overriding `parentIsSelf`. */
  subnameOwner?: 'user' | 'user2' | 'user3'
}

const SHAPES: Shape[] = [
  {
    key: 'all-powers',
    what: 'makeSubname default — parent owner holds every role, so all three warnings should fire',
    parentIsSelf: true,
  },
  {
    key: 'separate-owners',
    what: 'parent owned by `user`, subname owned by `user2` — parentIsSelf false',
  },
  {
    key: 'own-resolver',
    what: 'subname has its own resolver, so both detach options should be offered',
    ownResolver: true,
    parentIsSelf: true,
  },
  {
    key: 'no-transfer-role',
    what: 'subname owner lacks ROLE_CAN_TRANSFER_ADMIN — the route should refuse before the form',
    subnameRoles: without(FULL_ROLE_BITMAP, ROLE.ROLE_CAN_TRANSFER_ADMIN),
    // Deliberately NOT the subregistry's deployer. `hasRoles` resolves
    // `roles[ROOT][account] | roles[resource][account]`, so the account that
    // deployed the subregistry holds every role at its root and a revoke on
    // the resource alone reads as no revoke at all. Measured, not assumed:
    // the first run of this probe reported `transfer role yes` for exactly
    // that reason.
    subnameOwner: 'user3',
  },
]

async function probe(shape: Shape) {
  const accounts = createAccounts()
  // `noopTime` because there is no browser to keep in step here — the app
  // reads chain state directly when the tester opens the printed URL.
  const makeName = createMakeName({ accounts, time: noopTime })
  const ownerAccount = accounts.getAddress('user')
  const subnameOwner = shape.subnameOwner
    ? accounts.getAddress(shape.subnameOwner)
    : shape.parentIsSelf
      ? ownerAccount
      : accounts.getAddress('user2')

  // The parent is a normal 2LD in the .eth registry, owned by `user` so the
  // connected wallet is the parent owner in every shape.
  const parent = await makeName({
    label: `probe-${shape.key}`,
    owner: 'user',
    records: shape.ownResolver
      ? [{ key: 'description', value: 'own resolver' }]
      : undefined,
  })
  const parentLabel = parent.replace(/\.eth$/, '')

  const signer = accounts.getPrivateKey('user')
  const { privateKeyToAccount } = await import('viem/accounts')
  const signerAccount = privateKeyToAccount(signer)

  const subregistry = await attachSubregistry(
    { label: parentLabel },
    signerAccount,
  )
  const subLabel = 'sub'
  await registerSubname(
    {
      registryAddress: subregistry,
      label: subLabel,
      parentLabel,
      owner: subnameOwner,
      roleBitmap: shape.subnameRoles ?? FULL_ROLE_BITMAP,
    },
    signerAccount,
  )
  // Give the subname a resolver of its OWN, in its own registry slot. Passing
  // `records` to makeName only resolves the PARENT — the subname would still
  // read 0x0 and merely inherit, which is the opposite shape. Measured: the
  // first run of this probe reported `own resolver 0x0` for that reason.
  if (shape.ownResolver) {
    const parentResolver = await read.resolver(ETH_REGISTRY, parentLabel)
    const hash = await clientFor(signerAccount).sendTransaction({
      to: subregistry,
      data: encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setResolver',
        args: [labelToCanonicalId(subLabel), parentResolver as Address],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const name = `${subLabel}.${parent}`

  const subResource = labelToCanonicalId(subLabel)
  const parentResource = labelToCanonicalId(parentLabel)

  const [owner, resolver, ownSubregistry, expiry] = await Promise.all([
    ownerOf(subregistry, subLabel),
    read.resolver(subregistry, subLabel),
    read.subregistry(subregistry, subLabel),
    read.expiry(subregistry, subLabel),
  ])

  // The three useParentAuthority reads, each against the registry the hook
  // itself targets — note the third is the PARENT's registry, not the
  // subname's, and the second is at ROOT resource 0.
  const [canReclaim, canReissue, canRepoint, canTransfer] = await Promise.all([
    read.hasRoles(subregistry, subResource, ROLE.ROLE_UNREGISTER, ownerAccount),
    read.hasRoles(subregistry, 0n, ROLE.ROLE_REGISTRAR, ownerAccount),
    read.hasRoles(
      ETH_REGISTRY,
      parentResource,
      ROLE.ROLE_SET_SUBREGISTRY,
      ownerAccount,
    ),
    read.hasRoles(
      subregistry,
      subResource,
      ROLE.ROLE_CAN_TRANSFER_ADMIN,
      subnameOwner,
    ),
  ])

  const yn = (b: boolean) => (b ? 'yes' : 'NO')
  console.log(
    `\n── ${shape.key} ${'─'.repeat(Math.max(0, 58 - shape.key.length))}`,
  )
  console.log(`   ${shape.what}`)
  console.log(`   name              ${name}`)
  console.log(`   parent registry   ${ETH_REGISTRY}`)
  console.log(`   subname registry  ${subregistry}`)
  console.log(`   subname owner     ${owner}`)
  console.log(
    `   own resolver      ${resolver === zeroAddress ? '0x0 (INHERITED — no detach option expected)' : resolver}`,
  )
  console.log(
    `   own subregistry   ${ownSubregistry === zeroAddress ? '0x0 (leaf — no registry-detach option)' : ownSubregistry}`,
  )
  console.log(`   expiry            ${expiry} (0 would render as EXPIRED)`)
  console.log(
    `   transfer role     ${yn(canTransfer as boolean)}  (owner holds ROLE_CAN_TRANSFER_ADMIN)`,
  )
  console.log(
    `   parent authority: reclaim-now ${yn(canReclaim as boolean)} · reissue-on-expiry ${yn(canReissue as boolean)} · repoint-registry ${yn(canRepoint as boolean)}`,
  )
  console.log(`   → ${PORTAL_APP_URL}/${name}/ownership/transfer`)
}

async function main() {
  const accounts = createAccounts()
  console.log(`owner / parent owner (user):  ${accounts.getAddress('user')}`)
  console.log(`second owner        (user2): ${accounts.getAddress('user2')}`)
  console.log(`recipient           (user3): ${accounts.getAddress('user3')}`)

  const only = process.env.SHAPE
  for (const shape of SHAPES) {
    if (only && shape.key !== only) continue
    await probe(shape)
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
