/**
 * R-CH — is `contenthash` carried through migration?
 *
 * The migration's Profile type is only { texts, addresses }, and contenthash
 * appears nowhere in packages/migration or the migration feature. The record
 * presets now write one, so this turns a code-reading argument into an
 * observation: write a contenthash on V1, migrate, read the V2 resolver.
 */
import { namehash } from 'viem/ens'
import * as H from './qa2-lib.mjs'

const V1_RECORD_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const EXPECTED_CH =
  '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f'

const contenthashCalldata = (node) =>
  `0xbc1c58d1${node.slice(2)}` // contenthash(bytes32)

const readContenthash = async (resolver, node) => {
  const raw = await H.rpc('eth_call', [
    { to: resolver, data: contenthashCalldata(node) },
    'latest',
  ])
  if (!raw || raw === '0x') return null
  // bytes: offset(32) + len(32) + data
  const len = Number.parseInt(raw.slice(66, 130), 16)
  if (!len) return null
  return `0x${raw.slice(130, 130 + len * 2)}`
}

// ETHRegistry.getResolver takes the LABEL as a string, not a token id.
const v2ResolverAbi = [
  {
    name: 'getResolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'label', type: 'string' }],
    outputs: [{ type: 'address' }],
  },
]

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, 'Records')
  const label = (seeded ?? '').split(' ')[0].replace('.eth', '')
  const name = `${label}.eth`
  const node = namehash(name)
  console.log('seeded:', seeded, '\nnode  :', node)

  const v1Ch = await readContenthash(V1_RECORD_RESOLVER, node)
  console.log('\n--- BEFORE migration ---')
  console.log('V1 resolver contenthash:', v1Ch)
  console.log('matches fixture        :', v1Ch === EXPECTED_CH)
  if (v1Ch !== EXPECTED_CH) {
    console.log('Fixture did not land — aborting, this would not be a valid test.')
    process.exitCode = 1
  } else {
    await H.gotoMigrationAll(page, drawer)
    const r = await H.runMigration(page)
    console.log('\nmigration:', r.ok ? 'SUCCESS' : 'FAIL')
    if (!r.ok) throw new Error('migration failed; R-CH inconclusive')

    // Which resolver does V2 now point at?
    const v2Resolver = await H.client
      .readContract({
        address: app.contracts.ethRegistry,
        abi: v2ResolverAbi,
        functionName: 'getResolver',
        args: [label],
      })
      .catch((e) => `ERR ${String(e).slice(0, 80)}`)
    console.log('\n--- AFTER migration ---')
    console.log('V2 resolver for the name:', v2Resolver)
    console.log('(V1 record resolver was  :', V1_RECORD_RESOLVER, ')')

    if (typeof v2Resolver === 'string' && v2Resolver.startsWith('0x')) {
      const v2Ch = await readContenthash(v2Resolver, node)
      console.log('V2 resolver contenthash :', v2Ch)
      console.log('\n=== R-CH verdict ===')
      console.log(
        v2Ch === EXPECTED_CH
          ? 'CARRIED — contenthash survived migration'
          : `LOST — contenthash is ${v2Ch === null ? 'absent' : 'different'} on V2 while texts/addresses were replayed`,
      )
    }

    // Cross-check what DID survive, so "lost" is specific to contenthash.
    await page.goto(`${H.BASE}/${name}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(8000)
    await H.dismissVerifyModalAnywhere(page)
    await page.waitForTimeout(10000)
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    console.log('\nprofile shows description :', body.includes('QA migration fixture'))
    console.log('profile shows eth address :', body.includes('0x7099'))
  }
  if (logs.length) console.log(`\nconsole errors: ${logs.length}`)
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
