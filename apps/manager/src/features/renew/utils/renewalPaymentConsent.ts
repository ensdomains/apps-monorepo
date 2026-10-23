import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { divCeil } from '@ens-apps/transaction-manager/helpers/math'
import { type RENEWAL_TOKEN, TOKENS } from '@/lib/tokens'

const USDC_UNITS_PER_CENT = 10n ** BigInt(TOKENS.USDC.decimals - 2)

/** The displayed USDC ceiling, derived without passing token amounts through floats. */
export const getDisplayedRenewalWalletDebit = ({
  rent,
  fee,
  balance,
}: {
  readonly rent: bigint
  readonly fee: bigint
  readonly balance: bigint
}): bigint => {
  const debit = rent + fee > balance ? rent + fee - balance : 0n
  return divCeil(debit, USDC_UNITS_PER_CENT) * USDC_UNITS_PER_CENT
}

/** Never reuse a USDC confirmation for another token, including an unlimited DAI permit. */
export const isRenewalFundingWithinConsent = (
  prompt: HcaFundingPrompt,
  displayedWalletDebitUsdc: bigint | undefined,
  token: RENEWAL_TOKEN,
): boolean =>
  token === 'USDC' &&
  !prompt.token &&
  displayedWalletDebitUsdc !== undefined &&
  prompt.permitValue <= displayedWalletDebitUsdc
