/**
 * Edge cases E1-E5 from pr-1017-test-plan-v2.md. Read-only except E2, which
 * migrates if the name turns out to be eligible.
 */
import * as H from './qa2-lib.mjs'

const { browser, page, logs } = await H.launch({ headless: true })
const out = []

try {
  const drawer = await H.openMigrationPanel(page)

  // --- E1: nothing seeded -> empty state -------------------------------------
  await H.clearActiveNames(page, drawer)
  await page.goto(`${H.BASE}/migration`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(12000)
  await H.dismissVerifyModal(page)
  let s = await H.readSummary(page)
  const ctaDisabled = await page
    .getByRole('button', { name: /upgrade \d+ names?/i })
    .first()
    .isDisabled()
    .catch(() => null)
  out.push({
    id: 'E1',
    case: 'no names seeded',
    noEligible: s.noEligible,
    upgradeLabel: s.upgradeLabel,
    ctaDisabled,
    feeShown: s.fee !== null,
    confirmationsShown: !Number.isNaN(s.confirmations),
    verdict:
      s.noEligible && ctaDisabled !== false && s.fee === null
        ? 'PASS'
        : 'CHECK',
  })
  console.log('E1:', JSON.stringify(out.at(-1), null, 1))

  // --- E4: a name the wallet does not own ------------------------------------
  await page.goto(`${H.BASE}/migration?names=definitely-not-owned-xyz123.eth`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(12000)
  await H.dismissVerifyModal(page)
  s = await H.readSummary(page)
  out.push({
    id: 'E4',
    case: 'not-owned name in ?names=',
    noEligible: s.noEligible,
    crashed: /Something went wrong|Unexpected/i.test(s.body),
    namesTheName: /definitely-not-owned-xyz123/i.test(s.body),
    verdict: !/Something went wrong|Unexpected/i.test(s.body) ? 'PASS' : 'FAIL',
  })
  console.log('E4:', JSON.stringify(out.at(-1), null, 1))

  // --- E2: Locked+All --------------------------------------------------------
  const d2 = await H.openMigrationPanel(page)
  await H.clearActiveNames(page, d2)
  const lockedAll = await H.seedName(page, d2, 'Locked+All')
  console.log('\nseeded Locked+All:', lockedAll)
  const before = await H.readChainState(await H.readAppContracts(page))
  await H.gotoMigrationAll(page, d2)
  s = await H.readSummary(page)
  const dialog = await H.readStepsDialog(page)
  const bare = (lockedAll ?? '').split(' ')[0]
  out.push({
    id: 'E2',
    case: `Locked+All (${lockedAll})`,
    noEligible: s.noEligible,
    confirmations: s.confirmations,
    rows: dialog.kinds,
    mentionsTheName: bare ? s.body.includes(bare.replace('.eth', '')) : null,
    verdict: s.noEligible ? 'INELIGIBLE' : 'ELIGIBLE',
  })
  console.log('E2:', JSON.stringify(out.at(-1), null, 1))

  if (!s.noEligible) {
    const nb = await H.nonceOf()
    const r = await H.runMigration(page)
    const na = await H.nonceOf()
    console.log('E2 migration:', r.ok ? 'SUCCESS' : 'FAIL', `nonceDelta=${na - nb}`)
    out.at(-1).migrated = r.ok
  } else {
    // Was it dropped silently, or does the page explain why?
    console.log('E2 empty-state copy:', s.body.slice(0, 400))
  }

  // --- E5: deselect to zero --------------------------------------------------
  const d3 = await H.openMigrationPanel(page)
  await H.clearActiveNames(page, d3)
  await H.seedName(page, d3, 'Unwrapped')
  await H.gotoMigrationAll(page, d3)
  const boxes = page.locator('input[type="checkbox"]')
  const n = await boxes.count()
  let deselected = 0
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i)
    if (await b.isChecked().catch(() => false)) {
      await b.click({ force: true }).catch(() => {})
      deselected++
      await page.waitForTimeout(400)
    }
  }
  await page.waitForTimeout(3000)
  s = await H.readSummary(page)
  const disabledNow = await page
    .getByRole('button', { name: /upgrade \d+ names?/i })
    .first()
    .isDisabled()
    .catch(() => null)
  out.push({
    id: 'E5',
    case: 'deselect all mid-flow',
    checkboxes: n,
    deselected,
    upgradeLabel: s.upgradeLabel,
    ctaDisabled: disabledNow,
    feeGone: s.fee === null,
    verdict: deselected === 0 ? 'NO-CHECKBOXES' : disabledNow ? 'PASS' : 'CHECK',
  })
  console.log('E5:', JSON.stringify(out.at(-1), null, 1))

  console.log('\n=== EDGE SUMMARY ===')
  for (const r of out) console.log(`${r.id}: ${r.verdict} — ${r.case}`)
  if (logs.length) console.log(`\nconsole errors (${logs.length}):\n` + logs.slice(0, 6).join('\n'))
} catch (e) {
  console.error('FAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-edge-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
