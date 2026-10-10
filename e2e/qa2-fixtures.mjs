/**
 * Verifies the three new dev-panel presets actually produce what they claim:
 *
 *   records         2LD with V1 resolver + text/addr records
 *   subname         locked 2LD + locked child, BOTH offered for migration
 *   subname-records both offered AND both carrying records
 *
 * For each: seed it, confirm what /migration offers, migrate, then check the
 * records were replayed onto V2.
 *
 * Usage: node e2e/qa2-fixtures.mjs [records|subname|subname-records|all]
 */
import * as H from './qa2-lib.mjs'

const PRESET_LABEL = {
  records: 'Records',
  subname: 'Subname',
  'subname-records': 'Subname+Rec',
}
const which = process.argv[2] ?? 'all'
const targets =
  which === 'all' ? ['records', 'subname', 'subname-records'] : [which]

const RECORD_TEXT = 'QA migration fixture'
const RECORD_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const { browser, page, logs } = await H.launch({ headless: true })
try {
  for (const preset of targets) {
    console.log(`\n${'='.repeat(70)}\n${preset}\n${'='.repeat(70)}`)
    const drawer = await H.openMigrationPanel(page)
    const app = await H.readAppContracts(page)
    await H.clearActiveNames(page, drawer)

    let seeded
    try {
      seeded = await H.seedName(page, drawer, PRESET_LABEL[preset])
    } catch (e) {
      console.log('SEED FAILED:', e.message)
      const err = await drawer
        .locator('text=/Failed to/')
        .first()
        .textContent()
        .catch(() => null)
      if (err) console.log('  panel error:', err)
      continue
    }
    const parent = (seeded ?? '').split(' ')[0].replace('.eth', '')
    const child = `sub-${parent}.${parent}.eth`
    console.log('seeded:', seeded)

    await H.gotoMigrationAll(page, drawer, 20000)
    const s = await H.readSummary(page)
    const rows = await page.locator('button[aria-pressed]').count()
    const listsParent = s.body.includes(`${parent}.eth`)
    const listsChild = s.body.includes(`sub-${parent}`)
    console.log('CTA              :', s.upgradeLabel)
    console.log('selectable rows  :', rows)
    console.log('lists parent     :', listsParent)
    console.log('lists child      :', listsChild, `(${child})`)
    console.log(
      'fee              :',
      s.fee,
      '| confirmations:',
      s.confirmations,
    )

    const expectChild = preset !== 'records'
    if (expectChild !== listsChild) {
      console.log(
        `  !! expected child listed=${expectChild}, got ${listsChild}`,
      )
    }

    const dialog = await H.readStepsDialog(page)
    console.log('dialog rows      :', dialog.kinds)

    const nb = await H.nonceOf()
    const r = await H.runMigration(page, 600000)
    const na = await H.nonceOf()
    console.log(
      'migration        :',
      r.ok ? 'SUCCESS' : 'FAIL',
      `nonceDelta=${na - nb}`,
    )
    if (!r.ok) {
      console.log('  body tail:', r.body.slice(-600))
      continue
    }

    // Did the records survive onto V2? Check the profile page of each name.
    const names =
      preset === 'records' ? [`${parent}.eth`] : [`${parent}.eth`, child]
    for (const n of names) {
      await page.goto(`${H.BASE}/${n}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(8000)
      await H.dismissVerifyModalAnywhere(page)
      await page.waitForTimeout(10000)
      const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      const shouldHaveRecords =
        preset === 'records' || preset === 'subname-records'
      console.log(`  ${n}:`)
      console.log(
        `     owner shown        : ${/Owner\s+(\S+)/.exec(t)?.[1] ?? '(none)'}`,
      )
      console.log(
        `     description replayed: ${t.includes(RECORD_TEXT)}${shouldHaveRecords ? ' (expected true)' : ''}`,
      )
      console.log(
        `     eth addr replayed   : ${t.includes('0x7099') || t.includes(RECORD_ADDR)}`,
      )
      const q = await fetch('http://127.0.0.1:5655/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `{ domains(where: {name: "${n}"}) { name owner { id } } }`,
        }),
      })
      console.log(
        '     indexer            :',
        JSON.stringify((await q.json()).data?.domains),
      )
    }
  }

  if (logs.length)
    console.log(
      `\nconsole errors (${logs.length}):\n` + logs.slice(0, 5).join('\n'),
    )
} catch (e) {
  console.error('FAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-fixtures-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
