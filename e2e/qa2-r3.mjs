/**
 * R3 — does a name migrated NOW appear on the dashboard?
 *
 * The earlier attempt was invalid: the indexer's config bind-mount was broken
 * for the whole window in which the first 13 migrations ran, so none of them
 * reached the database. The indexer has since been restarted and resumes from
 * the chain head, so only a fresh migration can validate this.
 */
import * as H from './qa2-lib.mjs'

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  const app = await H.readAppContracts(page)
  await H.clearActiveNames(page, drawer)
  const seeded = await H.seedName(page, drawer, 'Unwrapped')
  const label = (seeded ?? '').split(' ')[0].replace('.eth', '')
  console.log('seeded:', seeded, '-> label', label)

  const before = await H.readChainState(app)
  const expected = H.predict({ state: before, unwrapped: 1 })
  await H.gotoMigrationAll(page, drawer)
  const summary = await H.readSummary(page)
  console.log('predicted N:', expected.n, '| rendered N:', summary.confirmations)

  const nb = await H.nonceOf()
  const r = await H.runMigration(page)
  const na = await H.nonceOf()
  console.log('migration  :', r.ok ? 'SUCCESS' : 'FAIL', `nonceDelta=${na - nb} (predicted ${expected.n})`)
  if (!r.ok) throw new Error('migration did not succeed; R3 inconclusive')

  // Give the indexer time to catch the block up at the head.
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(15000)
    await page.goto(`${H.BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(9000)
    await H.dismissVerifyModalAnywhere(page)
    await page.waitForTimeout(8000)
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    const owned = /OWNED\s+(\d+)/i.exec(t)?.[1] ?? '?'
    const listed = t.includes(label)
    console.log(`  attempt ${i}: OWNED=${owned} | ${label} listed: ${listed}`)
    if (listed) {
      const ctx = new RegExp(`.{0,90}${label}.{0,90}`).exec(t)?.[0] ?? ''
      console.log('\nR3 PASS — dashboard row context:')
      console.log('  ', ctx)
      break
    }
    if (i === 8) console.log('\nR3 FAIL/UNVERIFIED — name never appeared on the dashboard')
  }

  if (logs.length) console.log(`\nconsole errors (${logs.length}):\n` + logs.slice(0, 4).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-r3-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
