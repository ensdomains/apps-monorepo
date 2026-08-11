/**
 * R2 — Edit profile -> Save on a migrated V2 name.
 *
 * This is the path that reaches setupControlledResolver -> ensureOwnedPermRes,
 * the module PR #1017 deleted and the main merge had to restore (main's #926
 * transfer-ownership work added it as a consumer). If the merge resolution were
 * wrong this is where it would break.
 */
import * as H from './qa2-lib.mjs'

const NAME = process.argv[2] ?? 'dev9371.eth'
const { browser, page, logs } = await H.launch({ headless: true })
try {
  await page.goto(`${H.BASE}/${NAME}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  await H.dismissVerifyModalAnywhere(page)
  await page.waitForTimeout(11000)

  const edit = page.getByRole('button', { name: /edit profile/i })
  console.log('EDIT PROFILE present:', (await edit.count()) > 0)
  await edit.first().click()
  await page.waitForTimeout(7000)

  const dialog = page.locator('div[role="dialog"]')
  console.log('dialog open        :', (await dialog.count()) > 0)
  const dtext = (
    await dialog
      .first()
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ')
  console.log('dialog head        :', dtext.slice(0, 220))

  // Use the free-text Description textarea. A generic "first input" pick lands
  // on the Custom-link URL field, whose validation ("Enter a valid URL") keeps
  // Save disabled, so the resolver path never runs.
  const desc = dialog.locator('textarea[placeholder="Description"]')
  const filled = `qa2-${Date.now().toString().slice(-6)}`
  if (await desc.count()) {
    await desc.first().fill(filled)
    console.log(`filled Description : "${filled}"`)
  } else {
    console.log('Description field not found')
  }

  const buttons = await dialog.locator('button').allTextContents()
  console.log(
    'dialog buttons     :',
    buttons
      .map((b) => b.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' | '),
  )

  const save = dialog
    .locator('button')
    .filter({ hasText: /save|confirm|update/i })
  if (!(await save.count())) {
    console.log('\nNo save control found — cannot exercise the resolver path.')
  } else {
    const disabled = await save
      .first()
      .isDisabled()
      .catch(() => null)
    console.log('save disabled      :', disabled)
    await save
      .first()
      .click()
      .catch(() => {})
    await page.waitForTimeout(30000)
    const after = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    const moduleErr =
      /Cannot find module|is not a function|undefined is not a function|ensureOwnedPermRes/i.test(
        after,
      )
    const crashed = /Something went wrong|Unexpected Application Error/i.test(
      after,
    )
    const resolverPrompt = /resolver|permission|set up/i.test(after)
    console.log('\n=== R2 result ===')
    console.log('module/runtime error:', moduleErr)
    console.log('app crashed        :', crashed)
    console.log('resolver-setup copy:', resolverPrompt)
    console.log(
      'verdict            :',
      !moduleErr && !crashed ? 'PASS' : 'FAIL',
    )
    console.log('body tail          :', after.slice(-420))
  }

  const relevant = logs.filter((l) =>
    /permRes|resolver|module|not a function|VERIFIABLE|DEPLOY_BLOCK/i.test(l),
  )
  console.log(
    `\nconsole errors: ${logs.length} total, ${relevant.length} resolver-related`,
  )
  relevant.slice(0, 6).forEach((l) => {
    console.log('  ', l)
  })
  logs.slice(0, 4).forEach((l) => {
    console.log('  any:', l)
  })
} catch (e) {
  console.error('FAILED:', e.message)
  await page.screenshot({ path: '/tmp/qa2-r2-fail.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
