/**
 * Seed the manual local environment for replacement-readiness finding G02.
 *
 * The portal's mock wallet is Anvil account 0. Every positive case makes that
 * account the child holder, while account 1 owns the parent where authority
 * must be split. This lets a tester cover the full matrix without switching
 * wallets.
 *
 * Run after `pnpm e2e:infra:up`:
 *
 *   pnpm --filter @ens-apps/e2e seed:g02-delete
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { bytesToHex, namehash, parseAbi } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
} from '../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../fixtures/makeV1RegistrySubname.js'
import { CHILD_FUSES, makeV1Subname } from '../fixtures/makeV1Subname.js'
import { publicClient, testClient } from '../helpers/anvil-client.js'
import { waitForBignameBlock } from '../helpers/bigname-sync.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const MNEMONIC = 'test test test test test test test test test test test junk'
const accountAt = (addressIndex: number) => {
  const hd = mnemonicToAccount(MNEMONIC, { addressIndex }).getHdKey()
  if (!hd.privateKey)
    throw new Error(`No private key for account ${addressIndex}`)
  return privateKeyToAccount(bytesToHex(hd.privateKey))
}
const connected = accountAt(0)
const alternate = accountAt(1)
const suffix = Date.now().toString(36)

type Shape = 'unwrapped' | 'wrapped' | 'emancipated'
type Authority = 'child-only' | 'both' | 'parent-only-control'
type ManualCase = {
  id: string
  shape: Shape
  authority: Authority
  parent: string
  child: string
  parentOwner: `0x${string}`
  childOwner: `0x${string}`
  url: string
  expected: string
  legacyCases: string[]
}

const registryAbi = parseAbi(['function owner(bytes32) view returns (address)'])
const wrapperAbi = parseAbi([
  'function getData(uint256) view returns (address,uint32,uint64)',
])

async function seed(
  id: string,
  shape: Shape,
  authority: Authority,
  legacyCases: string[],
): Promise<ManualCase> {
  const parentOwner = authority === 'child-only' ? alternate : connected
  const childOwner =
    authority === 'parent-only-control' ? alternate.address : connected.address
  const parent = await createMakeV1Name({ userAccount: parentOwner })({
    label: `g02-${id}-${suffix}`,
    type: shape === 'emancipated' ? 'locked' : shape,
  })
  const child =
    shape === 'unwrapped'
      ? await makeV1RegistrySubname({
          parentName: parent.replace(/\.eth$/, ''),
          childLabel: 'delete-me',
          ownerAddress: childOwner,
          parentOwnerAccount: parentOwner,
        })
      : await makeV1Subname({
          parentName: parent.replace(/\.eth$/, ''),
          childLabel: 'delete-me',
          ownerAddress: childOwner,
          parentOwnerAccount: parentOwner,
          fuses:
            shape === 'emancipated'
              ? CHILD_FUSES.EMANCIPATED
              : CHILD_FUSES.UNLOCKED_CHILD,
        })

  const actualChildOwner =
    shape === 'unwrapped'
      ? await publicClient.readContract({
          address: V1_ENS_REGISTRY,
          abi: registryAbi,
          functionName: 'owner',
          args: [namehash(child)],
        })
      : (
          await publicClient.readContract({
            address: V1_NAME_WRAPPER,
            abi: wrapperAbi,
            functionName: 'getData',
            args: [BigInt(namehash(child))],
          })
        )[0]
  if (actualChildOwner.toLowerCase() !== childOwner.toLowerCase()) {
    throw new Error(
      `${child} has owner ${actualChildOwner}, expected ${childOwner}`,
    )
  }

  const isControl = authority === 'parent-only-control'
  return {
    id,
    shape,
    authority,
    parent,
    child,
    parentOwner: parentOwner.address,
    childOwner,
    url: `${PORTAL_APP_URL}/${parent}/subnames`,
    expected: isControl
      ? 'Delete must be unavailable; only the emancipated child holder can delete.'
      : `A Delete action for ${child} must be visible to the connected child holder and complete successfully.`,
    legacyCases,
  }
}

async function main() {
  for (const account of [connected, alternate]) {
    await testClient.setCode({ address: account.address, bytecode: '0x' })
    await testClient.setBalance({
      address: account.address,
      value: 10_000n * 10n ** 18n,
    })
  }

  // Seed sequentially. Registration also reserves each label in V2 through an
  // impersonated registrar, so parallel calls would share its transaction
  // nonce and make an otherwise deterministic manual setup flaky.
  const cases = [
    await seed('unwrapped-child', 'unwrapped', 'child-only', ['L040']),
    await seed('wrapped-child', 'wrapped', 'child-only', ['L043', 'L192']),
    await seed('emancipated-both', 'emancipated', 'both', ['L045']),
    await seed('emancipated-child', 'emancipated', 'child-only', [
      'L046',
      'L198',
    ]),
    await seed(
      'emancipated-parent-control',
      'emancipated',
      'parent-only-control',
      ['L044'],
    ),
  ]
  await waitForBignameBlock()

  const manifest = {
    finding: 'G02',
    generatedAt: new Date().toISOString(),
    portal: PORTAL_APP_URL,
    connectedWallet: connected.address,
    alternateWallet: alternate.address,
    cases,
  }
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  const output = new URL('../test-results/g02-manual-env.json', import.meta.url)
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('\nG02 manual environment ready')
  console.log(`Connected mock wallet: ${connected.address}`)
  console.table(
    cases.map(({ id, shape, authority, parent, child, legacyCases }) => ({
      id,
      shape,
      authority,
      parent,
      child,
      legacy: legacyCases.join(', '),
    })),
  )
  for (const item of cases) console.log(`${item.id}: ${item.url}`)
  console.log(`Manifest: ${output.pathname}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
