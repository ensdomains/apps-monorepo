/**
 * Regressions that share code with PR #1017.
 *
 * R1 registration — exercises computeStandaloneHcaAddress, the contracts-v2 #409
 *    validator and the ens-sessions-v9 key. A wrong implementation/validator
 *    address surfaces as "Failed to initialize standalone HCA account".
 * R2 Edit profile -> Save — runs setupControlledResolver -> ensureOwnedPermRes,
 *    the module this PR deleted and the merge restored. Validates that
 *    resolution against the real app.
 * R4 migrated name's profile shows the connected wallet as Owner.
 */
import * as H from './qa2-lib.mjs'

const { browser, page, logs } = await H.launch({ headless: true })
const errAt = (tag) =>
  logs
    .filter((l) => /HCA|standalone|resolver|permRes/i.test(l))
    .slice(0, 4)
    .map((l) => `${tag}: ${l}`)

try {
  // ---------- R1: registration surface ----------
  const name = `qa2reg${Date.now().toString().slice(-7)}`
  await page.goto(`${H.BASE}/register?name=${name}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(20000)
  await H.dismissVerifyModal(page).catch(() => {})
  let body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const r1 = {
    id: 'R1',
    name,
    priceShown: /[\d.]+\s*(ETH|USDC|\$)/i.test(body),
    hcaInitError:
      /Failed to initialize standalone HCA|Gas estimate unavailable/i.test(
        body,
      ),
    crashed: /Something went wrong|Unexpected Application Error/i.test(body),
    registerCta: /register|continue|next/i.test(body),
  }
  r1.verdict =
    !r1.hcaInitError && !r1.crashed ? 'PASS (page + HCA init)' : 'FAIL'
  console.log('R1:', JSON.stringify(r1, null, 1))
  console.log('  body head:', body.slice(0, 260))
  errAt('R1').forEach((l) => {
    console.log('  ', l)
  })

  // ---------- R4: a migrated name's owner ----------
  // Reuse a name the matrix migrated; fall back to scanning the dashboard.
  await page.goto(`${H.BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(12000)
  body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  const dev = /(dev\d{3,5})\.eth/.exec(body)?.[1]
  console.log('\ndashboard sample name:', dev ?? '(none found)')
  if (dev) {
    await page.goto(`${H.BASE}/${dev}.eth`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(15000)
    const pbody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    const ownerMatch = /Owner\s*([0-9a-zA-Zx.…]+)/.exec(pbody)?.[1] ?? null
    const r4 = {
      id: 'R4',
      name: `${dev}.eth`,
      ownerText: ownerMatch,
      showsConnectedWallet: /0xf39F|f39F|\.eth/i.test(ownerMatch ?? ''),
      showsNameWrapper: /0635|NameWrapper/i.test(pbody),
      verdict: ownerMatch ? 'SEE ownerText' : 'NO OWNER FIELD',
    }
    console.log('R4:', JSON.stringify(r4, null, 1))
  }

  // ---------- R2: Edit profile -> Save (ensureOwnedPermRes path) ----------
  if (dev) {
    await page.goto(`${H.BASE}/${dev}.eth`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(12000)
    await H.dismissVerifyModal(page).catch(() => {})
    const editBtn = page.getByRole('button', { name: /edit profile/i })
    const hasEdit = await editBtn.count()
    console.log('\nR2: "Edit profile" control present:', hasEdit > 0)
    if (hasEdit) {
      await editBtn.first().click()
      await page.waitForTimeout(6000)
      const dialogText = (await page.locator('body').innerText()).replace(
        /\s+/g,
        ' ',
      )
      console.log('  dialog opened:', /edit profile/i.test(dialogText))
      // Type into the first visible text input, then save.
      const input = page
        .locator(
          'div[role="dialog"] input[type="text"], div[role="dialog"] input:not([type])',
        )
        .first()
      if (await input.count()) {
        await input
          .fill(`qa2-${Date.now().toString().slice(-5)}`)
          .catch(() => {})
        await page.waitForTimeout(1500)
      }
      const save = page
        .locator('div[role="dialog"] button')
        .filter({ hasText: /^save|save changes|confirm/i })
      console.log('  save control present:', (await save.count()) > 0)
      if (await save.count()) {
        await save
          .first()
          .click()
          .catch(() => {})
        await page.waitForTimeout(25000)
        const after = (await page.locator('body').innerText()).replace(
          /\s+/g,
          ' ',
        )
        const r2 = {
          id: 'R2',
          resolverSetupPrompt: /resolver|set up|permission/i.test(after),
          moduleError:
            /ensureOwnedPermRes|Cannot find module|is not a function|undefined is not/i.test(
              after,
            ),
          crashed: /Something went wrong|Unexpected Application Error/i.test(
            after,
          ),
        }
        r2.verdict =
          !r2.moduleError && !r2.crashed
            ? 'PASS (no module/runtime error)'
            : 'FAIL'
        console.log('R2:', JSON.stringify(r2, null, 1))
        console.log('  body tail:', after.slice(-300))
      }
      errAt('R2').forEach((l) => {
        console.log('  ', l)
      })
    }
  }

  console.log(`\nconsole errors total: ${logs.length}`)
  logs.slice(0, 10).forEach((l) => {
    console.log('  ', l)
  })
} catch (e) {
  console.error('FAILED:', e.message)
  await page
    .screenshot({ path: '/tmp/qa2-regression-fail.png' })
    .catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
