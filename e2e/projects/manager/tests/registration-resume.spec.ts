/**
 * Resume-after-reload E2E (WEB-147, standalone-HCA path).
 *
 * Covers the promise the persistence layer makes: a user who closes the tab
 * mid-registration comes back to a flow that continues rather than restarts,
 * and — critically — is never charged for a second commitment.
 *
 * Three scenarios, matching WEB-1217:
 *   (a) reload after `tx-reg-commit state: success` → resumes, completes, and
 *       `tx-reg-commit` is never re-submitted
 *   (b) reload during the cooldown → no new wallet prompt → completes
 *   (c) commitment aged past MAX_COMMITMENT_AGE → clean restart, not an opaque
 *       `CommitmentTooOld` revert at reveal
 *
 * Prerequisites are the same as `registration-rhinestone.spec.ts`: E2E infra up
 * (`pnpm e2e:infra:up`) with the standalone-HCA Anvil snapshot, and the manager
 * app on VITE_FF_USE_EOA=false.
 *
 * Note on (b): the ticket describes it as "single permit re-prompt", which is
 * the PURE-EOA shape (`checkingAllowance → approvingToken`). On the HCA path
 * the wallet funds the HCA once, BEFORE the commit, and the reveal batch pays
 * from that balance — so a correct resume costs ZERO prompts. Asserting zero is
 * both the truthful expectation here and the sharper regression test: a resume
 * that wrongly re-ran the setup bundle would show up as a permit signature.
 */

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import {
  authorizeTransactionsWhile,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { testClient } from '../../../helpers/anvil-client.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { expectFlowSuccess } from '../../../helpers/flow-completion.js'
import { clickThroughEnableSessions } from '../../../helpers/manager-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const COMMIT_TX_ID = 'tx-reg-commit'
/** MAX_COMMITMENT_AGE on the v2 registrar is 24h; overshoot it comfortably. */
const BEYOND_MAX_COMMITMENT_AGE_SECONDS = 24 * 60 * 60 + 60 * 60
/** Must match `registrationPersistence.ts`. */
const RESUME_STORAGE_KEY = 'ens-apps:register-v2:resume:v1'

const readStoredRegistration = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), RESUME_STORAGE_KEY)

/**
 * The registering screen is a parallel region: the completion banner stays
 * hidden until the notification sub-region has been answered. A reload
 * re-enters that region at its initial state, so the choice has to be made
 * again — without this the success banner never appears and the test burns its
 * whole timeout on an unrelated cause.
 */
async function dismissNotificationSettings(page: Page) {
  const setUpLater = page.getByRole('button', { name: 'Set up later' })
  await setUpLater.waitFor({ state: 'visible', timeout: 60_000 })
  await setUpLater.click()
}

const uniqueLabel = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

/**
 * Drive a fresh registration as far as a confirmed on-chain commitment, which
 * is the first point at which there is anything worth resuming.
 */
async function registerUntilCommitConfirmed(page: Page, label: string) {
  const searchInput = await findSearchInput(page)
  await searchInput.click()
  await searchInput.fill(label)
  await page
    .getByText('Available')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByText(`${label}.eth`).click()

  await page.getByRole('button', { name: /pay with stablecoins/i }).click()
  // HCA path: the EnableSessions modal gates "Pay with stablecoins", before the
  // token picker. No-op in EOA mode.
  await clickThroughEnableSessions(page)
  await page.getByText('USDC', { exact: true }).click()

  const monitor = createConsoleMonitor(page, { logConsoleMessages: false })

  await page.getByRole('button', { name: /register name/i }).click()
  await dismissNotificationSettings(page)

  // The commitment is only in machine context — and therefore only persisted —
  // once the commit request COMPLETES. Reloading before this point is a
  // restart by design, not a resume.
  await monitor.waitForTransactionState(COMMIT_TX_ID, 'success', 180_000)

  // Sanity-check the premise: there is no resume to test without a record.
  expect(
    await readStoredRegistration(page),
    'a confirmed commitment must have been persisted',
  ).not.toBeNull()

  return monitor
}

