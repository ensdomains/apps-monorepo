/**
 * Seeds V2 subnames for MANUAL QA of the WEB-128 / PR #1120 transfer flow,
 * and prints the portal URL plus the on-chain facts each one should produce.
 *
 *   SHAPE=all-powers pnpm --filter @ens-apps/e2e seed:subname-transfer
 *
 * Why this exists: before it, a human tester could not produce a V2 subname
 * at all. `makeSubname` is a Playwright fixture, the dev-tools Migration panel
 * only makes V1→V2 *migration* shapes, and `seed-transfer-names.ts` only makes
 * migrated 2LDs. So every subname-transfer scenario was reachable by the
 * automated suite and by nothing else.
 *
 * The printed "expect" lines are the oracle, not decoration — they are read
 * straight off the chain after seeding, so if the app disagrees with them you
 * have found a bug rather than a stale doc. `probe-subname-transfer.ts` prints
 * the same facts for every shape at once without the QA framing; use that when
 * you want the table, and this when you want one name to click through.
 *
 * Run `pnpm e2e:infra:up` first, and start the portal with the mock wallet so
 * you are connected as the owner without a prompt:
 *
 *   cd apps/portal && VITE_USE_MOCK_WALLET=true pnpm dev
 *
 * That flag and the Playwright suite are mutually exclusive — it auto-connects
 * and removes the Connect button `connectWithHeadlessWallet` waits for. Flip it
 * back to `false` before running `pnpm e2e:portal`.
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
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
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

const REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function setResolver(uint256 tokenId, address resolver)',
])

/** `ROLE_CAN_TRANSFER_ADMIN`'s bit position, for the one shape that drops it. */
const CAN_TRANSFER_SHIFT = 28n

/**
 * A full bitmap minus one role. Clears the whole nybble (V2 packs a count into
 * each) and the admin counterpart 128 bits higher — masking only the admin half
 * leaves the role itself set and `hasRoles` still answers true.
 */
const withoutRole = (bitmap: bigint, shift: bigint): bigint =>
  bitmap & ~(0xfn << shift) & ~(0xfn << (shift + 128n))

const clientFor = (account: PrivateKeyAccount) =>
  createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(ANVIL_RPC_URL),
  })

type Shape = {
  what: string
  /** What the tester should see, and which automated scenario mirrors it. */
  expect: string[]
  scenario: string
  ownResolver?: boolean
  /** Give the subname to somebody other than the parent owner. */
  subnameOwner?: 'user2' | 'user3'
  roleBitmap?: bigint
}

const SHAPES: Record<string, Shape> = {
  'all-powers': {
    scenario: 'F16',
    what: 'the default shape — the parent owner holds all three powers over the subname',
    expect: [
      'the Transfer link is offered on /<name>/ownership',
      'a warning names the parent and lists all THREE powers, joined "a; b; and c"',
      'the warning says "(you)", because you own the parent as well',
      'no resolver-detach and no set-eth-address option (the resolver is inherited)',
    ],
  },
  'separate-owners': {
    scenario: 'F16',
    subnameOwner: 'user2',
    what: 'subname owned by user2 while you own the parent — the non-self copy',
    expect: [
      'connected as the DEFAULT mock account you own the parent but not the subname, so the route says "Not authorized"',
      'set VITE_MOCK_ACCOUNT to the user2 address above and restart to get the form; the warning should then NOT say "(you)" and should close with "Transferring it doesn\'t give the recipient what owning <parent> would."',
    ],
  },
  'own-resolver': {
    scenario: 'F19 (mirror)',
    ownResolver: true,
    what: 'subname with a resolver of its OWN rather than an inherited one',
    expect: [
      'BOTH the resolver-detach and set-eth-address options appear',
      'after transferring with defaults, the subname resolver is cleared and the PARENT resolver is unchanged',
    ],
  },
  'no-transfer-role': {
    scenario: 'F21',
    subnameOwner: 'user3',
    roleBitmap: withoutRole(FULL_ROLE_BITMAP, CAN_TRANSFER_SHIFT),
    what: 'subname whose owner lacks ROLE_CAN_TRANSFER_ADMIN',
    expect: [
      'connected as the DEFAULT mock account you are not the owner, so you get "Not authorized — You are not the owner of this name." (verified: that, not the role message)',
      'to see the role refusal itself, set VITE_MOCK_ACCOUNT to the user3 address above and restart the dev server: then it reads "Transfer not available", with no recipient form',
      'NOTE: the owner here is user3, deliberately NOT the account that deployed the subregistry — the deployer holds every role at the registry ROOT, which would grant the transfer role straight back',
    ],
  },
}

