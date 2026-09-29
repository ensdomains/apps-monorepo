import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getAvailable } from '@ensdomains/ensjs/public'
import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { type Address, formatUnits, parseAbi } from 'viem'
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
  test('registers a name via headless wallet and stablecoin payment', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet }) => {
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
  test('switching to a different name mid-flow cancels the first registration instead of completing it', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet }) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Registration success banner — WEB-1490 / Immunefi #92544 (PR #1247)
//
// The banner says "Congratulations! You are the owner of {name}" and prints a
// "Paid" figure. It used to be driven by `?registered=true&duration=…&paid=…`,
// so a link on the real portal origin could tell any visitor they owned a name
// they had never touched, at any price the link chose — with Extend (which
// renews the attacker's name from the visitor's wallet) the only call to action
// on the page. The fix moves the banner into history state, which only the
// app's own post-registration `navigate` writes, and parses it on read
// (`readRegistrationSuccessState`).
//
// The PR's unit tests run the route with a stubbed router. These drive the real
// router, real URL parsing and real history in a browser, on names that really
// exist on chain.
// ─────────────────────────────────────────────────────────────────────────────

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const MOCK_USDC = ensjsSepolia.usdc.address
const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
])

/** The report's exact query string: 10 years, "free". */
const REPORTED_CRAFTED_QUERY =
  'registered=true&duration=315360000&paid=$0.00%20(free)'

/**
 * The page content. Assertions are scoped to it because in dev builds the
 * TanStack Router devtools panel echoes the raw search params — so the link's
 * `$0.00 (free)` is in the DOM there, in a panel no production visitor has.
 */
const content = (page: Page) => page.locator('main')

/** `0x7099…79C8` — how the Owner row renders an address with no primary name. */
const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

/**
 * Waits for the name page to finish rendering its profile — the heading plus
 * the Owner row showing `owner` — so the banner assertions after it can't pass
 * vacuously on a page that simply hasn't loaded yet. The banner renders in the
 * same component, in the same pass, as the Owner row.
 */
async function expectNamePageLoaded(page: Page, name: string, owner: Address) {
  await expect(
    content(page).getByRole('heading', { name, exact: true }),
  ).toBeVisible({
    timeout: 60_000,
  })
  await expect(
    content(page).getByText(truncateAddress(owner)).first(),
  ).toBeVisible({
    timeout: 60_000,
  })
}

async function expectNoSuccessBanner(page: Page, context: string) {
  await expect(
    content(page).getByText('Congratulations!'),
    `${context}: no success banner`,
  ).toHaveCount(0)
  await expect(
    content(page).getByText(/You are the owner of/),
    `${context}: no ownership claim`,
  ).toHaveCount(0)
}

async function readUsdcBalance(address: Address): Promise<bigint> {
  return publicClient.readContract({
    address: MOCK_USDC,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address],
  })
}

/**
 * Registers `name` for the default 1 year with USDC through the real register
 * page and transaction dialog — the same path the happy-path test above drives
 * — and returns once the register transaction has succeeded.
 */
async function registerThroughUi(
  page: Page,
  wallet: Web3ProviderBackend,
  name: string,
) {
  await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 })

  const paymentSection = page.locator(
    'section:has-text("Select payment method")',
  )
  await expect(paymentSection).toBeVisible({ timeout: 10_000 })
  await paymentSection.getByRole('button', { name: 'USDC' }).first().click()
  await paymentSection.getByRole('button', { name: /^Register$/i }).click()

  const transactionDialog = page.locator('[data-slot="dialog-content"]')
  await expect(transactionDialog).toBeVisible({ timeout: 30_000 })

  let registerTxSucceeded = false
  page.on('console', (msg) => {
    if (msg.text().includes('Transaction tx-reg-register state: success')) {
      registerTxSucceeded = true
    }
  })

  await transactionDialog.getByRole('button', { name: /^Start$/i }).click()
  await expect(transactionDialog.getByText('Transaction flow')).toBeVisible({
    timeout: 30_000,
  })

  const deadline = Date.now() + 420_000
  while (Date.now() < deadline && !registerTxSucceeded) {
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

  expect(registerTxSucceeded, 'the register transaction should succeed').toBe(
    true,
  )
}