/**
 * Reload and hand back a monitor scoped to what happens AFTER the reload, so
 * "no second commit" is a claim about the resumed run alone.
 */
async function reloadAndWatch(page: Page) {
  await page.reload()
  const monitor = createConsoleMonitor(page, { logConsoleMessages: false })
  await page.waitForLoadState('domcontentloaded')
  return monitor
}

async function expectRegistrationCompletes(page: Page, wallet: unknown) {
  const successBanner = page.locator('p.text-ens-peridot-text-dark')

  // The resumed run re-enters the parallel registering region from scratch.
  await dismissNotificationSettings(page)

  let registrationComplete = false
  const authorizeSetupTxs = authorizeTransactionsWhile(
    page,
    wallet as never,
    () => registrationComplete,
  )
  await expectFlowSuccess(page, {
    success: successBanner.filter({ hasText: 'Registration Complete' }),
    failureTitle: 'Registration Failed',
    timeout: 240_000,
  })
  registrationComplete = true
  await authorizeSetupTxs
}

test.describe('registration resume after reload (Rhinestone HCA)', () => {
  test('resumes after a reload without re-committing', async ({
    connectedPage: page,
    wallet,
  }) => {
    const label = uniqueLabel('rh-resume-a')
    await registerUntilCommitConfirmed(page, label)

    const afterReload = await reloadAndWatch(page)

    // The user did not have to touch anything: landing back on
    // `/register/$name` re-enters the flow on its own.
    await expectRegistrationCompletes(page, wallet)

    // The point of the whole feature. A second commitment would be a second
    // charge, and the registrar would reject the reveal for the first one.
    expect(
      afterReload.getStatesFor(COMMIT_TX_ID),
      `commit must not be re-submitted after a resume, saw: ${afterReload
        .getTransactionLines()
        .map((l) => `${l.txId}=${l.state}`)
        .join(', ')}`,
    ).toEqual([])

    // A record that outlives its own registration would shadow the next one.
    expect(await readStoredRegistration(page)).toBeNull()
  })

  test('resumes through the cooldown with no further wallet prompts', async ({
    connectedPage: page,
    wallet,
  }) => {
    const label = uniqueLabel('rh-resume-b')
    await registerUntilCommitConfirmed(page, label)

    // Reload while the commitment cooldown is still running — the most likely
    // moment for a user to wander off.
    const afterReload = await reloadAndWatch(page)

    await expectRegistrationCompletes(page, wallet)

    // Zero, not one: the HCA was funded before the commit and the reveal batch
    // pays from that balance. A permit here would mean the resume re-ran the
    // setup leg instead of picking up after it.
    expect(
      afterReload.getPermitSignCount(),
      'a resumed HCA registration must not re-prompt for a funding permit',
    ).toBe(0)

    expect(afterReload.getStatesFor(COMMIT_TX_ID)).toEqual([])
  })

  test('restarts cleanly when the stored commitment has expired', async ({
    connectedPage: page,
  }) => {
    const label = uniqueLabel('rh-resume-c')
    await registerUntilCommitConfirmed(page, label)

    // Advance CHAIN time only. The preflight compares `commitmentAt` against
    // the latest block timestamp rather than `Date.now()` precisely so this is
    // expressible without faking the browser clock (which would also stall the
    // app's own cooldown timer).
    await testClient.increaseTime({
      seconds: BEYOND_MAX_COMMITMENT_AGE_SECONDS,
    })
    await testClient.mine({ blocks: 1 })

    const afterReload = await reloadAndWatch(page)

    // Back to pricing rather than into a doomed reveal: without the preflight's
    // MAX_COMMITMENT_AGE check the run would validate, sit through a cooldown,
    // and then revert `CommitmentTooOld` with nothing on screen to explain it.
    await expect(
      page.getByRole('button', { name: /pay with stablecoins/i }),
    ).toBeVisible({ timeout: 30_000 })

    // The expired record is discarded, not left to be retried on every mount.
    expect(await readStoredRegistration(page)).toBeNull()

    // A discarded record must not leave a half-resumed flow behind it.
    expect(afterReload.getStatesFor(COMMIT_TX_ID)).toEqual([])
  })
})