async function seed(key: string, shape: Shape) {
  const accounts = createAccounts()
  const makeName = createMakeName({ accounts, time: noopTime })
  const signer = privateKeyToAccount(accounts.getPrivateKey('user'))
  const subnameOwner = shape.subnameOwner
    ? accounts.getAddress(shape.subnameOwner)
    : accounts.getAddress('user')

  const parent = await makeName({
    label: `qa-sub-${key}`,
    owner: 'user',
    // A parent resolver is what the subname either inherits or overrides, so
    // both resolver shapes need one to exist in the first place.
    records: [{ key: 'description', value: `QA parent for ${key}` }],
  })
  const parentLabel = parent.replace(/\.eth$/, '')

  const subregistry = await attachSubregistry({ label: parentLabel }, signer)
  await registerSubname(
    {
      registryAddress: subregistry,
      label: 'sub',
      parentLabel,
      owner: subnameOwner,
      roleBitmap: shape.roleBitmap ?? FULL_ROLE_BITMAP,
    },
    signer,
  )

  if (shape.ownResolver) {
    const parentResolver = await publicClient.readContract({
      address: ETH_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'getResolver',
      args: [parentLabel],
    })
    const hash = await clientFor(signer).sendTransaction({
      to: subregistry,
      data: encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'setResolver',
        args: [labelToCanonicalId('sub'), parentResolver as Address],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const name = `sub.${parent}`
  const ownResolver = await publicClient.readContract({
    address: subregistry,
    abi: REGISTRY_ABI,
    functionName: 'getResolver',
    args: ['sub'],
  })

  console.log(`\n── ${key} ${'─'.repeat(Math.max(0, 56 - key.length))}`)
  console.log(`   ${shape.what}`)
  console.log(`   automated equivalent: @scenario:${shape.scenario}`)
  console.log(`\n   name             ${name}`)
  console.log(`   subname owner    ${subnameOwner}`)
  console.log(`   parent registry  ${ETH_REGISTRY}`)
  console.log(`   subname registry ${subregistry}`)
  console.log(
    `   own resolver     ${ownResolver === zeroAddress ? '0x0 — INHERITED from the parent' : ownResolver}`,
  )
  console.log('\n   expect:')
  for (const line of shape.expect) console.log(`     · ${line}`)
  console.log(`\n   → ${PORTAL_APP_URL}/${name}/ownership/transfer`)
}

async function main() {
  const only = process.env.SHAPE
  if (only && !SHAPES[only]) {
    console.error(
      `unknown SHAPE "${only}". Known: ${Object.keys(SHAPES).join(', ')}`,
    )
    process.exit(1)
  }

  const accounts = createAccounts()
  console.log(`you / parent owner (user):  ${accounts.getAddress('user')}`)
  console.log(`second owner       (user2): ${accounts.getAddress('user2')}`)
  console.log(`third owner        (user3): ${accounts.getAddress('user3')}`)
  console.log(
    '\nConnect as the first of these (the mock wallet default) unless a shape says otherwise.',
  )

  for (const [key, shape] of Object.entries(SHAPES)) {
    if (only && key !== only) continue
    await seed(key, shape)
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
