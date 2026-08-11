/**
 * Record-kind migration coverage.
 *
 * The fixture now writes every kind a V1 PublicResolver can hold. Migration's
 * `Profile` is only { texts, addresses }, so texts and coin addresses are
 * expected to be CARRIED and contenthash/ABI/pubkey/interface expected to be
 * LOST. This proves each one instead of inferring it from the type.
 *
 *   node e2e/qa2-record-kinds.mjs [Records|Subname+Rec]
 */
import { namehash } from 'viem/ens'
import * as H from './qa2-lib.mjs'

const preset = process.argv[2] ?? 'Records'
const V1_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'

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

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, preset)
  const label = (seeded ?? '').split(' ')[0].replace('.eth', '')
  const parentName = `${label}.eth`
  console.log('seeded:', seeded)

  // Read every kind through the panel's own helper, in-page, so the probe and
  // the fixture share one definition of what was written.
  // expectMigrated: on the V2 side, social handles are normalised by migration
  // (@ens_qa -> ens_qa), so compare against the post-migration expectation or the
  // transform reads as a dropped record.
  const probe = async (node, resolver, expectMigrated = false) =>
    page.evaluate(
      async ([n, r, em]) => {
        const m = await import(
          '/@fs/Users/sg/ens/apps-monorepo/packages/dev-migration-tool/src/MigrationTestPanel.helpers.ts'
        )
        return m.readAllV1Records('http://127.0.0.1:8545', n, r, em)
      },
      [node, resolver, expectMigrated],
    )

  const before = await probe(namehash(parentName), V1_RESOLVER)
  console.log('\n--- V1 fixture (before migration) ---')
  for (const r of before)
    console.log(`  ${r.kind.padEnd(18)} ${r.present ? 'present' : 'MISSING'}`)
  if (before.some((r) => !r.present)) {
    console.log('\nFixture incomplete — aborting (seeding should have thrown).')
    process.exitCode = 1
  } else {
    await H.gotoMigrationAll(page, drawer, 20000)
    const res = await H.runMigration(page, 600000)
    console.log('\nmigration:', res.ok ? 'SUCCESS' : 'FAIL')
    if (!res.ok) throw new Error('migration failed; coverage inconclusive')

    const v2Resolver = await H.client
      .readContract({
        address: app.contracts.ethRegistry,
        abi: registryAbi,
        functionName: 'getResolver',
        args: [label],
      })
      .catch((e) => `ERR ${String(e).slice(0, 60)}`)
    console.log('V2 resolver:', v2Resolver)

    const after = await probe(namehash(parentName), v2Resolver, true)
    console.log(
      `\n${'='.repeat(64)}\nRECORD-KIND COVERAGE — ${parentName}\n${'='.repeat(64)}`,
    )
    console.log('| kind | in Profile? | on V1 | on V2 | outcome |')
    console.log('|------|-------------|-------|-------|---------|')
    let surprises = 0
    for (const b of before) {
      const a = after.find((x) => x.kind === b.kind)
      const carried = Boolean(a?.present)
      const expected = b.migratable
      const outcome = carried ? 'CARRIED' : 'LOST'
      const flag = carried === expected ? '' : '  <-- UNEXPECTED'
      if (carried !== expected) surprises++
      console.log(
        `| ${b.kind.padEnd(16)} | ${String(expected).padEnd(11)} | yes | ${carried ? 'yes' : 'no '} | ${outcome}${flag} |`,
      )
    }
    console.log(
      surprises === 0
        ? '\nAll kinds behaved as the Profile type predicts: texts + coin addresses carried, everything else lost.'
        : `\n${surprises} kind(s) did NOT match the prediction — see UNEXPECTED above.`,
    )
    const lost = before
      .filter((b) => !after.find((x) => x.kind === b.kind)?.present)
      .map((b) => b.kind)
    console.log(
      `\nData lost by migration: ${lost.length ? lost.join(', ') : 'none'}`,
    )
  }
  if (logs.length) console.log(`\nconsole errors: ${logs.length}`)
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
