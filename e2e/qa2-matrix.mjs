/**
 * PR #1017 core matrix A1-A8, run in ONE session so HCA + approval state
 * carries over — that carry-over is what makes the counts move.
 *
 * Each scenario: read chain state -> predict (O1) -> render -> compare rows and
 * count -> run -> compare EOA nonce delta (O2) -> re-read chain state.
 */
import * as H from './qa2-lib.mjs'

const SCENARIOS = [
  {
    id: 'A1',
    presets: ['Unwrapped'],
    unwrapped: 1,
    note: 'fresh HCA, no approvals',
  },
  {
    id: 'A2',
    presets: ['Unwrapped'],
    unwrapped: 1,
    note: 'per-token consumed by A1 -> must ask again',
  },
  {
    id: 'A3',
    presets: ['Unwrapped', 'Unwrapped'],
    unwrapped: 2,
    note: '2 missing tokens -> operator form',
  },
  {
    id: 'A4',
    presets: ['Unwrapped'],
    unwrapped: 1,
    note: 'operator approval persists -> no approval row',
  },
  {
    id: 'A5',
    presets: ['Wrapped'],
    wrapped: 1,
    note: 'NameWrapper operator absent',
  },
  {
    id: 'A6',
    presets: ['Locked'],
    wrapped: 1,
    note: 'NameWrapper operator persists',
  },
  {
    id: 'A7',
    presets: ['Wrapped', 'Unwrapped'],
    unwrapped: 1,
    wrapped: 1,
    note: 'both operators persist',
  },
  {
    id: 'A8',
    presets: ['Emancipated'],
    wrapped: 1,
    note: 'locked child with PCC',
  },
]

const results = []
const { browser, page, logs } = await H.launch({ headless: true })

try {
  await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  console.log('HCA            :', app.hca)
  console.log('MigrationHelper:', app.contracts.migrationHelper)

  for (const sc of SCENARIOS) {
    console.log(
      `\n${'='.repeat(72)}\n${sc.id} — ${sc.presets.join(' + ')} — ${sc.note}\n${'='.repeat(72)}`,
    )
    const row = { id: sc.id, note: sc.note }
    try {
      const d = await H.openMigrationPanel(page)
      await H.clearActiveNames(page, d)
      const labels = []
      for (const p of sc.presets) labels.push(await H.seedName(page, d, p))
      row.names = labels
      console.log('seeded:', labels.join(', '))

      // State read AFTER seeding so the O1 inputs and the O2 baseline agree.
      const before = await H.readChainState(app)
      console.log('state before:', {
        hca: before.hcaDeployed,
        base: before.baseRegistrarApproved,
        wrap: before.nameWrapperApproved,
        reg: before.ethRegistryApproved,
      })

      const expected = H.predict({
        state: before,
        unwrapped: sc.unwrapped ?? 0,
        wrapped: sc.wrapped ?? 0,
      })
      row.predicted = expected.n
      row.predictedRows = expected.rows
      console.log('O1 predicted:', expected.n, expected.rows)

      await H.gotoMigrationAll(page, d)
      const summary = await H.readSummary(page)
      const dialog = await H.readStepsDialog(page)
      row.rendered = summary.confirmations
      row.renderedRows = dialog.kinds
      row.fee = summary.fee
      row.batchNote = summary.batchNote
      console.log(
        'rendered    :',
        summary.confirmations,
        dialog.kinds,
        `fee=${summary.fee}`,
      )
      dialog.steps.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.slice(0, 84)}`)
      })

      row.countMatch = summary.confirmations === expected.n
      row.rowsMatch =
        JSON.stringify(dialog.kinds) === JSON.stringify(expected.rows)

      const nonceBefore = await H.nonceOf()
      const result = await H.runMigration(page)
      const nonceAfter = await H.nonceOf()
      row.ok = result.ok
      row.nonceDelta = nonceAfter - nonceBefore
      row.o2Match = row.nonceDelta === expected.n
      console.log(
        `migration   : ${result.ok ? 'SUCCESS' : 'FAIL'}${result.timedOut ? ' (timeout)' : ''}`,
      )
      if (!result.ok) {
        row.failTail = result.body.slice(-500)
        console.log('body tail   :', row.failTail)
      }
      console.log(
        `O2 nonce    : ${nonceBefore} -> ${nonceAfter} = ${row.nonceDelta} (predicted ${expected.n})`,
      )

      const after = await H.readChainState(app)
      row.after = {
        hca: after.hcaDeployed,
        base: after.baseRegistrarApproved,
        wrap: after.nameWrapperApproved,
        reg: after.ethRegistryApproved,
      }
      console.log('state after :', row.after)
    } catch (e) {
      row.error = e.message
      console.log('ERROR:', e.message)
      await page
        .screenshot({ path: `/tmp/qa2-${sc.id}-fail.png` })
        .catch(() => {})
    }
    results.push(row)
  }

  console.log(`\n\n${'#'.repeat(78)}\nSUMMARY\n${'#'.repeat(78)}`)
  console.log('| # | names | pred N | rend N | O1 rows | run | nonce | O2 |')
  console.log('|---|-------|-------:|-------:|---------|-----|------:|----|')
  for (const r of results) {
    console.log(
      `| ${r.id} | ${(r.names ?? []).join(' + ') || '-'} | ${r.predicted ?? '-'} | ${r.rendered ?? '-'} | ${r.rowsMatch ? 'OK' : 'DIFF'} | ${r.error ? 'ERR' : r.ok ? 'PASS' : 'FAIL'} | ${r.nonceDelta ?? '-'} | ${r.o2Match ? 'OK' : 'DIFF'} |`,
    )
  }
  for (const r of results) {
    if (!r.rowsMatch && !r.error) {
      console.log(
        `\n${r.id} row diff:\n  predicted ${JSON.stringify(r.predictedRows)}\n  rendered  ${JSON.stringify(r.renderedRows)}`,
      )
    }
  }
  if (logs.length)
    console.log(
      `\nconsole errors (${logs.length}), first 5:\n` +
        logs.slice(0, 5).join('\n'),
    )
} finally {
  await browser.close()
}
