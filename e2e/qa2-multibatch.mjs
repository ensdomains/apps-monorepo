/**
 * G1 — gas-partitioned multi-batch migration.
 *
 * Planning caps an atomic batch at TARGET_GAS = 20,000,000 and execution at
 * EXECUTION_TARGET_GAS = 15,000,000 (batchMigrate.constants.ts), so enough names
 * in one selection must split into >1 batch. Oracle:
 *   - dialog rows read "Upgrade batch i of n" with n > 1
 *   - footer adds "split into n gas-safe atomic batches"
 *   - N = D + approvals + n  (+ cleanup, not applicable here)
 *   - EOA nonce delta == N
 *
 * Usage: node e2e/qa2-multibatch.mjs [count=28]
 */
import * as H from './qa2-lib.mjs'

const COUNT = Number(process.argv[2] ?? 28)

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)

  console.log(`seeding ${COUNT} unwrapped names...`)
  for (let i = 0; i < COUNT; i++) {
    const label = await H.seedName(page, drawer, 'Unwrapped')
    if ((i + 1) % 5 === 0 || i === COUNT - 1) {
      console.log(`  ${i + 1}/${COUNT} (${label})`)
    }
  }
  const active = await H.activeCount(drawer)
  console.log('active names:', active)

  const before = await H.readChainState(app)
  console.log('state before:', {
    hca: before.hcaDeployed,
    base: before.baseRegistrarApproved,
    wrap: before.nameWrapperApproved,
    reg: before.ethRegistryApproved,
  })

  await H.gotoMigrationAll(page, drawer, 25000)
  const summary = await H.readSummary(page)
  const dialog = await H.readStepsDialog(page)

  const batchRows = dialog.kinds.filter((k) => k.startsWith('upgrade-batch-'))
  const nBatches = batchRows.length
    ? Number(batchRows[0].split('/')[1])
    : dialog.kinds.includes('upgrade')
      ? 1
      : 0

  console.log('\nrendered    :', summary.confirmations, `fee=${summary.fee}`)
  console.log('batch note  :', summary.batchNote, '(footer)')
  console.log('batch rows  :', nBatches, batchRows)
  dialog.steps.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.slice(0, 84)}`)
  })

  const expected = H.predict({
    state: before,
    unwrapped: active,
    batches: nBatches || 1,
  })
  console.log(
    '\n=== O1 (batch count taken from the render; the rest predicted) ===',
  )
  console.log('predicted N :', expected.n, expected.rows)
  console.log('rendered  N :', summary.confirmations)
  console.log('count match :', summary.confirmations === expected.n)
  console.log(
    'rows match  :',
    JSON.stringify(dialog.kinds) === JSON.stringify(expected.rows),
  )
  console.log(
    'multi-batch :',
    nBatches > 1 ? `YES (${nBatches})` : `NO (${nBatches}) — need more names`,
  )
  console.log(
    'footer note agrees with rows:',
    String(summary.batchNote ?? '') === String(nBatches > 1 ? nBatches : ''),
  )

  if (nBatches > 1) {
    const nb = await H.nonceOf()
    const r = await H.runMigration(page, 900000)
    const na = await H.nonceOf()
    console.log(
      '\nmigration   :',
      r.ok ? 'SUCCESS' : 'FAIL',
      r.timedOut ? '(timeout)' : '',
    )
    if (!r.ok) console.log('body tail:', r.body.slice(-900))
    console.log(
      `O2 nonce    : ${nb} -> ${na} = ${na - nb} (predicted ${expected.n})`,
    )
    const after = await H.readChainState(app)
    console.log('state after :', {
      hca: after.hcaDeployed,
      base: after.baseRegistrarApproved,
      wrap: after.nameWrapperApproved,
      reg: after.ethRegistryApproved,
    })
  } else {
    console.log(
      '\nSkipping the run: only one batch, so this does not exercise G1.',
    )
  }

  if (logs.length)
    console.log(
      `\nconsole errors (${logs.length}):\n` + logs.slice(0, 6).join('\n'),
    )
} catch (e) {
  console.error('FAILED:', e.message)
  await page
    .screenshot({ path: '/tmp/qa2-multibatch-fail.png' })
    .catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
