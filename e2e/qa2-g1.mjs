/**
 * G1 — gas-partitioned multi-batch migration, topping up the existing active set.
 *
 * Measured on this fork at 1 gwei: ~80k fixed overhead + ~195k gas per name
 * (1 name = 0.000275 ETH, 28 names = 0.00554 ETH). Planning caps a batch at
 * TARGET_GAS = 20,000,000, so ~102 names are needed before the plan splits.
 * 28 was not close — hence the top-up rather than a fresh seed.
 *
 * Usage: node e2e/qa2-g1.mjs [target=110]
 */
import * as H from './qa2-lib.mjs'

const TARGET = Number(process.argv[2] ?? 110)

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)

  let have = await H.activeCount(drawer)
  console.log(`active names already seeded: ${have}; topping up to ${TARGET}`)
  while (have < TARGET) {
    await H.seedName(page, drawer, 'Unwrapped')
    have = await H.activeCount(drawer)
    if (have % 10 === 0) console.log(`  ${have}/${TARGET}`)
  }
  console.log('active names:', have)

  const before = await H.readChainState(app)
  console.log('state before:', {
    hca: before.hcaDeployed, base: before.baseRegistrarApproved,
    wrap: before.nameWrapperApproved, reg: before.ethRegistryApproved,
  })

  await H.gotoMigrationAll(page, drawer, 40000)
  const summary = await H.readSummary(page)
  const dialog = await H.readStepsDialog(page)

  const batchRows = dialog.kinds.filter((k) => k.startsWith('upgrade-batch-'))
  const nBatches = batchRows.length
    ? Number(batchRows[0].split('/')[1])
    : dialog.kinds.includes('upgrade')
      ? 1
      : 0

  console.log('\nrendered N  :', summary.confirmations, `fee=${summary.fee}`)
  console.log('footer note :', summary.batchNote)
  console.log('batch rows  :', nBatches, batchRows.slice(0, 8))
  dialog.steps.slice(0, 10).forEach((s, i) => console.log(`   ${i + 1}. ${s.slice(0, 80)}`))

  const expected = H.predict({ state: before, unwrapped: have, batches: nBatches || 1 })
  console.log('\n=== O1 ===')
  console.log('predicted N :', expected.n, expected.rows.slice(0, 8))
  console.log('count match :', summary.confirmations === expected.n)
  console.log('rows match  :', JSON.stringify(dialog.kinds) === JSON.stringify(expected.rows))
  console.log('multi-batch :', nBatches > 1 ? `YES (${nBatches})` : `NO (${nBatches})`)
  console.log('footer n === batch-row n:', String(summary.batchNote ?? '') === String(nBatches > 1 ? nBatches : ''))

  if (nBatches > 1) {
    const nb = await H.nonceOf()
    const r = await H.runMigration(page, 1500000)
    const na = await H.nonceOf()
    console.log('\nmigration   :', r.ok ? 'SUCCESS' : 'FAIL', r.timedOut ? '(timeout)' : '')
    if (!r.ok) console.log('body tail:', r.body.slice(-1000))
    console.log(`O2 nonce    : ${nb} -> ${na} = ${na - nb} (predicted ${expected.n})`)
    console.log('O2 match    :', na - nb === expected.n)
  } else {
    console.log(`\nStill one batch at ${have} names — fee ${summary.fee} ETH. Not exercising G1.`)
  }

  if (logs.length) console.log(`\nconsole errors (${logs.length}):\n` + logs.slice(0, 5).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-g1-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
