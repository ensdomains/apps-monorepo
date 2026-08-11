/**
 * E5 — deselect to zero mid-flow. Rows are buttons with aria-pressed, and there
 * is a "Deselect all" toggle; there are no input[type=checkbox] elements, which
 * is why the first attempt found nothing.
 */
import * as H from './qa2-lib.mjs'

const { browser, page, logs } = await H.launch({ headless: true })
try {
  const drawer = await H.openMigrationPanel(page)
  await H.clearActiveNames(page, drawer)
  const a = await H.seedName(page, drawer, 'Unwrapped')
  const b = await H.seedName(page, drawer, 'Unwrapped')
  console.log('seeded:', a, b)

  await H.gotoMigrationAll(page, drawer)
  let s = await H.readSummary(page)
  const pressed = await page.locator('button[aria-pressed="true"]').count()
  console.log('\nbefore: label=%s fee=%s confirmations=%s aria-pressed=true count=%d',
    s.upgradeLabel, s.fee, s.confirmations, pressed)

  // 1) deselect a single row -> count and fee must both track down
  const rows = page.locator('button[aria-pressed="true"]')
  if (await rows.count()) {
    await rows.first().click()
    await page.waitForTimeout(6000)
    s = await H.readSummary(page)
    console.log('after 1 deselect: label=%s fee=%s confirmations=%s',
      s.upgradeLabel, s.fee, s.confirmations)
    console.log('  partial-selection warning shown:',
      /Upgrade all names to receive NFT/i.test(s.body))
  }

  // 2) deselect all -> CTA disabled, fee line gone
  const toggle = page.locator('button').filter({ hasText: /Deselect all/i })
  if (await toggle.count()) {
    await toggle.first().click()
    await page.waitForTimeout(6000)
  } else {
    for (let i = 0; i < 10; i++) {
      const r = page.locator('button[aria-pressed="true"]')
      if (!(await r.count())) break
      await r.first().click()
      await page.waitForTimeout(800)
    }
  }
  s = await H.readSummary(page)
  const disabled = await page
    .getByRole('button', { name: /upgrade \d+ names?/i })
    .first()
    .isDisabled()
    .catch(() => null)
  const stillPressed = await page.locator('button[aria-pressed="true"]').count()

  console.log('\nafter deselect all:')
  console.log('  upgradeLabel     :', s.upgradeLabel)
  console.log('  ctaDisabled      :', disabled)
  console.log('  fee line gone    :', s.fee === null, `(fee=${s.fee})`)
  console.log('  confirmations gone:', Number.isNaN(s.confirmations))
  console.log('  rows still pressed:', stillPressed)
  console.log('\nE5 verdict:',
    /upgrade 0 names/i.test(s.upgradeLabel ?? '') && disabled && s.fee === null
      ? 'PASS'
      : 'FAIL')

  if (logs.length) console.log('\nconsole errors:\n' + logs.slice(0, 5).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-e5-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
