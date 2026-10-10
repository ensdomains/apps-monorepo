import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getAvailable } from '@ensdomains/ensjs/public'
import { getExpiry, getOwner } from '@ensdomains/ensjs/public/v2'
import {
  permissionedRegistryGetResolverSnippet,
  proxyDeployedEventSnippet,
  verifiableFactoryDeployProxySnippet,
} from '@ensdomains/ensjs-abi/v2'
import {
  ethRegistrarGetRegisterPriceSnippet,
  ethRegistrarGetRenewPriceSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { permissionedResolverInitializeSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Locator, Page } from '@playwright/test'
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  type Hash,
  keccak256,
  maxUint256,
  parseAbi,
  parseEther,
  parseEventLogs,
  stringToHex,
  toFunctionSelector,
  toHex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import { createConsoleMonitor } from '../../../helpers/console-monitor.js'
import { waitForIndexedName } from '../../../helpers/indexer-sync.js'
import { mockV1Subgraph } from '../../../helpers/mock-v1-subgraph.js'
import {
  authorizeTransaction,
  switchWalletToSepolia,
  switchWalletToUndeclaredChain,
} from '../../../helpers/portal-auth.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'

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

    // During the cooldown A also checks its USDC allowance and, when it is
    // short, sends the approve straight away — so whether a request is already
    // waiting here depends on what other tests left the shared allowance at.
    // Answer it now: the check below is about requests A makes AFTER the
    // switch, and one it made before cannot tell a dead actor from a live one.
    while (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0) {
      await authorizeTransaction(wallet, 60_000)
      await page.waitForTimeout(500)
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// WEB-281: Extend with the wallet on a chain the portal does not declare
//
// Bug: the portal builds every renewal step for Sepolia, but never compared
// that with the chain the wallet would send on. A wallet switched to another
// network after connecting yields `walletClient.chain === undefined`, which the
// EOA transport passed to viem as `chain: null` — skipping viem's own chain
// assertion — so the wallet was asked to send the USDC approval (and then the
// paid renewal) on that other chain.
//
// Fix (#1108): the EOA transport refuses with `ChainIdMismatchError` before
// the wallet is prompted.
//
// This is the money path the transfer tests in `transfer.spec.ts` don't cover:
// the oracle is the wallet's own `eth_sendTransaction` queue plus the USDC
// balance, the renewer's allowance and the on-chain expiry. The second half is
// the positive control: back on Sepolia, the same modal renews and charges.
// ─────────────────────────────────────────────────────────────────────────────

const V2_RENEWER = ensjsSepolia.ensEthRegistrar.address
const ERC20_ALLOWANCE_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
])

async function readRenewerAllowance(owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: MOCK_USDC,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: 'allowance',
    args: [owner, V2_RENEWER],
  })
}

