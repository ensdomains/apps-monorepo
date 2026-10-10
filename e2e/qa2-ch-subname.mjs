/**
 * Does the contenthash loss also hit SUBNAMES?
 *
 * The 2LD case is confirmed lost. A migrated child does not live in the ETH
 * registry — it lives in the parent's WrapperRegistry — so its V2 resolver has
 * to be resolved in two hops:
 *   ETHRegistry.getSubregistry(parentLabel) -> WrapperRegistry
 *   WrapperRegistry.getResolver(childLabel) -> resolver
 * Which also independently confirms the descendant routing actually happened.
 */
import { namehash } from 'viem/ens'
import * as H from './qa2-lib.mjs'

const V1_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const EXPECTED =
  '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f'

const registryAbi = [
  {
    name: 'getResolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'label', type: 'string' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'getSubregistry',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'label', type: 'string' }],
    outputs: [{ type: 'address' }],
  },
]

const decodeBytes = (raw) => {
  if (!raw || raw === '0x') return null
  const len = Number.parseInt(raw.slice(66, 130), 16)
  return len ? `0x${raw.slice(130, 130 + len * 2)}` : null
}
const readCh = async (resolver, node) =>
  decodeBytes(
    await H.rpc('eth_call', [
      { to: resolver, data: `0xbc1c58d1${node.slice(2)}` },
      'latest',
    ]),
  )

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, 'Subname+Rec')
  const label = (seeded ?? '').split(' ')[0].replace('.eth', '')
  const childLabel = `sub-${label}`
  const parentName = `${label}.eth`
  const childName = `${childLabel}.${label}.eth`
  console.log('seeded:', seeded)

  console.log('\n--- BEFORE (V1 resolver) ---')
  for (const n of [parentName, childName]) {
    console.log(
      `  ${n}: ${(await readCh(V1_RESOLVER, namehash(n))) === EXPECTED ? 'contenthash present' : 'MISSING'}`,
    )
  }

  await H.gotoMigrationAll(page, drawer, 20000)
  const r = await H.runMigration(page, 600000)
  console.log('\nmigration:', r.ok ? 'SUCCESS' : 'FAIL')
  if (!r.ok) throw new Error('migration failed; inconclusive')

  const read = (address, fn, arg) =>
    H.client
      .readContract({
        address,
        abi: registryAbi,
        functionName: fn,
        args: [arg],
      })
      .catch((e) => `ERR ${String(e).slice(0, 70)}`)

  console.log('\n--- AFTER (V2) ---')
  const parentResolver = await read(
    app.contracts.ethRegistry,
    'getResolver',
    label,
  )
  console.log('parent V2 resolver   :', parentResolver)
  if (typeof parentResolver === 'string' && parentResolver.startsWith('0x')) {
    const ch = await readCh(parentResolver, namehash(parentName))
    console.log(
      `parent contenthash   : ${ch ?? 'null'}  -> ${ch === EXPECTED ? 'CARRIED' : 'LOST'}`,
    )
  }

  const wrapperRegistry = await read(
    app.contracts.ethRegistry,
    'getSubregistry',
    label,
  )
  console.log(
    '\nparent subregistry   :',
    wrapperRegistry,
    '(WrapperRegistry for descendants)',
  )
  if (
    typeof wrapperRegistry === 'string' &&
    wrapperRegistry.startsWith('0x') &&
    !/^0x0+$/.test(wrapperRegistry)
  ) {
    const childResolver = await read(wrapperRegistry, 'getResolver', childLabel)
    console.log('child V2 resolver    :', childResolver)
    if (typeof childResolver === 'string' && childResolver.startsWith('0x')) {
      const ch = await readCh(childResolver, namehash(childName))
      console.log(
        `child contenthash    : ${ch ?? 'null'}  -> ${ch === EXPECTED ? 'CARRIED' : 'LOST'}`,
      )
    }
  } else {
    console.log(
      '  no WrapperRegistry resolved — descendant routing did not create one?',
    )
  }

  // Sanity: the text record should have survived on both, so "LOST" is specific.
  await page.goto(`${H.BASE}/${childName}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  await H.dismissVerifyModalAnywhere(page)
  await page.waitForTimeout(10000)
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log(
    '\nchild profile shows description:',
    body.includes('QA migration fixture'),
  )

  if (logs.length) console.log(`\nconsole errors: ${logs.length}`)
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
