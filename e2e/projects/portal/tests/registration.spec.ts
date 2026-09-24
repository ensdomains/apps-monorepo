import { getAvailable } from '@ensdomains/ensjs/public'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { authorizeTransaction } from '../../../helpers/portal-auth.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const DOMAIN_TO_REGISTER =
  process.env.E2E_DOMAIN ?? `e2e-portal-${Date.now().toString(36)}.eth`

test.describe('Portal ENS name registration', () => {
  test('registers a name via headless wallet and stablecoin payment', async ({
    portalPage: page,
    wallet,
  }) => {
    test.setTimeout(300_000) // Registration involves multiple on-chain txs

    // ── 1. Connect wallet ──────────────────────────────────────────
    await connectWithHeadlessWallet(page, wallet)

    // ── 2. Navigate to registration page ───────────────────────────
    await page.goto(`${PORTAL_APP_URL}/register?name=${DOMAIN_TO_REGISTER}`)

    // Wait for the registration form to load with the name visible
    await expect(page.getByText(DOMAIN_TO_REGISTER).first()).toBeVisible({
      timeout: 30_000,
    })

    // ── 3. Select USDC in the payment section ───────────────────────
    const paymentSection = page.locator(
      'section:has-text("Select payment method")',
    )

    await expect(paymentSection).toBeVisible({ timeout: 10_000 })

    const usdcOption = paymentSection
      .getByRole('button', { name: 'USDC' })
      .first()
    await usdcOption.waitFor({ state: 'visible', timeout: 10_000 })
    await usdcOption.click()

    const registerButton = paymentSection.getByRole('button', {
      name: /^Register$/i,
    })
    await registerButton.waitFor({ state: 'visible', timeout: 10_000 })
    await registerButton.click()

    // ── 5. Review transaction steps and start registration ───────
    const transactionDialog = page.locator('[data-slot="dialog-content"]')

    await expect(transactionDialog).toBeVisible({ timeout: 30_000 })

    const monitor = createConsoleMonitor(page, {
      onStateChange: (state, allStates) => {
        console.log(
          `[Portal Registration] ${state} (seen: ${allStates.join(' → ')})`,
        )
      },
    })

    let registerTxSucceeded = false
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('Transaction tx-reg-register state: success')) {
        registerTxSucceeded = true
      }
    })

    const startButton = transactionDialog.getByRole('button', {
      name: /^Start$/i,
    })
    await startButton.waitFor({ state: 'visible', timeout: 30_000 })
    await startButton.click()

    await expect(transactionDialog.getByText('Transaction flow')).toBeVisible({
      timeout: 30_000,
    })

    const flowDeadline = Date.now() + 420_000
    while (Date.now() < flowDeadline && !registerTxSucceeded) {
      const openWalletButton = transactionDialog.getByRole('button', {
        name: /open wallet/i,
      })
      if (await openWalletButton.isVisible().catch(() => false)) {
        await openWalletButton.click()
        await authorizeTransaction(wallet, 60_000)
        await page.waitForTimeout(500)
        continue
      }

      const waitingButton = transactionDialog.getByRole('button', {
        name: /^Waiting\.\.\.$/i,
      })
      if (await waitingButton.isVisible().catch(() => false)) {
        // Newer UI can render an icon-only wallet action button next to
        // the Waiting button (without an accessible text label).
        const iconWalletButton = waitingButton.locator(
          'xpath=preceding-sibling::button[1]',
        )
        if (await iconWalletButton.isVisible().catch(() => false)) {
          await iconWalletButton.click()
          await authorizeTransaction(wallet, 60_000)
          await page.waitForTimeout(500)
          continue
        }
      }

      const primaryButton = transactionDialog.getByRole('button', {
        name: /^(Start|Next|Done)$/i,
      })
      if (
        (await primaryButton.isVisible().catch(() => false)) &&
        (await primaryButton.isEnabled().catch(() => false))
      ) {
        await primaryButton.click({ timeout: 2_000 }).catch(() => {})
        await page.waitForTimeout(500)
        continue
      }

      await page.waitForTimeout(1_000)
    }

    expect(registerTxSucceeded).toBe(true)

    // ── 7. Assert success ──────────────────────────────────────────
    expect(monitor.getLastState()).toBe('success')

    // Registration redirects to the name overview and shows a success banner
    // (after the indexer-sync poll), so allow extra time for the redirect.
    await expect(page.getByText('Congratulations!')).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByText(new RegExp(`You are the owner of ${DOMAIN_TO_REGISTER}`)),
    ).toBeVisible({ timeout: 30_000 })
  })

  // Regression coverage for WEB-1464 / Immunefi #92461: the registration actor
  // used to survive a `?name=` change, so completing "registration" after
  // switching names actually registered and charged for the FIRST name while
  // the UI showed the second — a real funds-at-risk bug. The fix
  // (`apps/portal/src/routes/register/index.tsx`) keys `<RegisterName>` on
  // `name`, forcing React to unmount the old actor (and its transactions —
  // see the cleanup effect in `useRegistrationTransactions.ts`) whenever the
  // shown name changes. The PR's own unit test
  // (`apps/portal/src/routes/register/index.test.tsx`) proves this with every
  // on-chain actor stubbed out; this test drives the same switch through a
  // real browser against a real chain, which the unit test cannot cover.
  test('switching to a different name mid-flow cancels the first registration instead of completing it', async ({
    portalPage: page,
    wallet,
  }) => {
    test.setTimeout(240_000)

    const NAME_A = `e2e-switch-a-${Date.now().toString(36)}.eth`
    const NAME_B = `e2e-switch-b-${Date.now().toString(36)}.eth`

    // The real leave-confirmation the user sees when navigating away
    // mid-registration (RegisterName.tsx's `useBlocker`). Auto-accept it like
    // a user choosing to leave anyway, and capture the text to also verify
    // the PR's copy fix ("will cancel it", not the old, now-false "may
    // interrupt it").
    const confirmMessages: string[] = []
    page.on('dialog', (dialog) => {
      confirmMessages.push(dialog.message())
      void dialog.accept()
    })

    await connectWithHeadlessWallet(page, wallet)

    // ── 1. Start registering name A for real: deploy resolver + commit ────
    await page.goto(`${PORTAL_APP_URL}/register?name=${NAME_A}`)
    await expect(page.getByText(NAME_A).first()).toBeVisible({
      timeout: 30_000,
    })

    const paymentSectionA = page.locator(
      'section:has-text("Select payment method")',
    )
    await expect(paymentSectionA).toBeVisible({ timeout: 10_000 })
    await paymentSectionA.getByRole('button', { name: 'USDC' }).first().click()
    await paymentSectionA.getByRole('button', { name: /^Register$/i }).click()

    const transactionDialog = page.locator('[data-slot="dialog-content"]')
    await expect(transactionDialog).toBeVisible({ timeout: 30_000 })
    await transactionDialog.getByRole('button', { name: /^Start$/i }).click()
    await expect(transactionDialog.getByText('Transaction flow')).toBeVisible({
      timeout: 30_000,
    })

    // Drives the wallet loop (same shape as the happy-path test above) until
    // `stopCondition` is true, authorizing whatever transaction the dialog is
    // waiting on along the way.
    const driveWalletLoop = async (
      stopCondition: () => Promise<boolean>,
      deadlineMs: number,
    ): Promise<boolean> => {
      const deadline = Date.now() + deadlineMs
      while (Date.now() < deadline) {
        if (await stopCondition()) return true

        const openWalletButton = transactionDialog.getByRole('button', {
          name: /open wallet/i,
        })
        if (await openWalletButton.isVisible().catch(() => false)) {
          await openWalletButton.click()
          await authorizeTransaction(wallet, 60_000)
          await page.waitForTimeout(500)
          continue
        }

        const waitingButton = transactionDialog.getByRole('button', {
          name: /^Waiting\.\.\.$/i,
        })
        if (await waitingButton.isVisible().catch(() => false)) {
          const iconWalletButton = waitingButton.locator(
            'xpath=preceding-sibling::button[1]',
          )
          if (await iconWalletButton.isVisible().catch(() => false)) {
            await iconWalletButton.click()
            await authorizeTransaction(wallet, 60_000)
            await page.waitForTimeout(500)
            continue
          }
        }

        const primaryButton = transactionDialog.getByRole('button', {
          name: /^(Start|Next|Done)$/i,
        })
        if (
          (await primaryButton.isVisible().catch(() => false)) &&
          (await primaryButton.isEnabled().catch(() => false))
        ) {
          await primaryButton.click({ timeout: 2_000 }).catch(() => {})
          await page.waitForTimeout(500)
          continue
        }

        await page.waitForTimeout(1_000)
      }
      return false
    }

    // Stop once the modal shows the commit-reveal cooldown for A: at that
    // point a REAL commit transaction has landed on chain and the machine is
    // genuinely in-progress (not idle/success/error) — exactly the state the
    // fix's cleanup effect has to act on.
    const reachedCooldown = await driveWalletLoop(
      async () =>
        transactionDialog
          .getByText(/Ready in \d+s/)
          .isVisible()
          .catch(() => false),
      120_000,
    )
    expect(
      reachedCooldown,
      'expected to reach the commit-reveal cooldown for name A (i.e. a real commit tx landed on chain)',
    ).toBe(true)
    console.log(`[switch-test] A (${NAME_A}) committed; cooldown reached`)

    // ── 2. Close the dialog. `closeModal` only hides it — the flow (actor +
    //    transactions) keeps running in the background. This is exactly the
    //    pre-fix danger condition: the user can still be looking at a "dead"
    //    page while a commitment ticks toward its reveal window. ──────────
    await transactionDialog.getByRole('button', { name: 'Close' }).click()
    await expect(transactionDialog).not.toBeVisible({ timeout: 10_000 })
    console.log('[switch-test] closed the dialog for A; flow keeps running')

    // ── 3. Switch to a different name via the real sidebar search control,
    //    the same one a user would use mid-flow — not a raw page.goto(). ──
    const searchInput = page.getByRole('combobox')
    await searchInput.click()
    await searchInput.fill(NAME_B)

    const searchOption = page.getByRole('option', { name: NAME_B })
    await expect(searchOption.getByText('Available to register')).toBeVisible({
      timeout: 20_000,
    })
    await searchInput.press('Enter')

    // ── 4. Prove the switch actually happened ───────────────────────────
    await expect(page).toHaveURL(new RegExp(`name=${NAME_B}`))
    await expect(page.getByText(NAME_B).first()).toBeVisible({
      timeout: 15_000,
    })
    console.log(
      `[switch-test] switched to B (${NAME_B}); confirmMessages=${JSON.stringify(confirmMessages)}`,
    )

    // If the leave-confirmation fired, it must carry the PR's corrected copy.
    if (confirmMessages.length > 0) {
      expect(
        confirmMessages.some((m) => m.includes('will cancel it')),
        `expected the leave-confirmation to say "will cancel it"; got: ${confirmMessages.join(' | ')}`,
      ).toBe(true)
      expect(
        confirmMessages.some((m) => m.includes('may interrupt it')),
        'the leave-confirmation still uses the old, now-false "may interrupt it" copy',
      ).toBe(false)
    }

    // No wallet prompt for A's register step should ever appear now that its
    // actor and transactions were torn down on unmount — the actual consumer
    // protection the fix provides.
    let sawWalletPromptForA = false
    for (let i = 0; i < 10; i++) {
      if (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0) {
        sawWalletPromptForA = true
        break
      }
      await page.waitForTimeout(1_000)
    }
    expect(
      sawWalletPromptForA,
      "name A's flow kept prompting the wallet after switching to B — the old actor is still alive",
    ).toBe(false)
    console.log('[switch-test] confirmed no wallet prompt for A after switch')

    // ── 5. A fresh flow for B should work and make real on-chain progress,
    //    proving the remount isn't just killing things but also enabling a
    //    clean restart. ───────────────────────────────────────────────────
    const paymentSectionB = page.locator(
      'section:has-text("Select payment method")',
    )
    await expect(paymentSectionB).toBeVisible({ timeout: 10_000 })
    await paymentSectionB.getByRole('button', { name: 'USDC' }).first().click()
    await paymentSectionB.getByRole('button', { name: /^Register$/i }).click()

    await expect(transactionDialog).toBeVisible({ timeout: 30_000 })
    await transactionDialog.getByRole('button', { name: /^Start$/i }).click()
    await expect(transactionDialog.getByText('Transaction flow')).toBeVisible({
      timeout: 30_000,
    })

    let commitSucceededB = false
    page.on('console', (msg) => {
      if (msg.text().includes('Transaction tx-reg-commit state: success')) {
        commitSucceededB = true
      }
    })

    const bCommitted = await driveWalletLoop(
      async () => commitSucceededB,
      120_000,
    )
    expect(
      bCommitted,
      'expected a fresh commit for B to land on chain — the remount must not just kill the old flow but also allow a clean new one',
    ).toBe(true)
    console.log(`[switch-test] B (${NAME_B}) committed fresh, on its own actor`)

    // ── 6. The strongest evidence: A's commitment was never completed into a
    //    registration, even though well over its 60s reveal cooldown has now
    //    elapsed (this whole flow for B took longer than that on its own). ─
    const stillAvailableA = await getAvailable(publicClient, { name: NAME_A })
    expect(
      stillAvailableA,
      'name A must still be available — its commit must never have been completed into a registration after the switch to B',
    ).toBe(true)
    console.log(
      `[switch-test] final check: A (${NAME_A}) still available = ${stillAvailableA}`,
    )
  })
})