test.describe('Portal Extend — wallet on an undeclared chain (WEB-281)', () => {
  test('does not ask a wallet on another network to approve or pay, and renews once it is back on Sepolia', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(300_000)

    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const name = await makeName({
      label: `web281-ext-${Date.now().toString(36)}`,
      owner: 'user',
    })
    // Extend only renders once the indexer knows the name's expiry.
    await waitForIndexedName(name)

    const expiryBefore = await getExpiry(publicClient as never, { name })
    const usdcBefore = await readUsdcBalance(owner)
    const allowanceBefore = await readRenewerAllowance(owner)

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, owner)
    await content(page)
      .getByRole('button', { name: 'Extend', exact: true })
      .click()
    const extendDialog = page.getByRole('dialog')
    await expect(extendDialog.getByText('Extend name')).toBeVisible()
    await extendDialog.getByRole('button', { name: 'Next' }).click()
    await expect(extendDialog.getByText('Confirm extension')).toBeVisible()
    await extendDialog.getByRole('button', { name: /^USDC/ }).click()

    // The wallet moves to another network between pricing and confirming.
    await switchWalletToUndeclaredChain(page, wallet)
    await extendDialog.getByRole('button', { name: 'Confirm' }).click()

    const txDialog = page.locator('[data-slot="dialog-content"]')
    await txDialog.getByRole('button', { name: 'Start', exact: true }).click()
    await txDialog
      .getByRole('button', { name: 'Open wallet', exact: true })
      .click()
    await expect
      .poll(
        async () =>
          wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0 ||
          (await txDialog.getByText('Transaction Error').isVisible()),
        { timeout: 30_000 },
      )
      .toBe(true)

    // ── The bug: the USDC approval was sent to the wallet on chain 1 ──
    expect(
      wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
      'the wallet must not be prompted to approve while it is on another chain',
    ).toBe(0)
    await expect(
      txDialog
        .getByText(/^Chain mismatch: this transaction is for chain/)
        .first(),
    ).toBeVisible()
    await expect(
      txDialog.getByText('Approve USDC for v2 renewal'),
    ).toBeVisible()

    // Nothing moved: balance, allowance and expiry are exactly as before.
    expect(await readUsdcBalance(owner)).toBe(usdcBefore)
    expect(await readRenewerAllowance(owner)).toBe(allowanceBefore)
    expect(await getExpiry(publicClient as never, { name })).toBe(expiryBefore)

    // ── Positive control: back on Sepolia, the same modal renews ──
    await switchWalletToSepolia(page, wallet)
    await txDialog
      .getByRole('button', { name: 'Try again', exact: true })
      .click()
    await expect
      .poll(
        () => wallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        { timeout: 15_000 },
      )
      .toBe(1)
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${V2_RENEWER}`,
      `renewal-renew-${name}`,
    ])

    // Charged and renewed on Sepolia, where the calldata belongs. The duration
    // is whatever the modal defaulted to, so compare directions, not amounts.
    await expect
      .poll(() => getExpiry(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBeGreaterThan(expiryBefore)
    expect(await readUsdcBalance(owner)).toBeLessThan(usdcBefore)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEB-1229 (PR #1284) — a step that landed after an automatic resubmission is
// a step that landed.
//
// The bug: when a wallet send failed with a retryable error, the transaction
// machine resubmitted it, but the failed attempt's error stayed in
// `context.error` through `pending`, `confirming` and `success`. The portal
// reads `context.error` as "this step failed" in two places: the registration
// "Try again" retires every step that has one, and closing the modal clears
// every transaction when the latest one has one. So a commit that landed on its
// second send went back to "Not Started" after a later failure, and closing the
// modal during the commit-reveal wait wiped the whole run's steps — leaving
// "Start" on a deploy that had already been paid for.
//
// The fix: `submitting` clears `error` when it receives a hash.
//
// The PR's unit tests stub the wallet transport, the receipt and the
// registration actor. These run the real registration machine against the
// fork, with the headless wallet failing one real `eth_sendTransaction`. The
// oracles are the transaction ids' own state lines, the explorer hash on each
// "Done" badge checked against the mined transaction, and a scan of every
// transaction the wallet mined: exactly one commitment.
//
// Since WEB-1572 (PR #1310) a wallet deploys its resolver once and reuses it,
// so whether a run has a "Deploy resolver" step depends on the fork's history.
// These tests deploy `user`'s resolver up front (`ensureWalletResolver`), so
// every run starts at the commitment and never deploys.
//
// Harness note: the headless wallet's `reject` crosses into the page through
// `exposeFunction`, which keeps only the message, so every rejection reaches
// the app as a code-less (retryable) error — 4001 included. A step that must
// fail for good is therefore rejected on every attempt (1 + 3 retries).
// ─────────────────────────────────────────────────────────────────────────────

const ETH_REGISTRAR = ensjsSepolia.ensEthRegistrar.address
const VERIFIABLE_FACTORY = ensjsSepolia.ensVerifiableFactory.address
const COMMIT_SELECTOR = toFunctionSelector('commit(bytes32)')
/** The transaction machine's default `retryCount`: 1 send + 3 resubmissions. */
const SUBMISSION_ATTEMPTS = 4

/** Sets the wallet's USDC allowance to the registrar, which decides whether
 * the run has an approve step. */
async function setRegistrarAllowance(owner: Address, amount: bigint) {
  await testClient.impersonateAccount({ address: owner })
  try {
    const hash = await walletClient.writeContract({
      account: owner,
      chain: undefined,
      address: MOCK_USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [ETH_REGISTRAR, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash })
  } finally {
    await testClient.stopImpersonatingAccount({ address: owner })
  }
}

/** Every transaction `owner` mined after `fromBlock`, by what it did. */
async function minedRegistrationSends(owner: Address, fromBlock: bigint) {
  // Uncached: a send mined moments ago must be in range.
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 })
  const sends = { deploy: [] as Hash[], commit: [] as Hash[], other: 0 }
  for (let n = fromBlock + 1n; n <= latest; n++) {
    const block = await publicClient.getBlock({
      blockNumber: n,
      includeTransactions: true,
    })
    for (const tx of block.transactions) {
      if (tx.from.toLowerCase() !== owner.toLowerCase()) continue
      const to = tx.to?.toLowerCase()
      if (to === VERIFIABLE_FACTORY.toLowerCase()) sends.deploy.push(tx.hash)
      else if (
        to === ETH_REGISTRAR.toLowerCase() &&
        tx.input.startsWith(COMMIT_SELECTOR)
      )
        sends.commit.push(tx.hash)
      else sends.other += 1
    }
  }
  return sends
}

/** Records every `tx-reg-*` state line the page logs, in order. */
function recordRegistrationTxStates(page: Page) {
  const lines: string[] = []
  page.on('console', (msg) => {
    const match = msg.text().match(/Transaction (tx-reg-[\w-]+) state: (\w+)/)
    if (match) lines.push(`${match[1]}:${match[2]}`)
  })
  return lines
}

const pendingSends = (wallet: Web3ProviderBackend) =>
  wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)

async function waitForWalletPrompt(wallet: Web3ProviderBackend) {
  await expect
    .poll(() => pendingSends(wallet), { timeout: 60_000 })
    .toBeGreaterThan(0)
}

/** Fails the pending send the way a dropped connection would. */
async function failSendTransiently(wallet: Web3ProviderBackend) {
  await waitForWalletPrompt(wallet)
  await wallet.reject(
    Web3RequestKind.SendTransaction,
    new Error('socket hang up') as never,
  )
}

/** The overview row for one step, by its title. */
const overviewRow = (dialog: Locator, title: string) =>
  dialog.getByRole('button').filter({
    has: dialog.page().getByRole('heading', { name: title, exact: true }),
  })

/**
 * Asserts a step's overview row reads "Done" and links the transaction that
 * really mined, and returns that hash.
 */
async function expectStepDone(dialog: Locator, title: string, owner: Address) {
  const row = overviewRow(dialog, title)
  await expect(row, `${title} must still read Done`).toContainText('Done')
  await expect(row).not.toContainText('Not Started')
  const href = await row.getByRole('link').getAttribute('href')
  const hash = href?.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hash | undefined
  expect(hash, `${title}'s Done badge must link its transaction`).toBeTruthy()
  const receipt = await publicClient.getTransactionReceipt({
    hash: hash as Hash,
  })
  expect(receipt.status).toBe('success')
  expect(receipt.from.toLowerCase()).toBe(owner.toLowerCase())
  return hash as Hash
}

/** From the step-by-step view back to the overview (the icon-only arrow). */
async function showOverview(dialog: Locator) {
  if (await dialog.getByText('Transaction overview').isVisible()) return
  await dialog.getByRole('button').first().click()
  await expect(dialog.getByText('Transaction overview')).toBeVisible()
}

/**
 * Opens the registration modal for `name` with USDC and presses Start. The
 * wallet's resolver already exists, so the commitment is the first send: it
 * fails transiently, and the automatic resubmission is authorized and lands.
 */
async function startWithResubmittedCommit(
  page: Page,
  wallet: Web3ProviderBackend,
  name: string,
  states: string[],
) {
  await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
  const paymentSection = page.locator(
    'section:has-text("Select payment method")',
  )
  await expect(paymentSection).toBeVisible({ timeout: 30_000 })
  await paymentSection.getByRole('button', { name: 'USDC' }).first().click()
  await paymentSection.getByRole('button', { name: /^Register$/i }).click()

  const dialog = page.locator('[data-slot="dialog-content"]')
  await expect(overviewRow(dialog, 'Submit commitment')).toBeVisible()
  await expect(overviewRow(dialog, 'Deploy resolver')).toHaveCount(0)
  await dialog.getByRole('button', { name: /^Start$/i }).click()
  await dialog.getByRole('button', { name: /open wallet/i }).click()

  // The commitment's first send fails; the machine resubmits on its own.
  await failSendTransiently(wallet)
  await expect
    .poll(() => states.includes('tx-reg-commit:retrying'), { timeout: 15_000 })
    .toBe(true)
  await waitForWalletPrompt(wallet)
  await wallet.authorize(Web3RequestKind.SendTransaction)
  await expect
    .poll(() => states.includes('tx-reg-commit:success'), { timeout: 60_000 })
    .toBe(true)
  return dialog
}

/** Fails the approve for good: every attempt the machine makes is rejected. */
async function failApproveForGood(
  wallet: Web3ProviderBackend,
  states: string[],
) {
  for (let attempt = 0; attempt < SUBMISSION_ATTEMPTS; attempt++) {
    await waitForWalletPrompt(wallet)
    await wallet.reject(Web3RequestKind.SendTransaction)
  }
  await expect
    .poll(() => states.includes('tx-reg-approve:error'), { timeout: 30_000 })
    .toBe(true)
}

/** Authorizes whatever the run still asks for until the register step lands. */
async function finishRegistration(
  dialog: Locator,
  wallet: Web3ProviderBackend,
  states: string[],
) {
  const deadline = Date.now() + 180_000
  while (!states.includes('tx-reg-register:success')) {
    expect(Date.now(), 'the register step never landed').toBeLessThan(deadline)
    if (pendingSends(wallet) > 0) {
      await wallet.authorize(Web3RequestKind.SendTransaction)
      continue
    }
    const action = dialog.getByRole('button', { name: /^(Open wallet|Next)$/ })
    if (
      (await action.isVisible().catch(() => false)) &&
      (await action.isEnabled().catch(() => false))
    ) {
      await action.click({ timeout: 2_000 }).catch(() => {})
    }
    await dialog.page().waitForTimeout(1_000)
  }
}

test.describe('Portal registration — a step that landed on a resubmission stays landed (WEB-1229)', () => {
  // These tests pick the allowance to choose whether the run has an approve
  // step. Other registration tests depend on it too (the name-switch test
  // fails when the run has one), so put it back as found.
  let allowanceBefore: bigint
  test.beforeEach(async ({ accounts }) => {
    await ensureWalletResolver(accounts.getAddress('user'))
    allowanceBefore = await publicClient.readContract({
      address: MOCK_USDC,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [accounts.getAddress('user'), ETH_REGISTRAR],
    })
  })
  test.afterEach(async ({ accounts }) => {
    await setRegistrarAllowance(accounts.getAddress('user'), allowanceBefore)
  })

  test('Try again after a failed approve keeps the commitment that landed on its second send', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet, accounts }) => {
    test.setTimeout(180_000)
    const owner = accounts.getAddress('user')
    await setRegistrarAllowance(owner, 0n) // the run must have an approve step
    const states = recordRegistrationTxStates(page)
    await connectWithHeadlessWallet(page, wallet)
    const name = `e2e-web1229-${Date.now().toString(36)}.eth`

    const dialog = await startWithResubmittedCommit(page, wallet, name, states)
    await failApproveForGood(wallet, states)

    // Positive control: the approve really failed, and the modal says so.
    await expect(dialog.getByText('Transaction Error')).toBeVisible()
    const tryAgain = dialog.getByRole('button', { name: 'Try again' })
    await expect(tryAgain).toBeVisible()
    await tryAgain.click()

    // Try again re-asks for the failed approve (every earlier prompt was
    // answered, so this one is new) — the retry is live …
    await waitForWalletPrompt(wallet)

    // … and only the approve was retired. The bug sent the commitment back to
    // "Not Started" here.
    await showOverview(dialog)
    await expect(overviewRow(dialog, 'Approve payment')).toContainText(
      'In Progress',
    )
    await expectStepDone(dialog, 'Submit commitment', owner)
    // One resubmission, one landing: the retry did not send the commitment again.
    expect(states.filter((s) => s.startsWith('tx-reg-commit:'))).toEqual([
      'tx-reg-commit:retrying',
      'tx-reg-commit:submitting',
      'tx-reg-commit:pending',
      'tx-reg-commit:success',
    ])
  })

  test('the retried run finishes with the one commitment it already paid for', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(300_000)
    const owner = accounts.getAddress('user')
    await setRegistrarAllowance(owner, 0n)
    const states = recordRegistrationTxStates(page)
    await connectWithHeadlessWallet(page, wallet)
    const name = `e2e-web1229-${Date.now().toString(36)}.eth`
    const fromBlock = await publicClient.getBlockNumber()

    const dialog = await startWithResubmittedCommit(page, wallet, name, states)
    await failApproveForGood(wallet, states)
    await dialog.getByRole('button', { name: 'Try again' }).click()

    await showOverview(dialog)
    const commitHash = await expectStepDone(dialog, 'Submit commitment', owner)

    await finishRegistration(dialog, wallet, states)
    await expect
      .poll(() => getOwner(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBe(owner)

    // The chain agrees: one commitment — the one the modal showed as Done —
    // and no deploy for the whole run.
    const sends = await minedRegistrationSends(owner, fromBlock)
    expect(sends.commit).toEqual([commitHash])
    expect(sends.deploy).toEqual([])
  })

  test('closing the modal during the commitment wait keeps the steps that landed', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(300_000)
    const owner = accounts.getAddress('user')
    // No approve step: the commitment stays the latest transaction for the
    // whole commit-reveal wait, which is the window the user closes it in.
    await setRegistrarAllowance(owner, maxUint256)
    const states = recordRegistrationTxStates(page)
    await connectWithHeadlessWallet(page, wallet)
    const name = `e2e-web1229-${Date.now().toString(36)}.eth`
    const fromBlock = await publicClient.getBlockNumber()

    const dialog = await startWithResubmittedCommit(page, wallet, name, states)
    await expect(dialog.getByText(/^Ready in \d+s$/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    const viewProgress = page.getByRole('button', {
      name: 'View registration progress',
    })
    await viewProgress.click()
    await showOverview(dialog)

    // The bug cleared every transaction on close: the landed commitment read
    // "Not Started" and the primary action offered to Start the run again.
    await expect(overviewRow(dialog, 'Register name')).toContainText(
      'Not Started',
    ) // loaded: the step still ahead is listed
    const commitHash = await expectStepDone(dialog, 'Submit commitment', owner)
    await expect(
      dialog.getByRole('button', { name: 'Start', exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('button', { name: 'Next', exact: true }),
    ).toBeVisible()

    await finishRegistration(dialog, wallet, states)
    await expect
      .poll(() => getOwner(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBe(owner)
    const sends = await minedRegistrationSends(owner, fromBlock)
    expect(sends.deploy).toEqual([])
    expect(sends.commit).toEqual([commitHash])
  })
  // KNOWN DEFECT E2E-018 (docs/e2e-defects.md), found verifying WEB-1229 but
  // not caused by it. The PR stops a *stale* error from triggering the modal's
  // close-time `transactionManager.clear()`; a *real* failure still does, and
  // `clear()` drops every transaction, not just the failed one. The reopened
  // modal then shows the landed deploy and commitment as "Not Started" with
  // Start, and pressing Start (not done here) mines a second deploy and a
  // second commitment for the same registration.
  //
  // Expected to fail until E2E-018 is fixed; Playwright errors the day it
  // passes. The assertions are what a working modal must show, unweakened.
  test('closing the modal after a step really failed keeps the steps that landed', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.fail()
    test.setTimeout(180_000)
    const owner = accounts.getAddress('user')
    await setRegistrarAllowance(owner, 0n)
    const states = recordRegistrationTxStates(page)
    await connectWithHeadlessWallet(page, wallet)
    const name = `e2e-e2e018-${Date.now().toString(36)}.eth`

    const dialog = await startWithResubmittedCommit(page, wallet, name, states)
    await failApproveForGood(wallet, states)
    await expect(dialog.getByText('Transaction Error')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page
      .getByRole('button', { name: 'View registration progress' })
      .click()
    await showOverview(dialog)
    await expect(overviewRow(dialog, 'Register name')).toContainText(
      'Not Started',
    ) // loaded

    // The defect: the commitment reads "Not Started", and Start is offered.
    await expectStepDone(dialog, 'Submit commitment', owner)
    await expect(
      dialog.getByRole('button', { name: 'Start', exact: true }),
    ).toHaveCount(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEB-1572 (PR #1310) — one resolver per wallet, deployed once.
//
// The bug: every portal registration deployed a brand-new PermissionedResolver
// proxy for the name, under a random salt. A wallet paid a deploy transaction
// on every registration and ended up with one resolver per name.
//
// The fix: the resolver salt is fixed per owner (`computeResolverSalt`, the
// same formula manager uses), so a wallet's resolver lives at one CREATE2
// address. The registration machine's new `checkingResolver` state reads the
// code there and skips straight to the commitment when it exists, and the
// portal only lists "Deploy resolver" when it doesn't. When there is no deploy
// step, "Submit commitment" starts the run.
//
// The PR's unit tests check the address formula against manager's, and the
// step list with the code read mocked. These register on the fork with a fresh
// wallet each, so "first registration" is a real state: the oracles are the
// `ProxyDeployed` event of the one deploy, every transaction the wallet mined
// (by target), and the resolver the .eth registry records for each name.
// ─────────────────────────────────────────────────────────────────────────────

const ETH_REGISTRY = ensjsSepolia.ensRegistry.address
const PERMISSIONED_RESOLVER_IMPL =
  ensjsSepolia.ensPermissionedResolverImpl.address
const ANVIL_FUNDER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

/**
 * Manager's per-owner resolver salt (`computeResolverSalt` in
 * `@ens-apps/smart-account`), written out here because that package is not an
 * e2e dependency. A resolver deployed with it is the one the PR says the portal
 * shares with manager; the reuse test proves the portal finds it.
 */
const walletResolverSalt = (owner: Address) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
        [keccak256(stringToHex('OwnedResolver')), owner, 0n],
      ),
    ),
  )

/** The `PermissionedResolver.initialize` call the app deploys with. */
const walletResolverInit = (owner: Address) =>
  encodeFunctionData({
    abi: permissionedResolverInitializeSnippet,
    functionName: 'initialize',
    args: [
      [
        {
          account: owner,
          roleBitmap: BigInt(`0x${'1'.repeat(64)}`),
        },
      ],
      [],
    ],
  })

/**
 * Deploys `owner`'s resolver at its fixed address unless it is already there.
 * `deployProxy` only simulates while the address is free, so a revert after
 * the deploy (or instead of it) means the resolver exists.
 */
async function ensureWalletResolver(owner: Address) {
  const call = {
    account: owner,
    address: VERIFIABLE_FACTORY,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: 'deployProxy',
    args: [
      PERMISSIONED_RESOLVER_IMPL,
      walletResolverSalt(owner),
      walletResolverInit(owner),
    ],
  } as const
  const isFree = () =>
    publicClient.simulateContract(call).then(
      () => true,
      () => false,
    )
  if (await isFree()) {
    await testClient.impersonateAccount({ address: owner })
    try {
      const hash = await walletClient.writeContract({
        ...call,
        chain: undefined,
      })
      await publicClient.waitForTransactionReceipt({ hash })
    } finally {
      await testClient.stopImpersonatingAccount({ address: owner })
    }
  }
  expect(await isFree(), `${owner}'s resolver must be deployed`).toBe(false)
}

/**
 * A wallet nothing has used: gas, 10 000 USDC, and a headless provider holding
 * only its key. Every registration it makes is its own, so "first" is real.
 */
async function freshWallet(page: Page) {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  await testClient.setBalance({
    address: account.address,
    value: parseEther('100'),
  })
  const hash = await walletClient.writeContract({
    account: ANVIL_FUNDER,
    chain: undefined,
    address: MOCK_USDC,
    abi: parseAbi(['function mint(address to, uint256 amount)']),
    functionName: 'mint',
    args: [account.address, 10_000_000_000n],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  const wallet = await injectHeadlessWeb3Provider({
    page,
    privateKeys: [privateKey],
    chains: [{ ...sepolia, rpcUrls: { default: { http: [ANVIL_RPC_URL] } } }],
  })
  return { account, wallet }
}

/** The proxy a mined deploy created, from its `ProxyDeployed` event. */
async function deployedProxy(hash: Hash): Promise<Address> {
  const receipt = await publicClient.getTransactionReceipt({ hash })
  const [event] = parseEventLogs({
    abi: proxyDeployedEventSnippet,
    eventName: 'ProxyDeployed',
    logs: receipt.logs,
  })
  expect(event, `deploy ${hash} must emit ProxyDeployed`).toBeTruthy()
  return event.args.proxyAddress
}

/** The resolver the .eth registry holds for `name`. */
const registryResolver = (name: string) =>
  publicClient.readContract({
    address: ETH_REGISTRY,
    abi: permissionedRegistryGetResolverSnippet,
    functionName: 'getResolver',
    args: [name.replace(/\.eth$/, '')],
  })

/**
 * Opens the checkout modal for `name` with USDC and waits for its step list —
 * "Submit commitment" is listed on every new run, so it is the loaded sign.
 */
async function openRegistrationOverview(page: Page) {
  const paymentSection = page.locator(
    'section:has-text("Select payment method")',
  )
  await expect(paymentSection).toBeVisible({ timeout: 30_000 })
  await paymentSection.getByRole('button', { name: 'USDC' }).first().click()
  await paymentSection.getByRole('button', { name: /^Register$/i }).click()
  const dialog = page.locator('[data-slot="dialog-content"]')
  await expect(dialog.getByText('Transaction overview')).toBeVisible({
    timeout: 30_000,
  })
  await expect(overviewRow(dialog, 'Submit commitment')).toBeVisible()
  await expect(overviewRow(dialog, 'Register name')).toBeVisible()
  return dialog
}

/** Presses Start and authorizes every step until the register lands. */
async function startAndFinish(
  dialog: Locator,
  wallet: Web3ProviderBackend,
  states: string[],
) {
  await dialog.getByRole('button', { name: 'Start', exact: true }).click()
  await finishRegistration(dialog, wallet, states)
}

test.describe('Portal registration — one resolver per wallet (WEB-1572)', () => {
  test('a wallet deploys its resolver on its first registration and reuses it on the next', async ({
    page,
  }) => {
    test.setTimeout(420_000)
    const { account, wallet } = await freshWallet(page)
    const owner = account.address
    const states = recordRegistrationTxStates(page)
    const stamp = Date.now().toString(36)
    const first = `e2e-web1572-a-${stamp}.eth`
    const second = `e2e-web1572-b-${stamp}.eth`

    await page.goto(`${PORTAL_APP_URL}/register?name=${first}`)
    await connectWithHeadlessWallet(page, wallet)

    // ── First registration: the deploy is listed and mined, once ─────────
    // Positive control for the second run's missing step.
    const fromFirst = await publicClient.getBlockNumber({ cacheTime: 0 })
    let dialog = await openRegistrationOverview(page)
    await expect(overviewRow(dialog, 'Deploy resolver')).toBeVisible()
    await startAndFinish(dialog, wallet, states)
    await expect
      .poll(() => getOwner(publicClient as never, { name: first }), {
        timeout: 30_000,
      })
      .toBe(owner)

    const firstSends = await minedRegistrationSends(owner, fromFirst)
    expect(firstSends.deploy).toHaveLength(1)
    const resolver = await deployedProxy(firstSends.deploy[0])
    expect(await registryResolver(first)).toBe(resolver)

    // ── Second registration, on a fresh load ─────────────────────────────
    // Not reached in-app: after a registration, the next name's modal first
    // opens on the finished run's steps (all "Done", no Start), on the pre-fix
    // build too. KNOWN DEFECT E2E-019 (docs/e2e-defects.md).
    await expect(page.getByText('Congratulations!')).toBeVisible({
      timeout: 60_000,
    })
    await page.goto(`${PORTAL_APP_URL}/register?name=${second}`)

    states.length = 0
    const fromSecond = await publicClient.getBlockNumber({ cacheTime: 0 })
    dialog = await openRegistrationOverview(page)
    // The bug: "Deploy resolver" was listed (and mined) on every run.
    await expect(overviewRow(dialog, 'Deploy resolver')).toHaveCount(0)
    await startAndFinish(dialog, wallet, states)
    await expect
      .poll(() => getOwner(publicClient as never, { name: second }), {
        timeout: 30_000,
      })
      .toBe(owner)

    const secondSends = await minedRegistrationSends(owner, fromSecond)
    expect(secondSends.deploy, 'the second run must not deploy').toEqual([])
    expect(secondSends.commit).toHaveLength(1)
    expect(await registryResolver(second)).toBe(resolver)
    expect(
      states.filter((s) => s.startsWith('tx-reg-deploy-resolver:')),
    ).toEqual([])
  })

  test('a resolver already deployed at the wallet’s address (as manager deploys it) is reused', {
    tag: ['@smoke'],
  }, async ({ page }) => {
    test.setTimeout(300_000)
    const { account, wallet } = await freshWallet(page)
    const owner = account.address

    // Deployed by the wallet itself with manager's salt, outside the portal.
    const seedHash = await walletClient.writeContract({
      account,
      chain: undefined,
      address: VERIFIABLE_FACTORY,
      abi: verifiableFactoryDeployProxySnippet,
      functionName: 'deployProxy',
      args: [
        PERMISSIONED_RESOLVER_IMPL,
        walletResolverSalt(owner),
        walletResolverInit(owner),
      ],
    })
    await publicClient.waitForTransactionReceipt({ hash: seedHash })
    const resolver = await deployedProxy(seedHash)

    const states = recordRegistrationTxStates(page)
    const name = `e2e-web1572-seeded-${Date.now().toString(36)}.eth`
    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    await connectWithHeadlessWallet(page, wallet)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    const dialog = await openRegistrationOverview(page)
    await expect(overviewRow(dialog, 'Deploy resolver')).toHaveCount(0)

    // With no deploy step, Start must open the commitment itself.
    await startAndFinish(dialog, wallet, states)
    expect(states[0], 'the run’s first transaction is the commitment').toMatch(
      /^tx-reg-commit:/,
    )
    expect(
      states.filter((s) => s.startsWith('tx-reg-deploy-resolver:')),
    ).toEqual([])
    await expect
      .poll(() => getOwner(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBe(owner)

    const sends = await minedRegistrationSends(owner, fromBlock)
    expect(
      sends.deploy,
      'the portal must not deploy a second resolver',
    ).toEqual([])
    expect(await registryResolver(name)).toBe(resolver)
  })

  // Guard, green on the pre-fix build too: a run reloaded at the commit prompt
  // resumes at the commitment, which never re-deployed.
  test('a run abandoned after its deploy landed reuses that resolver when restarted', async ({
    page,
  }) => {
    test.setTimeout(360_000)
    const { account, wallet } = await freshWallet(page)
    const owner = account.address
    const states = recordRegistrationTxStates(page)
    const name = `e2e-web1572-restart-${Date.now().toString(36)}.eth`
    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    await connectWithHeadlessWallet(page, wallet)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    // Deploy lands; the page is reloaded while the commit is still waiting
    // for the wallet, so nothing of the run but the resolver is on chain.
    let dialog = await openRegistrationOverview(page)
    await expect(overviewRow(dialog, 'Deploy resolver')).toBeVisible()
    await dialog.getByRole('button', { name: 'Start', exact: true }).click()
    await dialog.getByRole('button', { name: /open wallet/i }).click()
    await waitForWalletPrompt(wallet)
    await wallet.authorize(Web3RequestKind.SendTransaction)
    await expect
      .poll(() => states.includes('tx-reg-deploy-resolver:success'), {
        timeout: 60_000,
      })
      .toBe(true)
    const deploys = (await minedRegistrationSends(owner, fromBlock)).deploy
    expect(deploys).toHaveLength(1)
    const resolver = await deployedProxy(deploys[0])
    expect((await minedRegistrationSends(owner, fromBlock)).commit).toEqual([])

    await page.reload()
    // The commit prompt from before the reload is still queued in the
    // headless wallet; answering it would send a stale commitment.
    while (pendingSends(wallet) > 0) {
      await wallet.reject(Web3RequestKind.SendTransaction)
    }
    states.length = 0

    // The page reopens the unfinished run's modal on its own. The restarted
    // run finds the resolver and goes straight to the commit.
    dialog = page.locator('[data-slot="dialog-content"]')
    await expect(dialog.getByText('Transaction overview')).toBeVisible({
      timeout: 30_000,
    })
    await expect(overviewRow(dialog, 'Submit commitment')).toContainText(
      'Not Started',
    )
    await expect(overviewRow(dialog, 'Register name')).toBeVisible()
    await expect(overviewRow(dialog, 'Deploy resolver')).toHaveCount(0)
    await startAndFinish(dialog, wallet, states)
    await expect
      .poll(() => getOwner(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBe(owner)

    const sends = await minedRegistrationSends(owner, fromBlock)
    expect(sends.deploy, 'one deploy for the whole registration').toEqual(
      deploys,
    )
    expect(sends.commit).toHaveLength(1)
    expect(await registryResolver(name)).toBe(resolver)
  })

  test('a deploy that lands after its run was lost is reused, not sent again', async ({
    page,
  }) => {
    test.setTimeout(360_000)
    const { account, wallet } = await freshWallet(page)
    const owner = account.address
    const states = recordRegistrationTxStates(page)
    const name = `e2e-web1572-lost-${Date.now().toString(36)}.eth`
    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    await connectWithHeadlessWallet(page, wallet)
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    // The deploy is sent but held in the mempool, and the page is reloaded
    // before it mines: the run that sent it never learns it landed.
    let dialog = await openRegistrationOverview(page)
    await expect(overviewRow(dialog, 'Deploy resolver')).toBeVisible()
    await testClient.setAutomine(false)
    try {
      await dialog.getByRole('button', { name: 'Start', exact: true }).click()
      await dialog.getByRole('button', { name: /open wallet/i }).click()
      await waitForWalletPrompt(wallet)
      await wallet.authorize(Web3RequestKind.SendTransaction)
      await expect
        .poll(() => states.includes('tx-reg-deploy-resolver:pending'), {
          timeout: 30_000,
        })
        .toBe(true)
      await page.reload()
      await testClient.mine({ blocks: 1 })
    } finally {
      await testClient.setAutomine(true)
    }
    const deploys = (await minedRegistrationSends(owner, fromBlock)).deploy
    expect(deploys, 'the held deploy must have landed').toHaveLength(1)
    const resolver = await deployedProxy(deploys[0])
    states.length = 0

    // Whatever the reloaded page offers — the reopened run or a new checkout —
    // it must not deploy again.
    dialog = page.locator('[data-slot="dialog-content"]')
    if (!(await dialog.getByText('Transaction overview').isVisible())) {
      dialog = await openRegistrationOverview(page)
    }
    await expect(overviewRow(dialog, 'Submit commitment')).toBeVisible()
    // The bug: "Deploy resolver" again, under a new salt.
    await expect(overviewRow(dialog, 'Deploy resolver')).toHaveCount(0)
    await startAndFinish(dialog, wallet, states)
    await expect
      .poll(() => getOwner(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBe(owner)

    const sends = await minedRegistrationSends(owner, fromBlock)
    expect(sends.deploy, 'one deploy for the whole registration').toEqual(
      deploys,
    )
    expect(await registryResolver(name)).toBe(resolver)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WEB-1485 (PR #1221) — a failed token price read must block checkout, never
// price the name at $0.
//
// The bug: `buildTokenData` replaced any price it couldn't read with
// `DEFAULT_PRICE` (`total: 0n`). A reverted or malformed `getRegisterPrice` /
// `getRenewPrice` read therefore made every token "available" at $0 — an empty
// wallet looked sufficient, the approval step was skipped (allowance ≥ 0), and
// the registrar still pulled its live price. The Extend modal let "Next" through
// on no price and rendered nothing on the confirm step. Separately, renewals
// approved 2× the price, and `renew()` takes no amount, so the allowance was the
// only cap on the charge and half of it was left standing afterwards.
//
// The fix: the picker treats a settled price read that errored as a blocking
// "Couldn't load price" card with a retry and drops any selection it was
// holding; Extend keeps "Next" disabled until the price resolves and shows the
// same card on the confirm step; the checkout summaries pass the token so they
// share one cache entry with the picker; renewals approve the exact price.
//
// The PR's unit tests feed the picker rejected queries and check the approve
// intent's amount. These fail the real price `eth_call`s inside the browser's
// JSON-RPC batches (every other call reaches the fork untouched), so they reach
// the real register page, the real Extend modal and the real query cache. The
// money test renews on the fork: the oracle is the mined approve's calldata,
// the renewer's allowance afterwards and the USDC balance delta, each checked
// against the renewer's own `getRenewPrice` for the duration that really landed.
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_ABI = [
  ...ethRegistrarGetRegisterPriceSnippet.filter((f) => f.type === 'function'),
  ...ethRegistrarGetRenewPriceSnippet.filter((f) => f.type === 'function'),
]
const APPROVE_SELECTOR = toFunctionSelector(
  'approve(address spender, uint256 amount)',
)

type PriceCall = {
  readonly fn: 'getRegisterPrice' | 'getRenewPrice'
  readonly label: string
  readonly duration: bigint
  readonly token: Address
  failed: boolean
}

type RpcRequest = {
  readonly id: number
  readonly method: string
  readonly params?: readonly [{ readonly data?: string; readonly to?: string }]
}

function decodePriceCall(request: RpcRequest): PriceCall | null {
  const data = request.params?.[0]?.data
  if (request.method !== 'eth_call' || !data) return null
  try {
    const { functionName, args } = decodeFunctionData({
      abi: PRICE_ABI,
      data: data as Hash,
    })
    const [label, duration, token] = args
    return { fn: functionName, label, duration, token, failed: false }
  } catch {
    return null
  }
}

type RpcEntry = { readonly id: number }

/** What a node returns for a reverted call — code 3, which viem neither
 * retries nor fails over on. */
const revertedEntry = (id: number) => ({
  jsonrpc: '2.0',
  id,
  error: { code: 3, message: 'execution reverted', data: '0x' },
})

/**
 * Reverts the price reads `shouldFail` picks, the way a broken oracle or a
 * flaky node would. Every other request in the batch is forwarded to the fork.
 * Returns every price call the page made, in order — the evidence that a read
 * really failed, so the assertions after it can't pass on a page that never
 * priced anything.
 */
async function failPriceReads(
  page: Page,
  shouldFail: (call: PriceCall, earlier: readonly PriceCall[]) => boolean,
) {
  const calls: PriceCall[] = []
  const pickFailures = (requests: readonly RpcRequest[]) => {
    const failIds = new Set<number>()
    for (const request of requests) {
      const call = decodePriceCall(request)
      if (!call) continue
      call.failed = shouldFail(call, [...calls])
      calls.push(call)
      if (call.failed) failIds.add(request.id)
    }
    return failIds
  }
  await page.route('**/rpc', async (route) => {
    const body = route.request().postDataJSON() as RpcRequest | RpcRequest[]
    const failIds = pickFailures(Array.isArray(body) ? body : [body])
    if (failIds.size === 0) return route.continue()
    const response = await route.fetch()
    const json = (await response.json()) as RpcEntry | RpcEntry[]
    const entries = (Array.isArray(json) ? json : [json]).map((entry) =>
      failIds.has(entry.id) ? revertedEntry(entry.id) : entry,
    )
    return route.fulfill({
      response,
      json: Array.isArray(json) ? entries : entries[0],
    })
  })
  return calls
}

/** The picker's card replaces the "Select payment method" list when prices
 * fail, so the checkout is scoped to the page content, not that section. */
const checkoutOf = (page: Page) => content(page)

const tokenRows = (scope: Locator) =>
  scope.getByRole('button', { name: /^(USDC|DAI)\b/ })

/**
 * Waits until the picker has settled one way or the other — the error card
 * (fixed) or token rows (the old fallback) — so the assertions that follow
 * judge a finished render, not a skeleton.
 */
async function waitForPickerSettled(scope: Locator) {
  await expect(
    scope.getByText("Couldn't load price").or(tokenRows(scope)).first(),
  ).toBeVisible({ timeout: 30_000 })
}

/** `$8.01` — how the summary renders a USDC amount (rounded up to the cent). */
const usdcDisplay = (amount: bigint) =>
  `$${(Math.ceil(Number(amount) / 10_000) / 100).toFixed(2)}`

const MOCK_DAI = ensjsSepolia.dai.address
const V1_RENEWER = ensjsSepolia.ensEthRenewerV1.address
const V1_BASE_REGISTRAR = ensjsSepolia.ensBaseRegistrarImplementation.address
const ERC20_READ_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
])
const NAME_EXPIRES_ABI = parseAbi([
  'function nameExpires(uint256 id) view returns (uint256)',
])

const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()

/** Whether a mined transaction is `owner`'s `approve` on `token`. */
const isApproveFrom =
  (owner: Address, token: Address) =>
  (tx: { from: Address; to: Address | null; input: Hash }) =>
    sameAddress(tx.from, owner) &&
    tx.to !== null &&
    sameAddress(tx.to, token) &&
    tx.input.startsWith(APPROVE_SELECTOR)

/** Every `approve` on `token` that `owner` mined after `fromBlock`, decoded. */
async function minedApprovals(
  owner: Address,
  fromBlock: bigint,
  token: Address = MOCK_USDC,
) {
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 })
  const approvals: { spender: Address; amount: bigint }[] = []
  for (let n = fromBlock + 1n; n <= latest; n++) {
    const block = await publicClient.getBlock({
      blockNumber: n,
      includeTransactions: true,
    })
    for (const tx of block.transactions.filter(isApproveFrom(owner, token))) {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: tx.input })
      approvals.push({
        spender: args[0] as Address,
        amount: args[1] as bigint,
      })
    }
  }
  return approvals
}

/** The single USDC approve `owner` mined after `fromBlock`. */
async function minedApprove(owner: Address, fromBlock: bigint) {
  const approvals = await minedApprovals(owner, fromBlock)
  expect(approvals, 'exactly one USDC approval was mined').toHaveLength(1)
  return approvals[0]
}

const readTokenBalance = (token: Address, owner: Address) =>
  publicClient.readContract({
    address: token,
    abi: ERC20_READ_ABI,
    functionName: 'balanceOf',
    args: [owner],
  })

const readTokenAllowance = (token: Address, owner: Address, spender: Address) =>
  publicClient.readContract({
    address: token,
    abi: ERC20_READ_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  })

/** Sets `owner`'s `token` allowance to `spender`, so a run must approve. */
async function setTokenAllowance(
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
) {
  await testClient.impersonateAccount({ address: owner })
  try {
    const hash = await walletClient.writeContract({
      account: owner,
      chain: undefined,
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash })
  } finally {
    await testClient.stopImpersonatingAccount({ address: owner })
  }
}

/** A V1 name's registrar expiry — what `ETHRenewerV1.renew` extends. */
const readV1Expiry = (label: string) =>
  publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: NAME_EXPIRES_ABI,
    functionName: 'nameExpires',
    args: [BigInt(keccak256(toHex(label)))],
  })

/** The renewer's own price for renewing `label` by `duration` in `token`. */
const renewerPrice = (
  renewer: Address,
  label: string,
  duration: bigint,
  token: Address,
) =>
  publicClient.readContract({
    address: renewer,
    abi: PRICE_ABI,
    functionName: 'getRenewPrice',
    args: [label, duration, token],
  })

/**
 * Opens the names list with `names` selected and presses Extend. V1 names are
 * listed through the V1 subgraph, which can't see fork-seeded names (and the
 * local shim rejects the list's `wrappedOwner` filter), so they are injected;
 * pricing, approval and renewal all still run against the fork.
 */
async function extendFromNamesList(
  page: Page,
  owner: Address,
  names: { readonly v2: readonly string[]; readonly v1: readonly string[] },
  search: string,
) {
  await mockV1Subgraph(
    page,
    names.v1.map((name) => ({ name, ownerAddress: owner, type: 'unwrapped' })),
  )
  await page.goto(`${PORTAL_APP_URL}/addr/${owner}/names`)
  await content(page).getByPlaceholder('Search names...').fill(search)
  for (const name of [...names.v2, ...names.v1]) {
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toHaveCount(1, { timeout: 30_000 })
    await row.getByRole('checkbox').first().click()
  }
  const extend = page.getByRole('button', { name: 'Extend', exact: true })
  await expect(extend).toBeEnabled({ timeout: 30_000 })
  await extend.click()
  const dialog = page.getByRole('dialog')
  // The multi-name modal opens on a disclaimer. The single-name one shows it
  // only until ownership resolves, then skips it for the owner — so press it
  // if it is still there, and otherwise carry on from the settings step.
  const disclaimer = dialog.getByRole('button', { name: 'I Understand' })
  const next = dialog.getByRole('button', { name: 'Next' })
  await expect(disclaimer.or(next).first()).toBeVisible({ timeout: 30_000 })
  await disclaimer.click({ timeout: 5_000 }).catch(() => {})
  await expect(next).toBeVisible({ timeout: 30_000 })
  return dialog
}

/** From an open Extend dialog's settings step to a started USDC/DAI run. */
async function confirmExtendWith(
  page: Page,
  dialog: Locator,
  token: 'USDC' | 'DAI',
) {
  const next = dialog.getByRole('button', { name: 'Next' })
  await expect(next).toBeEnabled({ timeout: 30_000 })
  await expect(dialog.getByText(/^\$[\d,.]+$/).first()).toBeVisible({
    timeout: 30_000,
  })
  await next.click()
  await dialog.getByRole('button', { name: new RegExp(`^${token}\\b`) }).click()
  await dialog.getByRole('button', { name: /^(Confirm|Next)$/ }).click()
  // The Extend dialog unmounts as the transaction dialog opens.
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1, {
    timeout: 15_000,
  })
}

test.describe('Portal checkout — a failed price read blocks checkout instead of pricing it at $0 (WEB-1485)', () => {
  test('a register page whose price reads fail offers no token and no Register, then recovers on Try again', {
    tag: ['@smoke'],
  }, async ({ portalPage: page, wallet }) => {
    await connectWithHeadlessWallet(page, wallet)
    let failing = true
    const calls = await failPriceReads(page, () => failing)
    const name = `web1485-reg-${Date.now().toString(36)}.eth`

    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    const section = checkoutOf(page)
    await waitForPickerSettled(section)
    expect(
      calls.some((call) => call.fn === 'getRegisterPrice' && call.failed),
      'a registration price read really failed',
    ).toBe(true)

    // ── The bug: every token was offered, "available", at a $0 price ──
    await expect(
      tokenRows(section),
      'no token may be offered at a price the app could not read',
    ).toHaveCount(0)
    await expect(content(page).getByText('$0.00')).toHaveCount(0)
    await expect(section.getByText('available', { exact: true })).toHaveCount(0)
    await expect(section.getByText("Couldn't load price")).toBeVisible()
    await expect(
      section.getByText(
        "We couldn't fetch the registration price for this name. Please try again.",
      ),
    ).toBeVisible()
    await expect(
      section.getByRole('button', { name: /^Register$/i }),
    ).toBeDisabled()
    expect(pendingSends(wallet)).toBe(0)

    // ── Positive control: the same page prices and checks out once reads work ──
    failing = false
    await section.getByRole('button', { name: 'Try again' }).click()
    await expect(tokenRows(section).first()).toBeVisible({ timeout: 30_000 })
    await expect(section.getByText("Couldn't load price")).toHaveCount(0)
    const usdcCall = calls.findLast(
      (call) =>
        call.fn === 'getRegisterPrice' &&
        !call.failed &&
        call.token.toLowerCase() === MOCK_USDC.toLowerCase(),
    )
    if (!usdcCall) throw new Error('the retry never re-read the USDC price')
    const [base, premium] = await publicClient.readContract({
      address: ETH_REGISTRAR,
      abi: PRICE_ABI,
      functionName: 'getRegisterPrice',
      args: [usdcCall.label, usdcCall.duration, MOCK_USDC],
    })
    expect(base + premium).toBeGreaterThan(0n)
    await expect(
      content(page)
        .getByText(usdcDisplay(base + premium))
        .first(),
    ).toBeVisible()
    await section.getByRole('button', { name: /^USDC\b/ }).click()
    await expect(
      section.getByRole('button', { name: /^Register$/i }),
    ).toBeEnabled()
  })

  // A new duration is the only way the real page re-reads a price it already
  // has (retry is off and prices stay fresh for an hour), and a new duration
  // already cleared the pick before the fix — so the Register check below is a
  // guard here. What goes red on the old code is the token list: the new,
  // unread price was offered at $0. The PR's unit test covers a held pick
  // surviving a failed re-read of the *same* price.
  test('a later price read that fails clears the picked token and offers none at $0', async ({
    portalPage: page,
    wallet,
  }) => {
    await connectWithHeadlessWallet(page, wallet)
    let failing = false
    const calls = await failPriceReads(page, () => failing)
    const name = `web1485-held-${Date.now().toString(36)}.eth`

    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    const section = checkoutOf(page)
    await expect(tokenRows(section).first()).toBeVisible({ timeout: 30_000 })
    await section.getByRole('button', { name: /^USDC\b/ }).click()
    const register = section.getByRole('button', { name: /^Register$/i })
    await expect(register).toBeEnabled()

    // A new duration is a new price read — and this one fails.
    failing = true
    await content(page).getByText('2 years', { exact: true }).click()
    await expect
      .poll(() => calls.some((call) => call.failed), { timeout: 15_000 })
      .toBe(true)
    await waitForPickerSettled(section)

    // Guard: the pick made at the old price is gone.
    await expect(
      register,
      'the selection made at the old price must not survive a failed read',
    ).toBeDisabled()
    // ── The bug: the unread price was offered at $0 ──
    await expect(
      tokenRows(section),
      'no token may be offered at a price the app could not read',
    ).toHaveCount(0)
    await expect(content(page).getByText('$0.00')).toHaveCount(0)
    await expect(section.getByText("Couldn't load price")).toBeVisible()

    // Recovering does not resurrect the old pick: the visitor chooses again.
    failing = false
    await section.getByRole('button', { name: 'Try again' }).click()
    await expect(tokenRows(section).first()).toBeVisible({ timeout: 30_000 })
    await expect(register).toBeDisabled()
    await section.getByRole('button', { name: /^USDC\b/ }).click()
    await expect(register).toBeEnabled()
  })

  test('the summary and the token picker read one price, so they cannot disagree', async ({
    portalPage: page,
    wallet,
  }) => {
    await connectWithHeadlessWallet(page, wallet)
    // Only the very first USDC registration price read fails; any second read
    // of the same price would succeed and let the two panels diverge.
    const isUsdc = (call: PriceCall) =>
      call.fn === 'getRegisterPrice' &&
      call.token.toLowerCase() === MOCK_USDC.toLowerCase()
    const calls = await failPriceReads(
      page,
      (call, earlier) => isUsdc(call) && !earlier.some(isUsdc),
    )
    const name = `web1485-one-${Date.now().toString(36)}.eth`

    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    const section = checkoutOf(page)
    await waitForPickerSettled(section)
    await expect(
      content(page).getByText('Failed to load price').first(),
    ).toBeVisible({ timeout: 30_000 })

    // ── The bug: the summary and the picker each fetched the USDC price ──
    const usdcReads = calls.filter(isUsdc)
    expect(
      usdcReads.map((call) => `${call.duration}`),
      'one USDC price read per duration, shared by the summary and the picker',
    ).toEqual([...new Set(usdcReads.map((call) => `${call.duration}`))])
    // Both panels show the one failure — neither prices the name.
    await expect(section.getByText("Couldn't load price")).toBeVisible()
    await expect(tokenRows(section)).toHaveCount(0)

    // Positive control: one retry recovers both panels together.
    await section.getByRole('button', { name: 'Try again' }).click()
    await expect(tokenRows(section).first()).toBeVisible({ timeout: 30_000 })
    await expect(content(page).getByText('Failed to load price')).toHaveCount(0)
  })

  test('Extend keeps Next disabled while the renewal price read fails, and prices it once it loads', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(240_000)
    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const name = await makeName({
      label: `web1485-next-${Date.now().toString(36)}`,
      owner: 'user',
    })
    await waitForIndexedName(name)
    let failing = true
    const calls = await failPriceReads(page, () => failing)

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, owner)
    await content(page)
      .getByRole('button', { name: 'Extend', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Extend name')).toBeVisible()
    // Wait on the read itself, not on Next: before the fix Next was enabled
    // with no price at all, so it is no sign the modal has priced anything.
    await expect
      .poll(
        () => calls.some((call) => call.fn === 'getRenewPrice' && call.failed),
        { message: 'a renewal price read really failed', timeout: 30_000 },
      )
      .toBe(true)
    await expect(dialog.getByText('Failed to load price')).toBeVisible()
    const next = dialog.getByRole('button', { name: 'Next' })

    // ── The bug: Next led to a confirm step with nothing on it ──
    await expect(next, 'Next must wait for a price').toBeDisabled()
    await expect(dialog.getByText(/^\$[\d,.]+$/)).toHaveCount(0)

    // Positive control: reopened with reads working, the modal prices and continues.
    failing = false
    await dialog.getByRole('button', { name: 'Close' }).first().click()
    await expect(dialog).toHaveCount(0)
    await content(page)
      .getByRole('button', { name: 'Extend', exact: true })
      .click()
    await expect(next).toBeEnabled({ timeout: 30_000 })
    await expect(dialog.getByText(/^\$[\d,.]+$/).first()).toBeVisible()
    await next.click()
    await expect(dialog.getByText('Confirm extension')).toBeVisible()
    await expect(tokenRows(dialog).first()).toBeVisible({ timeout: 30_000 })
  })

  test('the Extend confirm step offers no token whose renewal price failed, and says so when the price itself fails', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(240_000)
    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const name = await makeName({
      label: `web1485-conf-${Date.now().toString(36)}`,
      owner: 'user',
    })
    await waitForIndexedName(name)
    // First only the non-USDC token's renewal price fails.
    let fail: 'other-token' | 'all' | 'none' = 'other-token'
    const calls = await failPriceReads(
      page,
      (call) =>
        call.fn === 'getRenewPrice' &&
        (fail === 'all' ||
          (fail === 'other-token' &&
            call.token.toLowerCase() !== MOCK_USDC.toLowerCase())),
    )

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, owner)
    await content(page)
      .getByRole('button', { name: 'Extend', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeEnabled({
      timeout: 30_000,
    })
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.getByText('Confirm extension')).toBeVisible()
    await waitForPickerSettled(dialog)
    expect(
      calls.some((call) => call.fn === 'getRenewPrice' && call.failed),
      'the other token’s renewal price read really failed',
    ).toBe(true)

    // ── The bug: the unpriced token was offered as "available" at $0 ──
    await expect(
      tokenRows(dialog),
      'no token may be offered at a renewal price the app could not read',
    ).toHaveCount(0)
    await expect(dialog.getByText("Couldn't load price")).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    // The renewal price itself now fails too: the whole step yields to the card.
    fail = 'all'
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(
      dialog.getByText(
        "We couldn't fetch the renewal price for this name. Please try again.",
      ),
    ).toBeVisible({ timeout: 30_000 })
    await expect(dialog.getByText('Total cost')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
    expect(pendingSends(wallet)).toBe(0)

    // Positive control: with reads working, Try again restores a confirmable step.
    fail = 'none'
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(dialog.getByText('Total cost')).toBeVisible({
      timeout: 30_000,
    })
    await expect(tokenRows(dialog).first()).toBeVisible({ timeout: 30_000 })
    await dialog.getByRole('button', { name: /^USDC\b/ }).click()
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  })

  test('Extend approves exactly the renewal price and leaves no allowance behind', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const name = await makeName({
      label: `web1485-exact-${Date.now().toString(36)}`,
      owner: 'user',
    })
    // makeName suffixes the label it is given, so read it back from the name.
    const label = name.replace(/\.eth$/, '')
    await waitForIndexedName(name)
    // No standing allowance, so the run must approve.
    await setRegistrarAllowance(owner, 0n)

    const expiryBefore = await getExpiry(publicClient as never, { name })
    const usdcBefore = await readUsdcBalance(owner)
    // Uncached: viem reuses a block number for a few seconds, which can
    // predate the setup approval above and count it as the app's.
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    // Nothing fails here: this only records the price reads the modal makes.
    const calls = await failPriceReads(page, () => false)

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, owner)
    await content(page)
      .getByRole('button', { name: 'Extend', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    // Wait for the quote itself — before the fix Next was enabled without one.
    const isUsdcQuote = (call: PriceCall) =>
      call.fn === 'getRenewPrice' &&
      call.token.toLowerCase() === MOCK_USDC.toLowerCase()
    await expect
      .poll(() => calls.some(isUsdcQuote), { timeout: 30_000 })
      .toBe(true)
    await expect(dialog.getByText(/^\$[\d,.]+$/).first()).toBeVisible({
      timeout: 30_000,
    })
    // The renewer's own price for the duration the modal quoted.
    const quoted = calls.findLast(isUsdcQuote)
    if (!quoted) throw new Error('the modal never read the USDC renewal price')
    const price = await publicClient.readContract({
      address: V2_RENEWER,
      abi: PRICE_ABI,
      functionName: 'getRenewPrice',
      args: [label, quoted.duration, MOCK_USDC],
    })
    expect(price).toBeGreaterThan(0n)

    await dialog.getByRole('button', { name: 'Next' }).click()
    await dialog.getByRole('button', { name: /^USDC\b/ }).click()
    await dialog.getByRole('button', { name: 'Confirm' }).click()
    // The Extend dialog unmounts as the transaction dialog opens.
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1, {
      timeout: 15_000,
    })
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${V2_RENEWER}`,
      `renewal-renew-${name}`,
    ])

    await expect
      .poll(() => getExpiry(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBeGreaterThan(expiryBefore)
    // The extension that landed is the one that was priced.
    expect(
      (await getExpiry(publicClient as never, { name })) - expiryBefore,
    ).toBe(quoted.duration)

    // ── The bug: the approval was 2× the price, and half of it stayed ──
    const approval = await minedApprove(owner, fromBlock)
    expect(approval.spender.toLowerCase()).toBe(V2_RENEWER.toLowerCase())
    expect(approval.amount, 'the approval is exactly the renewal price').toBe(
      price,
    )
    expect(
      await readRenewerAllowance(owner),
      'the renewal consumes the whole approval',
    ).toBe(0n)
    // Positive control: charged exactly the price, no more and no less.
    expect(usdcBefore - (await readUsdcBalance(owner))).toBe(price)
  })

  test('a disconnected visitor whose price reads fail sees no price and no checkout, then the price once reads work', async ({
    portalPage: page,
  }) => {
    // Guard: the old code also showed the summary's error and asked a
    // disconnected visitor to connect, so this pins the fix's ordering (the
    // connect prompt comes before the price card) rather than the bug.
    let failing = true
    const calls = await failPriceReads(page, () => failing)
    const name = `web1485-anon-${Date.now().toString(36)}.eth`

    await page.goto(`${PORTAL_APP_URL}/register?name=${name}`)
    await expect(content(page).getByText('Failed to load price')).toBeVisible({
      timeout: 30_000,
    })
    expect(
      calls.some((call) => call.fn === 'getRegisterPrice' && call.failed),
      'a registration price read really failed',
    ).toBe(true)
    await expect(content(page).getByText('$0.00')).toHaveCount(0)
    await expect(content(page).getByText(/^≈? ?\$[\d,.]+$/)).toHaveCount(0)
    await expect(tokenRows(content(page))).toHaveCount(0)
    await expect(
      content(page).getByRole('button', { name: 'Connect to register' }),
    ).toBeVisible()

    // Positive control: with reads working, the same visitor sees the price.
    failing = false
    await page.reload()
    await expect(
      content(page)
        .getByText(/^\$[\d,.]+$/)
        .first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(content(page).getByText('Failed to load price')).toHaveCount(0)
  })

  test('Extend paid in DAI approves exactly the DAI renewal price and leaves no allowance', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const name = await makeName({
      label: `web1485-dai-${Date.now().toString(36)}`,
      owner: 'user',
    })
    const label = name.replace(/\.eth$/, '')
    await waitForIndexedName(name)
    await setTokenAllowance(owner, MOCK_DAI, V2_RENEWER, 0n)

    const expiryBefore = await getExpiry(publicClient as never, { name })
    const daiBefore = await readTokenBalance(MOCK_DAI, owner)
    const usdcBefore = await readUsdcBalance(owner)
    // Uncached: viem reuses a block number for a few seconds, which can
    // predate the setup approval above and count it as the app's.
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expectNamePageLoaded(page, name, owner)
    await content(page)
      .getByRole('button', { name: 'Extend', exact: true })
      .click()
    await confirmExtendWith(page, page.getByRole('dialog'), 'DAI')
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${V2_RENEWER}`,
      `renewal-renew-${name}`,
    ])

    await expect
      .poll(() => getExpiry(publicClient as never, { name }), {
        timeout: 30_000,
      })
      .toBeGreaterThan(expiryBefore)
    const duration =
      (await getExpiry(publicClient as never, { name })) - expiryBefore
    const price = await renewerPrice(V2_RENEWER, label, duration, MOCK_DAI)
    expect(price).toBeGreaterThan(0n)

    // ── The bug: 2× the DAI price was approved, and half of it stayed ──
    const approvals = await minedApprovals(owner, fromBlock, MOCK_DAI)
    expect(approvals, 'exactly one DAI approval was mined').toHaveLength(1)
    expect(sameAddress(approvals[0].spender, V2_RENEWER)).toBe(true)
    expect(
      approvals[0].amount,
      'the approval is exactly the DAI renewal price',
    ).toBe(price)
    expect(
      await readTokenAllowance(MOCK_DAI, owner, V2_RENEWER),
      'the renewal consumes the whole approval',
    ).toBe(0n)
    // Positive control: charged exactly the price, in DAI, and nothing in USDC.
    expect(daiBefore - (await readTokenBalance(MOCK_DAI, owner))).toBe(price)
    expect(await readUsdcBalance(owner)).toBe(usdcBefore)
  })

  test('renewing a V1 name approves ETHRenewerV1 exactly its price and leaves no allowance', async ({
    portalPage: page,
    wallet,
    accounts,
  }) => {
    test.setTimeout(300_000)
    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const run = Date.now().toString(36)
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const name = await makeV1Name({
      label: `web1485-v1-${run}`,
      type: 'unwrapped',
    })
    const label = name.replace(/\.eth$/, '')
    await setTokenAllowance(owner, MOCK_USDC, V1_RENEWER, 0n)

    const expiryBefore = await readV1Expiry(label)
    const usdcBefore = await readUsdcBalance(owner)
    // Uncached: viem reuses a block number for a few seconds, which can
    // predate the setup approval above and count it as the app's.
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    // An unmigrated V1 name is renewed from the names list (the name page
    // offers its upgrade instead); one selection opens the single-name flow.
    const dialog = await extendFromNamesList(
      page,
      owner,
      { v2: [], v1: [name] },
      `web1485-v1-${run}`,
    )
    await confirmExtendWith(page, dialog, 'USDC')
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${V1_RENEWER}`,
      `renewal-renew-${name}`,
    ])

    await expect
      .poll(() => readV1Expiry(label), { timeout: 30_000 })
      .toBeGreaterThan(expiryBefore)
    const duration = (await readV1Expiry(label)) - expiryBefore
    const price = await renewerPrice(V1_RENEWER, label, duration, MOCK_USDC)
    expect(price).toBeGreaterThan(0n)

    // ── The bug: ETHRenewerV1 was approved 2× and half of it stayed ──
    const approvals = await minedApprovals(owner, fromBlock)
    expect(approvals, 'exactly one USDC approval was mined').toHaveLength(1)
    expect(sameAddress(approvals[0].spender, V1_RENEWER)).toBe(true)
    expect(
      approvals[0].amount,
      'the approval is exactly the V1 renewal price',
    ).toBe(price)
    expect(
      await readTokenAllowance(MOCK_USDC, owner, V1_RENEWER),
      'the renewal consumes the whole approval',
    ).toBe(0n)
    expect(usdcBefore - (await readUsdcBalance(owner))).toBe(price)
  })

  test('renewing a V1 and a V2 name together approves each renewer exactly its own total', async ({
    portalPage: page,
    wallet,
    accounts,
    makeName,
  }) => {
    test.setTimeout(360_000)
    await connectWithHeadlessWallet(page, wallet)
    const owner = accounts.getAddress('user')
    const run = Date.now().toString(36)
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const v1Name = await makeV1Name({
      label: `web1485-mix-${run}-a`,
      type: 'unwrapped',
    })
    const v2Name = await makeName({
      label: `web1485-mix-${run}-b`,
      owner: 'user',
    })
    await waitForIndexedName(v2Name)
    const v1Label = v1Name.replace(/\.eth$/, '')
    const v2Label = v2Name.replace(/\.eth$/, '')
    await setTokenAllowance(owner, MOCK_USDC, V1_RENEWER, 0n)
    await setTokenAllowance(owner, MOCK_USDC, V2_RENEWER, 0n)

    const v1Before = await readV1Expiry(v1Label)
    const v2Before = await getExpiry(publicClient as never, { name: v2Name })
    const usdcBefore = await readUsdcBalance(owner)
    // Uncached: viem reuses a block number for a few seconds, which can
    // predate the setup approval above and count it as the app's.
    const fromBlock = await publicClient.getBlockNumber({ cacheTime: 0 })

    const dialog = await extendFromNamesList(
      page,
      owner,
      { v2: [v2Name], v1: [v1Name] },
      `web1485-mix-${run}`,
    )
    await expect(dialog.getByText('Extend names')).toBeVisible()
    await confirmExtendWith(page, dialog, 'USDC')
    await driveTransactionsToSuccess(page, wallet, [
      `renewal-approve-${V2_RENEWER}`,
      `renewal-approve-${V1_RENEWER}`,
      `renewal-renew-${v2Name}`,
      `renewal-renew-${v1Name}`,
    ])

    await expect
      .poll(() => readV1Expiry(v1Label), { timeout: 30_000 })
      .toBeGreaterThan(v1Before)
    await expect
      .poll(() => getExpiry(publicClient as never, { name: v2Name }), {
        timeout: 30_000,
      })
      .toBeGreaterThan(v2Before)
    const v1Price = await renewerPrice(
      V1_RENEWER,
      v1Label,
      (await readV1Expiry(v1Label)) - v1Before,
      MOCK_USDC,
    )
    const v2Price = await renewerPrice(
      V2_RENEWER,
      v2Label,
      (await getExpiry(publicClient as never, { name: v2Name })) - v2Before,
      MOCK_USDC,
    )

    // ── The bug: each renewer was approved 2× its total ──
    const approvals = await minedApprovals(owner, fromBlock)
    expect(approvals, 'one approval per renewer').toHaveLength(2)
    const approvalTo = (spender: Address) =>
      approvals.find((approval) => sameAddress(approval.spender, spender))
        ?.amount
    expect(approvalTo(V2_RENEWER), 'the v2 approval is exactly its total').toBe(
      v2Price,
    )
    expect(approvalTo(V1_RENEWER), 'the v1 approval is exactly its total').toBe(
      v1Price,
    )
    expect(await readTokenAllowance(MOCK_USDC, owner, V2_RENEWER)).toBe(0n)
    expect(await readTokenAllowance(MOCK_USDC, owner, V1_RENEWER)).toBe(0n)
    // Positive control: charged exactly the two prices.
    expect(usdcBefore - (await readUsdcBalance(owner))).toBe(v1Price + v2Price)
  })
})
