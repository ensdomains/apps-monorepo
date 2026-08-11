/** A1: 1 unwrapped name, fresh HCA, no approvals. Oracle: N = 3. */
import * as H from './qa2-lib.mjs'

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.connectAndOpenDevtools(page)
  const app = await H.readAppContracts(page)
  console.log('HCA          :', app.hca)
  console.log('MigrationHelper:', app.contracts.migrationHelper)

  const before = await H.readChainState(app)
  console.log('\n--- chain state BEFORE ---')
  console.log(before)

  await H.clearActiveNames(page, drawer)
  const label = await H.seedName(page, drawer, 'Unwrapped')
  console.log('\nseeded:', label)

  const expected = H.predict({ state: before, unwrapped: 1 })
  console.log('\nO1 predicted:', expected.n, expected.rows)

  await H.gotoMigrationAll(page, drawer)
  const summary = await H.readSummary(page)
  console.log('\nrendered summary:', {
    fee: summary.fee,
    confirmations: summary.confirmations,
    upgradeLabel: summary.upgradeLabel,
    batchNote: summary.batchNote,
    noEligible: summary.noEligible,
  })

  const dialog = await H.readStepsDialog(page)
  console.log('dialog rows:', dialog.kinds)
  dialog.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 90)}`))

  console.log('\n=== O1 verdict ===')
  console.log('predicted N   :', expected.n)
  console.log('rendered N    :', summary.confirmations)
  console.log('rows match    :', JSON.stringify(dialog.kinds) === JSON.stringify(expected.rows))
  console.log('  predicted rows:', expected.rows)
  console.log('  rendered  rows:', dialog.kinds)

  const result = await H.runMigration(page)
  console.log('\nmigration ok  :', result.ok, result.timedOut ? '(TIMED OUT)' : '')
  if (!result.ok) console.log('body tail:', result.body.slice(-700))

  const after = await H.readChainState(app)
  console.log('\n--- chain state AFTER ---')
  console.log(after)
  console.log('\n=== O2 verdict (nonce delta === confirmations) ===')
  console.log('nonce before  :', before.nonce)
  console.log('nonce after   :', after.nonce)
  console.log('delta         :', after.nonce - before.nonce, 'vs predicted', expected.n)

  if (logs.length) console.log('\nconsole errors:\n' + logs.slice(0, 12).join('\n'))
} catch (e) {
  console.error('\nFAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-a1-fail.png', fullPage: false }).catch(() => {})
  console.error('screenshot: /tmp/qa2-a1-fail.png')
  if (logs.length) console.error('console:\n' + logs.slice(0, 12).join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
