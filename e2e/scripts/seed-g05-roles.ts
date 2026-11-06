/** Seed split-role V1 names for manual testing of replacement finding G05. */
import { mkdir, writeFile } from 'node:fs/promises'
import { bytesToHex, labelhash, namehash, parseAbi } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
} from '../fixtures/makeV1Name.js'
import { splitController, splitRegistrant } from '../fixtures/v1-tails.js'
import { publicClient, testClient } from '../helpers/anvil-client.js'
import { waitForBignameBlock } from '../helpers/bigname-sync.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const MNEMONIC = 'test test test test test test test test test test test junk'
const suffix = Date.now().toString(36)

const accountAt = (addressIndex: number) => {
  const hd = mnemonicToAccount(MNEMONIC, { addressIndex }).getHdKey()
  if (!hd.privateKey)
    throw new Error(`No private key for account ${addressIndex}`)
  return privateKeyToAccount(bytesToHex(hd.privateKey))
}
const connected = accountAt(0)
const alternate = accountAt(1)
const proposed = accountAt(2)

const registrarAbi = parseAbi([
  'function ownerOf(uint256) view returns (address)',
])
const registryAbi = parseAbi(['function owner(bytes32) view returns (address)'])

type Shape = 'manager-only' | 'owner-only' | 'owner-and-manager-control'

async function readRoles(name: string) {
  const label = name.replace(/\.eth$/, '')
  const [registrant, manager] = await Promise.all([
    publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: registrarAbi,
      functionName: 'ownerOf',
      args: [BigInt(labelhash(label))],
    }),
    publicClient.readContract({
      address: V1_ENS_REGISTRY,
      abi: registryAbi,
      functionName: 'owner',
      args: [namehash(name)],
    }),
  ])
  return { registrant, manager }
}

async function seed(shape: Shape) {
  const name = await createMakeV1Name({ userAccount: connected })({
    label: `g05-${shape}-${suffix}`,
    type: 'unwrapped',
  })
  if (shape === 'manager-only')
    await splitRegistrant(name, connected, alternate.address)
  if (shape === 'owner-only')
    await splitController(name, connected, alternate.address)

  const roles = await readRoles(name)
  const expected =
    shape === 'manager-only'
      ? 'Connected manager can assign Manager to the proposed wallet while Registrant stays alternate.'
      : shape === 'owner-only'
        ? 'Connected owner can independently change Registrant or Manager while the unselected role stays alternate.'
        : 'Control: connected wallet holds both roles; full Transfer intentionally moves both.'
  return {
    shape,
    name,
    ...roles,
    connectedWallet: connected.address,
    alternateWallet: alternate.address,
    proposedWallet: proposed.address,
    explorerOwnershipUrl: `${PORTAL_APP_URL}/${name}/ownership`,
    managerUrl: `${MANAGER_APP_URL}/${name}`,
    expected,
    legacyCases:
      shape === 'manager-only'
        ? ['L094', 'L174']
        : shape === 'owner-only'
          ? ['L175', 'L176']
          : [],
  }
}

async function main() {
  for (const account of [connected, alternate, proposed]) {
    await testClient.setCode({ address: account.address, bytecode: '0x' })
    await testClient.setBalance({
      address: account.address,
      value: 10_000n * 10n ** 18n,
    })
  }

  const cases = [
    await seed('manager-only'),
    await seed('owner-only'),
    await seed('owner-and-manager-control'),
  ]
  await waitForBignameBlock()

  const manifest = {
    finding: 'G05',
    generatedAt: new Date().toISOString(),
    connectedWallet: connected.address,
    alternateWallet: alternate.address,
    proposedWallet: proposed.address,
    cases,
  }
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  const output = new URL('../test-results/g05-manual-env.json', import.meta.url)
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('\nG05 manual environment ready')
  console.log(`Connected wallet: ${connected.address}`)
  console.log(`Alternate holder: ${alternate.address}`)
  console.log(`Proposed replacement: ${proposed.address}`)
  console.table(
    cases.map((item) => ({
      shape: item.shape,
      name: item.name,
      registrant: item.registrant,
      manager: item.manager,
      legacy: item.legacyCases.join(', '),
    })),
  )
  for (const item of cases) {
    console.log(`\n${item.shape}`)
    console.log(`  Explorer: ${item.explorerOwnershipUrl}`)
    console.log(`  Manager:  ${item.managerUrl}`)
  }
  console.log(`\nManifest: ${output.pathname}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