test.describe('Portal registration success banner — not forgeable from a link (WEB-1490)', () => {
  test('the reported crafted link does not tell a visitor they own someone else’s name', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet, makeName, accounts }) => {
    test.setTimeout(180_000)

    // The attacker's name. The visitor (`user`) has never touched it.
    const name = await makeName({ label: 'banner-forged', owner: 'user2' })
    const attacker = accounts.getAddress('user2')

    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`)

    await expectNamePageLoaded(page, name, attacker)
    await expectNoSuccessBanner(page, 'the report’s exact link')
    await expect(
      content(page).getByText('$0.00 (free)'),
      'the link’s "paid" figure must never be rendered',
    ).toHaveCount(0)
    await expect(
      content(page).getByText('10 years'),
      'the link’s duration must never be rendered as a registration period',
    ).toHaveCount(0)
  })

  test('the crafted link is ignored for a disconnected visitor too', async ({
    portalPage: page,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    const name = await makeName({ label: 'banner-anon', owner: 'user2' })

    await page.goto(`${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`)

    await expectNamePageLoaded(page, name, accounts.getAddress('user2'))
    await expectNoSuccessBanner(page, 'disconnected visitor')
    await expect(content(page).getByText('$0.00 (free)')).toHaveCount(0)
  })

  test('the crafted link is ignored even on a name the visitor really owns', async ({
    portalPage: page,
    wallet,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    // Ownership is real here, but no registration happened in this session —
    // the banner is a "you just registered this" receipt, not an ownership
    // badge, and its "Paid" figure would still be the link's invention.
    const name = await makeName({ label: 'banner-own', owner: 'user' })

    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`)

    await expectNamePageLoaded(page, name, accounts.getAddress('user'))
    await expectNoSuccessBanner(page, 'owned name, crafted link')
    await expect(content(page).getByText('$0.00 (free)')).toHaveCount(0)
  })

  test('no variant of the old query parameters brings the banner back', async ({
    portalPage: page,
    wallet,
    makeName,
    accounts,
  }) => {
    test.setTimeout(240_000)

    const name = await makeName({ label: 'banner-variants', owner: 'user2' })
    const attacker = accounts.getAddress('user2')

    // Any native dialog (e.g. an injected `alert`) is a failure.
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })

    await connectWithHeadlessWallet(page, wallet)

    const variants: Array<[label: string, query: string]> = [
      // The exact shape the pre-fix app itself wrote after a registration —
      // i.e. an old bookmark, or a URL copied from a real success page.
      [
        'the pre-fix app’s own redirect URL',
        'registered=true&duration=31536000&paid=%245.00',
      ],
      // TanStack Router JSON-parses search values, so these reach a
      // validator as a real boolean / number / string.
      [
        'JSON-encoded values',
        'registered=%22true%22&duration=%2231536000%22&paid=%22%245.00%22',
      ],
      ['numeric truthy flag', 'registered=1&duration=31536000&paid=%245.00'],
      ['upper-case flag', 'registered=TRUE&duration=31536000&paid=%245.00'],
      ['flag alone', 'registered=true'],
      [
        'markup in the paid figure',
        `registered=true&duration=31536000&paid=${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
      ],
      // The new history-state key, smuggled in as a search param instead.
      [
        'history-state key as a search param',
        `registrationSuccess=${encodeURIComponent(
          JSON.stringify({ durationSeconds: 31536000, paid: '$0.00 (free)' }),
        )}`,
      ],
    ]

    for (const [label, query] of variants) {
      await page.goto(`${PORTAL_APP_URL}/${name}/?${query}`)
      await expectNamePageLoaded(page, name, attacker)
      await expectNoSuccessBanner(page, label)
      await expect(
        content(page).locator('img[src="x"]'),
        `${label}: nothing from the link is rendered as markup`,
      ).toHaveCount(0)
    }

    expect(dialogs, 'no script from a link should ever run').toEqual([])
  })

  test('a crafted link on an unregistered name shows it as available, not as yours', async ({
    portalPage: page,
    wallet,
  }) => {
    test.setTimeout(120_000)

    // A guard, not a regression proof: the old banner lived inside the
    // registered-name profile, so this passes on pre-fix code too. It pins
    // that the available-name page never grows one — the claim would be just
    // as false there, and more believable next to a Register button.
    const name = `e2e-banner-free-${Date.now().toString(36)}.eth`
    expect(await getAvailable(publicClient, { name })).toBe(true)

    await connectWithHeadlessWallet(page, wallet)
    await page.goto(`${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`)

    await expect(content(page).getByText(`${name} is available!`)).toBeVisible({
      timeout: 60_000,
    })
    await expectNoSuccessBanner(page, 'available name')
    await expect(content(page).getByText('$0.00 (free)')).toHaveCount(0)
  })

  test('history state is parsed on read: a well-formed entry renders, malformed ones are ignored', async ({
    portalPage: page,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    // History state can only be written by script on the portal's own origin,
    // so this is not an attack path — it is the in-browser check that the
    // banner is still wired to history state at all (without it every
    // negative test above would pass on a page that had lost the banner
    // entirely), and that a malformed entry left behind by an older build or
    // an extension neither renders nor breaks the page.
    const name = await makeName({ label: 'banner-state', owner: 'user2' })
    const owner = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, owner)
    await expectNoSuccessBanner(page, 'plain name page')

    const reloadWithState = async (registrationSuccess: unknown) => {
      await page.evaluate((entry) => {
        window.history.replaceState(
          { ...window.history.state, registrationSuccess: entry },
          '',
        )
      }, registrationSuccess)
      await page.reload()
      await expectNamePageLoaded(page, name, owner)
    }

    // Positive control: exactly what the app's own redirect writes.
    await reloadWithState({ durationSeconds: 31536000, paid: '$4.21' })
    await expect(content(page).getByText('Congratulations!')).toBeVisible()
    await expect(
      content(page).getByText(`You are the owner of ${name}`),
    ).toBeVisible()
    await expect(content(page).getByText('$4.21')).toBeVisible()

    const malformed: Array<[label: string, entry: unknown]> = [
      ['string entry', 'true'],
      ['null entry', null],
      ['missing paid', { durationSeconds: 31536000 }],
      ['missing duration', { paid: '$4.21' }],
      ['string duration', { durationSeconds: '31536000', paid: '$4.21' }],
      ['numeric paid', { durationSeconds: 31536000, paid: 4.21 }],
    ]
    for (const [label, entry] of malformed) {
      await reloadWithState(entry)
      await expectNoSuccessBanner(page, `malformed state (${label})`)
    }
  })

  test('a real registration still shows the banner, and the URL it lands on cannot reproduce it', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(420_000)

    const name = `e2e-banner-real-${Date.now().toString(36)}.eth`
    const registrant = accounts.getAddress('user')

    await connectWithHeadlessWallet(page, wallet)

    const usdcBefore = await readUsdcBalance(registrant)
    await registerThroughUi(page, wallet, name)
    const usdcSpent = usdcBefore - (await readUsdcBalance(registrant))
    expect(
      usdcSpent,
      'the registration should have charged USDC',
    ).toBeGreaterThan(0n)

    // ── 1. The legitimate banner, with figures that match reality ──────────
    await expect(content(page).getByText('Congratulations!')).toBeVisible({
      timeout: 90_000,
    })
    await expect(
      content(page).getByText(`You are the owner of ${name}`),
    ).toBeVisible()
    await expectNamePageLoaded(page, name, registrant)

    // The "Paid" figure is what actually left the wallet, not a number from
    // anywhere the user (or a link) could influence.
    const expectedPaid = Number(formatUnits(usdcSpent, 6)).toLocaleString(
      'en-US',
      {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )
    await expect(
      page
        .getByText('Paid', { exact: true })
        .locator('xpath=preceding-sibling::p[1]'),
      'the banner’s Paid figure should equal the USDC actually spent',
    ).toHaveText(expectedPaid)
    await expect(
      page
        .getByText('Registration', { exact: true })
        .locator('xpath=preceding-sibling::p[1]'),
    ).toHaveText('1 year')

    // ── 2. Nothing about the claim is in the URL any more ──────────────────
    const landed = new URL(page.url())
    expect(landed.pathname.replace(/\/$/, '')).toBe(`/${name}`)
    for (const key of ['registered', 'duration', 'paid']) {
      expect(
        landed.searchParams.has(key),
        `the post-registration URL must not carry "${key}"`,
      ).toBe(false)
    }
    const state = await page.evaluate(() => window.history.state)
    expect(state?.registrationSuccess).toEqual({
      durationSeconds: expect.any(Number),
      paid: expectedPaid,
    })

    // ── 3. Reloading the same history entry keeps the receipt ──────────────
    // History state belongs to this tab's entry, so the registrant's own
    // reload still shows it — only a *new* navigation should lose it.
    await page.reload()
    await expectNamePageLoaded(page, name, registrant)
    await expect(content(page).getByText('Congratulations!')).toBeVisible()

    // ── 4. Sharing the URL does not share the banner ───────────────────────
    const sharedTab = await page.context().newPage()
    await sharedTab.goto(page.url())
    await expectNamePageLoaded(sharedTab, name, registrant)
    await expectNoSuccessBanner(
      sharedTab,
      'the success URL opened in a new tab',
    )
    await expect(content(sharedTab).getByText(expectedPaid)).toHaveCount(0)
    await sharedTab.close()

    // ── 5. A fresh in-app visit to the name does not replay it ─────────────
    await page.goto(`${PORTAL_APP_URL}/`)
    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, registrant)
    await expectNoSuccessBanner(page, 'a later visit to the name')
  })

  test('a link from another website cannot hand the banner over, in the same tab, a new tab, or a popup', async ({
    portalPage: page,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    // The real-world delivery of the report: a page the attacker controls,
    // on an origin that is not the portal's, linking to the portal.
    const name = await makeName({ label: 'banner-xorigin', owner: 'user2' })
    const attacker = accounts.getAddress('user2')
    const crafted = `${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`
    const ATTACKER_ORIGIN = 'http://attacker.test'

    await page.context().route(`${ATTACKER_ORIGIN}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body>
          <a id="same-tab" href="${crafted}">claim your name</a>
          <a id="new-tab" href="${crafted}" target="_blank" rel="opener">claim your name</a>
        </body></html>`,
      }),
    )

    // ── Same tab ──────────────────────────────────────────────────────────
    await page.goto(`${ATTACKER_ORIGIN}/`)
    await page.locator('#same-tab').click()
    await expectNamePageLoaded(page, name, attacker)
    await expectNoSuccessBanner(page, 'external link, same tab')

    // ── New tab ───────────────────────────────────────────────────────────
    await page.goto(`${ATTACKER_ORIGIN}/`)
    const [newTab] = await Promise.all([
      page.context().waitForEvent('page'),
      page.locator('#new-tab').click(),
    ])
    await expectNamePageLoaded(newTab, name, attacker)
    await expectNoSuccessBanner(newTab, 'external link, new tab')
    await newTab.close()

    // ── Popup, then try to write the portal's history state into it ───────
    // This is the fix's core assumption: only script on the portal's own
    // origin can write its history state. An attacker holding a handle to
    // the portal window must be refused by the browser.
    await page.goto(`${ATTACKER_ORIGIN}/`)
    const [popup] = await Promise.all([
      page.context().waitForEvent('page'),
      page.evaluate((url) => {
        ;(window as unknown as { portal: Window | null }).portal =
          window.open(url)
      }, crafted),
    ])
    await expectNamePageLoaded(popup, name, attacker)
    const writeAttempt = await page.evaluate(() => {
      const portal = (window as unknown as { portal: Window }).portal
      try {
        portal.history.replaceState(
          {
            registrationSuccess: {
              durationSeconds: 315360000,
              paid: '$0.00 (free)',
            },
          },
          '',
        )
        return 'written'
      } catch (error) {
        return (error as Error).name
      }
    })
    expect(
      writeAttempt,
      'another origin must not be able to write the portal’s history state',
    ).toBe('SecurityError')
    await popup.reload()
    await expectNamePageLoaded(popup, name, attacker)
    await expectNoSuccessBanner(
      popup,
      'popup after a cross-origin write attempt',
    )
    await popup.close()
  })

  test('other URL shapes carrying the claim are ignored too', async ({
    portalPage: page,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    const name = await makeName({ label: 'banner-shapes', owner: 'user2' })
    const attacker = accounts.getAddress('user2')

    const shapes: Array<[label: string, path: string]> = [
      ['no trailing slash', `/${name}?${REPORTED_CRAFTED_QUERY}`],
      ['in the hash fragment', `/${name}/#${REPORTED_CRAFTED_QUERY}`],
      [
        'query and fragment',
        `/${name}/?${REPORTED_CRAFTED_QUERY}#${REPORTED_CRAFTED_QUERY}`,
      ],
      [
        'repeated keys',
        `/${name}/?registered=true&registered=true&duration=1&duration=315360000&paid=%240.00&paid=%240.00%20(free)`,
      ],
    ]

    for (const [label, path] of shapes) {
      await page.goto(`${PORTAL_APP_URL}${path}`)
      await expectNamePageLoaded(page, name, attacker)
      await expectNoSuccessBanner(page, label)
      await expect(content(page).getByText('$0.00 (free)')).toHaveCount(0)
    }
  })

  test('moving around the name’s pages after a crafted link never brings the banner back', async ({
    portalPage: page,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    // In-app links can carry search params forward. Whatever the router does
    // with the crafted params on the way, the overview must stay clean.
    const name = await makeName({ label: 'banner-nav', owner: 'user2' })
    const attacker = accounts.getAddress('user2')
    const sidebarLink = (path: string) =>
      page.locator(`a[href="/${name}${path}"]`).first()

    await page.goto(`${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`)
    await expectNamePageLoaded(page, name, attacker)

    for (const subpage of ['/records', '/ownership', '/history']) {
      await sidebarLink(subpage).click()
      await expect(page).toHaveURL(new RegExp(`/${name}${subpage}`))
      await expectNoSuccessBanner(page, `on ${subpage}`)

      await sidebarLink('').click()
      await expect(page).toHaveURL(new RegExp(`/${name}/?(\\?|#|$)`))
      await expectNamePageLoaded(page, name, attacker)
      await expectNoSuccessBanner(page, `back on the overview from ${subpage}`)
    }

    // Browser Back all the way to the crafted entry itself — the URL still
    // carries the claim there, so this is the entry that matters.
    for (let i = 0; i < 10 && !page.url().includes('registered='); i++) {
      await page.goBack()
    }
    expect(page.url(), 'back on the crafted entry').toContain('registered=true')
    await expectNamePageLoaded(page, name, attacker)
    await expectNoSuccessBanner(page, 'the crafted entry, reached with Back')

    // Forward lands on the first subpage visited from it.
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/${name}/records`))
    await expectNoSuccessBanner(page, 'Forward off the crafted entry')
  })

  test('connecting a wallet on a crafted link does not bring the banner back', async ({
    portalPage: page,
    wallet,
    makeName,
    accounts,
  }) => {
    test.setTimeout(180_000)

    // The page re-renders with a connected account — the moment a victim
    // would be most inclined to act on a claim of ownership.
    const name = await makeName({ label: 'banner-connect', owner: 'user2' })
    const attacker = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${name}/?${REPORTED_CRAFTED_QUERY}`)
    await expectNamePageLoaded(page, name, attacker)
    await expectNoSuccessBanner(page, 'before connecting')

    await connectWithHeadlessWallet(page, wallet)

    await expectNamePageLoaded(page, name, attacker)
    await expectNoSuccessBanner(page, 'after connecting')
    await expect(content(page).getByText('$0.00 (free)')).toHaveCount(0)
  })

  test('the receipt stays on its own history entry and never attaches to another name', async ({
    portalPage: page,
    makeName,
    accounts,
  }) => {
    test.setTimeout(240_000)

    // The state carries no name — the page takes the name from the URL — so
    // the property that matters is that it cannot follow the user onto a
    // different name. Seeded the way the app's redirect writes it (a real
    // registration is test 7's job; this is about where the entry goes).
    const nameA = await makeName({ label: 'banner-entry-a', owner: 'user2' })
    const nameB = await makeName({ label: 'banner-entry-b', owner: 'user2' })
    const owner = accounts.getAddress('user2')

    await page.goto(`${PORTAL_APP_URL}/${nameA}`)
    await expectNamePageLoaded(page, nameA, owner)
    await page.evaluate(() => {
      window.history.replaceState(
        {
          ...window.history.state,
          registrationSuccess: { durationSeconds: 31557600, paid: '$4.21' },
        },
        '',
      )
    })
    await page.reload()
    await expectNamePageLoaded(page, nameA, owner)
    await expect(content(page).getByText('Congratulations!')).toBeVisible()

    // ── In-app to another name, through the real search control ───────────
    const searchInput = page.getByRole('combobox')
    await searchInput.click()
    await searchInput.fill(nameB)
    await expect(page.getByRole('option', { name: nameB })).toBeVisible({
      timeout: 30_000,
    })
    await searchInput.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${nameB}`))
    await expectNamePageLoaded(page, nameB, owner)
    await expectNoSuccessBanner(page, 'a different name reached from A')
    await expect(content(page).getByText('$4.21')).toHaveCount(0)

    // ── Back restores A's own entry, with its own receipt ─────────────────
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/${nameA}/?$`))
    await expectNamePageLoaded(page, nameA, owner)
    await expect(
      content(page).getByText(`You are the owner of ${nameA}`),
    ).toBeVisible()

    // ── Forward to B: still nothing on B ──────────────────────────────────
    await page.goForward()
    await expectNamePageLoaded(page, nameB, owner)
    await expectNoSuccessBanner(page, 'B after back/forward')

    // ── Typing A's URL is a new entry: no receipt ─────────────────────────
    await page.goto(`${PORTAL_APP_URL}/${nameA}`)
    await expectNamePageLoaded(page, nameA, owner)
    await expectNoSuccessBanner(page, 'A reached by a fresh navigation')
  })
})
