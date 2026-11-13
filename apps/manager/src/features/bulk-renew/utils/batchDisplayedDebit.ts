import type { HcaDisplayedDebit } from '@ens-apps/transaction-manager'

/** What a batch may take from the wallet: the debit the sheet showed, less what earlier batches already moved. */
export const getBatchDisplayedDebit = (
  shown: HcaDisplayedDebit,
  movedUsdc: bigint,
): HcaDisplayedDebit => ({
  usdc: shown.usdc > movedUsdc ? shown.usdc - movedUsdc : 0n,
  token: shown.token,
})
