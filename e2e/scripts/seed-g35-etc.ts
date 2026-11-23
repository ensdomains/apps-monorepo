/** Seed a wrapped V1 name with a legacy coin-type 61 ETC record for G35. */
import { mkdir, writeFile } from 'node:fs/promises'
import { bytesToHex, namehash, parseAbi } from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'

import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../fixtures/makeV1Name.js'
import { RESOLVER_ABI } from '../fixtures/v1-records.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import {
  defaults,
  profileResolver,
  seedProfileRecords,
} from '../projects/parity/helpers/profile-records.js'

const MNEMONIC = 'test test test test test test test test test test test junk'
const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const hd = mnemonicToAccount(MNEMONIC, { addressIndex: 0 }).getHdKey()
if (!hd.privateKey) throw new Error('Missing local account 0 private key')
const owner = privateKeyToAccount(bytesToHex(hd.privateKey))

async function main() {
  await testClient.setCode({ address: owner.address, bytecode: '0x' })
  await testClient.setBalance({
    address: owner.address,
    value: 10_000n * 10n ** 18n,
  })

  const suffix = Date.now().toString(36)
  const name = await createMakeV1Name({ userAccount: owner })({
    label: `g35-legacy-etc-${suffix}`,
    type: 'unwrapped',
  })
  const legacyResolver = await profileResolver('legacy', owner)
  const records = defaults(owner.address)
  await seedProfileRecords(name, owner, false, records, {
    resolver: legacyResolver,
  })
  const approval = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      account: owner,
      address: V1_BASE_REGISTRAR,
      abi: parseAbi(['function setApprovalForAll(address,bool)']),
      functionName: 'setApprovalForAll',
      args: [V1_NAME_WRAPPER, true],
    }),
  })
  if (approval.status !== 'success') throw new Error('Wrapper approval failed')
  const wrap = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      account: owner,
      address: V1_NAME_WRAPPER,
      abi: parseAbi(['function wrapETH2LD(string,address,uint16,address)']),
      functionName: 'wrapETH2LD',
      args: [name.split('.')[0], owner.address, 0, legacyResolver],
    }),
  })
  if (wrap.status !== 'success') throw new Error('Wrapping fixture failed')

  const legacyEtc = records.addresses?.find(({ coinType }) => coinType === 61)
  if (!legacyEtc) throw new Error('Fixture is missing ETC coin type 61')
  const readback = await publicClient.readContract({
    address: legacyResolver,
    abi: RESOLVER_ABI,
    functionName: 'addr',
    args: [namehash(name), 61n],
  })
  if (readback.toLowerCase() !== legacyEtc.value.toLowerCase())
    throw new Error(`ETC type 61 readback mismatch: ${readback}`)

  const manifest = {
    finding: 'G35',
    generatedAt: new Date().toISOString(),
    name,
    owner: owner.address,
    legacyResolver,
    publicResolver: V1_PUBLIC_RESOLVER,
    legacyEtc: {
      coinType: 61,
      displayName: 'ETCLEGACY',
      value: legacyEtc.value,
    },
    modernEtc: {
      coinType: 2_147_483_709,
      hexadecimal: '0x8000003d',
      displayName: 'ETC',
    },
    manualTest: {
      prerequisite:
        'The starting legacy resolver is intentionally incompatible with wrapped-name writes. Do not add records before replacing it.',
      steps: [
        `Open Resolver and replace ${legacyResolver} with ${V1_PUBLIC_RESOLVER}.`,
        'After the resolver transaction succeeds, open Edit records.',
        'Search for ETCLEGACY and try to recreate coin type 61. The ETC option shown by the picker is the distinct modern coin type 2147483709.',
      ],
    },
    records,
    explorerRecordsUrl: `${PORTAL_APP_URL}/${name}/records`,
    explorerResolverUrl: `${PORTAL_APP_URL}/${name}/resolver`,
    explorerEditRecordsUrl: `${PORTAL_APP_URL}/${name}/edit-records`,
    managerUrl: `${MANAGER_APP_URL}/${name}`,
  }
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  const output = new URL('../test-results/g35-manual-env.json', import.meta.url)
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('\nG35 manual environment ready')
  console.log(`Name: ${name}`)
  console.log(`Owner: ${owner.address}`)
  console.log(`Legacy resolver: ${legacyResolver}`)
  console.log(`Replacement public resolver: ${V1_PUBLIC_RESOLVER}`)
  console.log(`Legacy ETC: type 61 = ${legacyEtc.value}`)
  console.log(`Explorer records: ${manifest.explorerRecordsUrl}`)
  console.log(`Explorer resolver: ${manifest.explorerResolverUrl}`)
  console.log(`Explorer editor: ${manifest.explorerEditRecordsUrl}`)
  console.log(
    'Manual test: change to the replacement public resolver before editing records; writes to the starting legacy resolver intentionally revert once wrapped.',
  )
  console.log(`Manager: ${manifest.managerUrl}`)
  console.log(`Manifest: ${output.pathname}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
