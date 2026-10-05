/**
 * Seeds unmigrated V1 names for MANUAL QA of the WEB-1396 / PR #1134 transfer
 * flow, one per outcome of `getV1TransferGate` (`features/transfer/v1/rules.ts`).
 *
 *   SHAPE=ok pnpm --filter @ens-apps/e2e seed:v1-transfer
 *
 * Why this exists: `makeV1Name` is a Playwright fixture, and nothing on the CLI
 * produced a V1 name before this. So every V1 transfer state was reachable by
 * the automated suite and by nothing else — and the states are the whole
 * feature, since #1134 is mostly a decision table rendered as six different
 * cards.
 *
 * The shape with no V2 analogue, and the one worth understanding before
 * clicking anything: an unwrapped V1 2LD splits ownership in two.
 * `BaseRegistrar` holds the **registrant** (the ERC-721) and `ENSRegistry`
 * holds the **controller** (who may set records). They can be different
 * accounts. A complete transfer moves both — `reclaim` then `safeTransferFrom`
 * — and moving only the token hands over the asset while leaving the old owner
 * able to repoint the resolver and rewrite every record.
 *
 * Run `pnpm e2e:infra:up` first, and start the portal with the mock wallet so
 * you are connected as the owner without prompts:
 *
 *   cd apps/portal && VITE_USE_MOCK_WALLET=true pnpm dev
 *
 * That flag and the Playwright suite are mutually exclusive — it auto-connects
 * and removes the Connect button `connectWithHeadlessWallet` waits for. Set it
 * back to `false` before running `pnpm e2e:portal`.
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  type Address,
  createWalletClient,
  encodeFunctionData,
  http,
  labelhash,
  namehash,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  FUSES,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
} from '../fixtures/makeV1Name.js'
import { createAccounts } from '../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../helpers/anvil-client.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

const REGISTRAR_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
])
const REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
])

const DAY = 86_400

type Shape = {
  what: string
  /** The `getV1TransferGate` reason this produces. */
  gate: string
  /** What the tester should see, and which automated scenario mirrors it. */
  expect: string[]
  scenario: string
  type?: 'unwrapped' | 'wrapped' | 'locked'
  fuses?: number
  /** Seconds; negative means already expired by that much. */
  duration?: number
  /** Hand the ERC-721 to user2, leaving you as controller only. */
  splitRegistrant?: boolean
  /** Register the whole name to somebody else. */
  owner?: 'user2'
  /** Point the name's ETH address record at you (WEB-1508). */
  ethRecord?: boolean
  steps?: string[]
}

const SHAPES: Record<string, Shape> = {
  'eth-locked-resolver': {
    gate: 'ok',
    scenario: 'WEB-1508',
    type: 'locked',
    fuses: FUSES.CANNOT_SET_RESOLVER,
    ethRecord: true,
    what: 'a locked V1 name with CANNOT_SET_RESOLVER burned and an ETH address record pointing at you',
    expect: [
      'no "Detach the resolver" switch, and a warning that the resolver stays attached',
      '"Set the ETH address to the recipient" is on AND clickable, with no "Not needed" line',
      'the plan is TWO steps: "Update ETH address" then "Transfer name"',
      'reject the second prompt and close the modal: a red alert says the transfer didn’t go through, names both addresses, and offers Restore ETH address',
    ],
  },
  'eth-wrapped': {
    gate: 'ok',
    scenario: 'WEB-1508',
    type: 'wrapped',
    ethRecord: true,
    what: 'a wrapped V1 name with an ETH address record pointing at you, resolver detach allowed',
    expect: [
      '"Detach the resolver" is on, and the ETH switch is greyed out as "Not needed while the resolver is being detached."',
      'turning the detach off makes the ETH switch clickable again',
    ],
  },
  ok: {
    gate: 'ok',
    scenario: 'F23',
    type: 'unwrapped',
    what: 'a plain unwrapped V1 2LD you own outright — the transferable case',
    expect: [
      'the Ownership tab offers Transfer, which it never did before #1134',
      'the route renders the recipient form',
      'the plan is TWO steps: "reclaim" then "transfer-erc721" — in that order',
      'after transferring, BOTH the registrant and the controller read as the recipient',
    ],
    steps: [
      'transfer to any other address, then confirm both halves moved:',
      '    cast call {registrar} "ownerOf(uint256)(address)" {tokenId} --rpc-url http://127.0.0.1:8545',
      '    cast call {registry} "owner(bytes32)(address)" {node} --rpc-url http://127.0.0.1:8545',
      'both must print the recipient. If only the first moved, the old owner still controls the records',
    ],
  },
  'manager-only': {
    gate: 'manager-only',
    scenario: 'F24',
    type: 'unwrapped',
    splitRegistrant: true,
    what: 'you are the manager (controller) but user2 holds the registrant',
    expect: [
      '"You manage this name but don\'t own it"',
      'the card names the registrant IN FULL (font-mono), so you know who to ask',
      'no recipient form',
      'this state is reached by BaseRegistrar.safeTransferFrom alone, which does not touch the registry — which is exactly why reclaim is a separate call',
    ],
  },
  'not-owner': {
    gate: 'not-owner',
    scenario: '(not automated)',
    type: 'unwrapped',
    owner: 'user2',
    what: 'a V1 name owned entirely by somebody else',
    expect: ['"Not authorized"', 'no recipient form'],
  },
  'cannot-transfer': {
    gate: 'cannot-transfer',
    scenario: 'F25',
    type: 'locked',
    fuses: FUSES.CANNOT_TRANSFER,
    what: 'a wrapped V1 name with the CANNOT_TRANSFER fuse burnt',
    expect: [
      '"Transfer permanently disabled" — a burnt fuse is irreversible and the copy says so',
      'no recipient form',
      'and the Ownership tab must NOT offer a Transfer link that leads to this refusal',
    ],
  },
  grace: {
    gate: 'grace',
    scenario: '(not automated)',
    type: 'unwrapped',
    duration: -3 * DAY,
    what: 'expired 3 days ago — inside the 90-day grace period',
    expect: [
      '"This name is in its grace period"',
      'no recipient form — the name is not transferable until it is renewed',
    ],
  },
  expired: {
    gate: 'expired',
    scenario: '(not automated)',
    type: 'unwrapped',
    duration: -100 * DAY,
    what: 'expired 100 days ago — past the 90-day grace period',
    expect: [
      '"This name has expired"',
      'no recipient form — it is available for anyone to register',
    ],
  },
}

