/**
 * Paying for a registration with USDC on an L2 (Base, Arbitrum or OP Sepolia).
 *
 * The wallet signs, on the L2, an EIP-2612 permit for Permit2 and a Permit2
 * witness transfer to Rhinestone's Across arbiter; Across then delivers the
 * USDC into the smart account (HCA) on Sepolia, and the commit and reveal run
 * from there as on any HCA registration. Locally the mockestrator plays
 * Across: it pulls the deposit through the real Permit2 on the L2 fork,
 * which checks the wallet's signature, and credits the HCA on Sepolia.
 *
 * Opt-in per L2 (see l2SkipReason): the L2 forks are only in the `l2` compose
 * profile, so an outage of a public L2 upstream cannot fail the suite.
 */

import { expect } from '@playwright/test'
import { type Address, isAddressEqual } from 'viem'
import {
  authorizeTransactionsWhile,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { expectFlowSuccess } from '../../../helpers/flow-completion.js'
import { fundTestUsdc, readTestUsdc } from '../../../helpers/fund-test-usdc.js'
import {
  alignL2ClockWithPage,
  clearL2Code,
  isL2ForkEnabled,
  L2_FORKS,
  l2SkipReason,
  l2UsdcBalance,
  setL2UsdcBalance,
} from '../../../helpers/l2-fork.js'
import { clickThroughEnableSessions } from '../../../helpers/manager-auth.js'
import { assertV2Registered } from '../../../helpers/migration-assertions.js'
import { clickRegistrationPaymentAction } from '../../../helpers/payment-picker.js'
import { findSearchInput } from '../../../helpers/search-input.js'
import { ethRegistryState, hcaOf } from '../../../helpers/v2-reads.js'

const L2_FUNDS = 100_000_000n // 100 USDC

test.describe('Registration paid from an L2', () => {
  test.describe.configure({ timeout: 420_000 })

  for (const fork of L2_FORKS) {
    test(`registers a name with USDC bridged in from ${fork.chain.name}`, async ({
      connectedPage: page,
      mockBigname,
      accounts,
      wallet,
    }) => {
      const owner = accounts.getAddress('user') as Address
      const label = `l2-e2e-${Date.now().toString(36)}`
      const name = `${label}.eth`

      test.skip(!isL2ForkEnabled(fork), l2SkipReason(fork))

      await alignL2ClockWithPage(fork, page)
      await clearL2Code(fork, owner)
      await setL2UsdcBalance(fork, owner, L2_FUNDS)

      // The picker only offers payment methods when the smart account can't
      // already cover the price; on the shared fork it is usually topped up.
      const hca = await hcaOf(owner)
      // Parked by rewriting its balance, not by a transfer: sending from the
      // HCA before it is deployed bumps its nonce, after which the factory's
      // CREATE2 collides and the account can never be deployed (EIP-7610).
      const parked = await readTestUsdc(hca)
      await fundTestUsdc(hca, 0n)
      try {
        const searchInput = await findSearchInput(page)
        await searchInput.click()
        await searchInput.fill(label)
        await page
          .getByText('Available')
          .first()
          .waitFor({ state: 'visible', timeout: 15_000 })
        await page.getByText(name).click()

        await page.getByRole('button', { name: 'Continue to payment' }).click()
        await clickThroughEnableSessions(page)

        const l2Row = page.getByRole('button', {
          name: `Select USDC on ${fork.chain.name}`,
          exact: true,
        })
        await expect(l2Row, 'the L2 row reads the fork balance').toBeVisible({
          timeout: 60_000,
        })
        await l2Row.click()

        const sepoliaUsdcBefore = await readTestUsdc(owner)
        await clickRegistrationPaymentAction(page)
        await page.getByRole('button', { name: 'Set up later' }).click()

        // Paying from the L2 sends no wallet transaction; only the optional
        // primary-name setup afterwards does.
        let isRegistrationComplete = false
        const authorizeSetupTxs = authorizeTransactionsWhile(
          page,
          wallet,
          () => isRegistrationComplete,
        )
        await expectFlowSuccess(page, {
          success: page
            .getByRole('status')
            .filter({ hasText: 'Registration Complete' }),
          failureTitle: 'Registration Failed',
          timeout: 300_000,
        })
        isRegistrationComplete = true
        await authorizeSetupTxs

        await assertV2Registered(label)
        const { latestOwner } = await ethRegistryState(label)
        expect(
          isAddressEqual(latestOwner, owner),
          `the name is owned by the paying wallet, not ${latestOwner}`,
        ).toBe(true)
        const l2Debit = L2_FUNDS - (await l2UsdcBalance(fork, owner))
        expect(l2Debit, 'the L2 wallet paid').toBeGreaterThan(0n)
        expect(
          await readTestUsdc(owner),
          'the Sepolia wallet did not pay',
        ).toBe(sepoliaUsdcBefore)

        if (mockBigname.enabled) {
          mockBigname.addName({ name, owner })
        }
      } finally {
        await fundTestUsdc(hca, (await readTestUsdc(hca)) + parked)
      }
    })
  }
})
