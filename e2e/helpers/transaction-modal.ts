/**
 * Driver for the portal's shared `TransactionModal` — plan item H8.
 *
 * Every portal write flow (transfer, change-resolver, save-records, grant and
 * revoke roles) funnels through the same modal, so the stepping logic belongs
 * here rather than in whichever spec needed it first. Extracted verbatim from
 * `transfer.spec.ts`, which remains a caller.
 *
 * The oracle is the transaction id, not the UI: `transactionManager.ts` logs
 * `Transaction <id> state: success` per step, so a caller asserts the exact
 * step sequence a flow should run rather than "some transaction happened".
 * {@link PORTAL_TRANSACTION_IDS} is the catalogue of ids the portal emits.
 */

import { Web3RequestKind, type Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import { expect, type Page } from '@playwright/test'

/**
 * Transaction ids the portal's flows emit, as declared by the app itself.
 * Keep in sync with the `*_TX_ID` constants under
 * `apps/portal/src/features/**` — a test that asserts an id no longer emitted
 * is a test that silently stops checking anything.
 */
export const PORTAL_TRANSACTION_IDS = {
  /** `features/roles/utils/buildRoleTransactionDescriptors.ts` */
  grantRoles: 'tx-grant-roles',
  /** Also used for the "Remove user" flow. */
  revokeRoles: 'tx-revoke-roles',
} as const

/**
 * Per-name transfer step ids, e.g. `transfer-alice.eth-detach-resolver`.
 *
 * All four steps `buildTransferPlan` can emit. `set-eth-addr` was missing
 * until a subname test needed it — it is only planned when the resolver is
 * being *kept* (`setEthAddress && !detachResolver`), which no earlier test
 * exercised, so its absence went unnoticed rather than being deliberate.
 */
export const transferTxId = (
  name: string,
  step:
    | 'set-eth-addr'
    | 'detach-resolver'
    | 'detach-registry'
    /** V2 move. */
    | 'transfer-token'
    /**
     * V2 move via `unsafeTransfer`: other role holders stay (#1251), or the
     * registry isn't emancipated, which is every user-deployed subregistry
     * whose deployer kept its root roles (#1391).
     */
    | 'transfer-token-unsafe'
    /** V1 unwrapped 2LD: the controller slot, then the registrant. */
    | 'reclaim'
    | 'transfer-erc721'
    /** V1 wrapped. */
    | 'transfer-erc1155'
    /** V1 registry-only. */
    | 'set-registry-owner'
    /** V1 subname moved by its PARENT (#1144): `setSubnodeOwner`. */
    | 'set-subnode-owner'
    /** Recovery after `set-eth-addr` landed but the move didn't (#1217). */
    | 'restore-eth-addr',
) => `transfer-${name}-${step}`

/**
 * Drives the shared `TransactionModal` (`[data-slot="dialog-content"]`) through
 * however many steps a flow needs, authorizing each wallet prompt as it appears,
 * until every transaction id in `successTxIds` has logged a `state: success`
 * console line (the format emitted by `transactionManager.ts`). Reused across
 * the transfer, change-resolver (2-step: deploy + set), and save-records flows.
 */
export async function driveTransactionsToSuccess(
  page: Page,
  wallet: Web3ProviderBackend,
  successTxIds: string[],
  timeoutMs = 180_000,
): Promise<void> {
  const transactionDialog = page.locator('[data-slot="dialog-content"]')
  await expect(transactionDialog).toBeVisible({ timeout: 30_000 })

  const succeeded = new Set<string>()
  // Multi-step flows append an attempt scope to each step's id (see
  // `scopeTransactionId`), so the logged id is the id named here plus an
  // optional `--<account>-<nonce>` suffix. Anchored on that exact shape so a
  // step id that merely prefixes another still cannot mark it succeeded.
  const succeededLine = (id: string) =>
    new RegExp(
      `Transaction ${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--\\S+)? state: success`,
    )
  const onConsole = (msg: { text(): string }) => {
    const text = msg.text()
    for (const id of successTxIds) {
      if (succeededLine(id).test(text)) succeeded.add(id)
    }
  }
  page.on('console', onConsole)

  try {
    const deadline = Date.now() + timeoutMs
    // Loop on wall-clock time alone, not on `succeeded.size` — the final
    // step's "Done" button only renders *after* its success console line
    // lands, and only clicking it fires `finishFlow` (see
    // useAutoAdvanceTransaction.ts: auto-advance deliberately skips the last
    // transaction, so nothing else triggers the redirect). Exiting the
    // moment the count matches races ahead of that button ever appearing.
    while (Date.now() < deadline) {
      if (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0) {
        if (process.env.MATRIX_LOCAL_RPC_ONLY === '1') {
          // The headless provider can leave authorization unresolved after its
          // internal RPC sender logs a timeout. Keep that test-wallet failure
          // bounded by this flow's deadline; it is not an app authorization result.
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              wallet.authorize(Web3RequestKind.SendTransaction),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Local matrix wallet request did not settle before the transaction deadline; fresh fixture required.')), Math.max(1, deadline - Date.now()))
              }),
            ])
          } finally { if (timer) clearTimeout(timer) }
        } else await wallet.authorize(Web3RequestKind.SendTransaction)
        continue
      }
      const openWalletButton = transactionDialog.getByRole('button', {
        name: /open wallet/i,
      })
      if (await openWalletButton.isVisible().catch(() => false)) {
        await openWalletButton.click()
        await page.waitForTimeout(500)
        continue
      }

      // Waiting means a request is pending or a receipt is being confirmed.
      // Its preceding icon is Back, not an Open wallet control. Authorize only
      // a real queued request above; never create a second artificial wait.

      const primaryButton = transactionDialog.getByRole('button', {
        name: /^(Start|Next|Done)$/i,
      })
      if (
        (await primaryButton.isVisible().catch(() => false)) &&
        (await primaryButton.isEnabled().catch(() => false))
      ) {
        await primaryButton.click()
        await page.waitForTimeout(500)
        continue
      }

      // Every tracked tx has succeeded and there's nothing left to click
      // (the last "Done" press already fired `finishFlow` and closed the
      // modal) — safe to stop polling.
      if (succeeded.size === successTxIds.length && !(await transactionDialog.isVisible().catch(() => false))) break

      await page.waitForTimeout(1_000)
    }
  } finally {
    page.off('console', onConsole)
  }

  expect(succeeded.size).toBe(successTxIds.length)
  await expect(transactionDialog, 'The completed flow must close after Done, even when transaction IDs are discovered dynamically').not.toBeVisible({ timeout: 5000 })
}