/**
 * Warn when the checkout cannot render what these shapes are for. The tests
 * live on `e2e-tests-coverage`; the feature is PR #1134. Seeding from a branch
 * without it produces perfectly good chain data and a portal that shows no
 * Transfer link at all — which reads as the shapes being broken.
 */
function warnIfFeatureMissing() {
  const marker = fileURLToPath(
    new URL(
      '../../apps/portal/src/features/transfer/v1/rules.ts',
      import.meta.url,
    ),
  )
  if (existsSync(marker)) return
  console.warn(
    '\n  ⚠  This checkout does not contain PR #1134, so the portal will not\n' +
      '     offer transfer for any V1 name below. Seeding anyway — the chain\n' +
      '     data is fine — but switch branches before opening the URLs:\n\n' +
      '       git checkout qa/web-1396-v1-transfer\n',
  )
}

async function seed(key: string, shape: Shape) {
  const accounts = createAccounts()
  const signer = privateKeyToAccount(accounts.getPrivateKey('user'))
  const makeV1Name = createMakeV1Name({ userAccount: signer })

  const name = await makeV1Name({
    label: `qa-v1-${key}`,
    type: shape.type ?? 'unwrapped',
    ...(shape.fuses ? { fuses: shape.fuses } : {}),
    ...(shape.duration ? { duration: shape.duration } : {}),
    ...(shape.owner ? { owner: shape.owner } : {}),
    ...(shape.ethRecord
      ? {
          records: {
            addresses: [{ coinType: 60, value: accounts.getAddress('user') }],
          },
        }
      : {}),
  })
  const label = name.replace(/\.eth$/, '')
  const tokenId = BigInt(labelhash(label))

  if (shape.splitRegistrant) {
    const wallet = createWalletClient({
      account: signer,
      chain: publicClient.chain,
      transport: http(ANVIL_RPC_URL),
    })
    const hash = await wallet.sendTransaction({
      to: V1_BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: REGISTRAR_ABI,
        functionName: 'safeTransferFrom',
        args: [
          accounts.getAddress('user'),
          accounts.getAddress('user2'),
          tokenId,
        ],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const [registrant, controller] = await Promise.all([
    publicClient
      .readContract({
        address: V1_BASE_REGISTRAR,
        abi: REGISTRAR_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      })
      .catch(() => '0x0 (expired — the registrar has released it)'),
    publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'owner',
      args: [namehash(name)],
    }),
  ])

  console.log(`\n── ${key} ${'─'.repeat(Math.max(0, 56 - key.length))}`)
  console.log(`   ${shape.what}`)
  console.log(
    `   gate reason: ${shape.gate}   ·   automated: ${shape.scenario}`,
  )
  console.log(`\n   name        ${name}`)
  console.log(`   registrant  ${registrant}   (BaseRegistrar, the ERC-721)`)
  console.log(`   controller  ${controller}   (ENSRegistry, sets records)`)
  console.log('\n   expect:')
  for (const line of shape.expect) console.log(`     · ${line}`)
  if (shape.steps) {
    console.log('\n   steps:')
    let n = 0
    for (const line of shape.steps) {
      const filled = line
        .replace('{registrar}', V1_BASE_REGISTRAR)
        .replace('{registry}', V1_ENS_REGISTRY)
        .replace('{tokenId}', tokenId.toString())
        .replace('{node}', namehash(name))
      if (line.startsWith('    ')) console.log(`          ${filled.trim()}`)
      else console.log(`     ${++n}. ${filled}`)
    }
  }
  console.log(`\n   → ${PORTAL_APP_URL}/${name}/ownership/transfer`)
}

async function main() {
  warnIfFeatureMissing()
  const only = process.env.SHAPE
  if (only && !SHAPES[only]) {
    console.error(
      `unknown SHAPE "${only}". Known: ${Object.keys(SHAPES).join(', ')}`,
    )
    process.exit(1)
  }

  const accounts = createAccounts()
  console.log(`you   (user):  ${accounts.getAddress('user')}`)
  console.log(`other (user2): ${accounts.getAddress('user2')}`)
  console.log(
    '\nConnect as the first of these (the mock-wallet default) for every shape.',
  )

  // Expiry shapes last: a past-expiry seed warps the single shared chain clock
  // forward, and anything seeded earlier ages with it.
  const order = Object.entries(SHAPES).sort(
    ([, a], [, b]) => Number(!!a.duration) - Number(!!b.duration),
  )
  for (const [key, shape] of order) {
    if (only && key !== only) continue
    await seed(key, shape)
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
