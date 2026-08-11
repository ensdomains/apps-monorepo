/**
 * Does the migration list ever contain a SUBNAME?
 *
 * The `Emancipated` preset creates a real on-chain emancipated child
 * (`sub-<label>.<label>.eth`, PARENT_CANNOT_CONTROL|CANNOT_UNWRAP) beneath a
 * locked 2LD, but the panel's fetch interceptor only injects `${label}.eth`
 * domains into getNamesForAddress. So A8 may have migrated the PARENT only,
 * leaving the PR's descendant routing and parent-first ordering untested.
 */
import { namehash } from 'viem/ens'
import * as H from './qa2-lib.mjs'

const ownerOf1155 = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
]

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, 'Emancipated')
  const parent = (seeded ?? '').split(' ')[0].replace('.eth', '')
  const child = `sub-${parent}.${parent}.eth`
  console.log('seeded parent   :', `${parent}.eth`)
  console.log('expected child  :', child)

  // Does the child actually exist on-chain in the V1 NameWrapper?
  const childOwner = await H.client
    .readContract({
      address: H.V1_NAME_WRAPPER,
      abi: ownerOf1155,
      functionName: 'ownerOf',
      args: [BigInt(namehash(child))],
    })
    .catch((e) => `ERR ${String(e).slice(0, 60)}`)
  console.log('child on-chain owner (NameWrapper):', childOwner)
  console.log('  == wallet?', String(childOwner).toLowerCase() === H.WALLET.toLowerCase())

  await H.gotoMigrationAll(page, drawer)
  const summary = await H.readSummary(page)
  const body = summary.body

  // What names does the selection step actually list?
  const listed = [...new Set([...body.matchAll(/([a-z0-9-]+\.)?dev\d{3,5}\.eth/gi)].map((m) => m[0]))]
  console.log('\nnames listed on /migration:', listed.length ? listed.join(', ') : '(none matched)')
  console.log('CTA                        :', summary.upgradeLabel)
  console.log('child listed?              :', body.includes(`sub-${parent}`))
  console.log('parent listed?             :', body.includes(parent))

  const rows = await page.locator('button[aria-pressed]').count()
  console.log('selectable rows            :', rows)

  console.log('\n=== conclusion ===')
  if (!body.includes(`sub-${parent}`)) {
    console.log('The emancipated CHILD is NOT offered for migration — only the parent 2LD.')
    console.log('=> subname migration, descendant WrapperRegistry routing and parent-first')
    console.log('   hierarchy ordering are ALL untested; the tooling cannot reach them.')
  } else {
    console.log('Child IS offered — hierarchy scenarios are reachable.')
  }

  if (logs.length) console.log(`\nconsole errors (${logs.length}):\n` + logs.slice(0, 3).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
