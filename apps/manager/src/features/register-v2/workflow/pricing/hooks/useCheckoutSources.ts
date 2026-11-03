import { useQuery } from '@tanstack/react-query'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import { TOKENS } from '@/lib/tokens'
import { getHcaUsdcBalanceQueryOptions } from '../../../data/queries/hcaUsdcBalance.query'
import {
  getL2BalancesQueryOptions,
  type L2Wallet,
} from '../../../data/queries/l2Balances.query'
import { getWalletEthValueQueryOptions } from '../../../data/queries/walletEthValue.query'
import {
  type BalanceRead,
  knownBalance,
  type PaymentSources,
  UNKNOWN_BALANCE,
} from '../lib/checkoutAvailability'

type CheckoutSourcesAccount = Pick<
  SmartAccountContextValue,
  | 'accountAddress'
  | 'ownerAddress'
  | 'signer'
  | 'stablecoinBalances'
  | 'isLoadingBalances'
>

const readOf = (usdcRaw: bigint | undefined): BalanceRead =>
  usdcRaw === undefined ? UNKNOWN_BALANCE : knownBalance(usdcRaw)

const walletUsdcRead = (account: CheckoutSourcesAccount): BalanceRead => {
  // A token whose read failed is left out of the list, so a missing USDC is unknown.
  const usdc = account.stablecoinBalances.find(
    ({ symbol }) => symbol === TOKENS.USDC.symbol,
  )
  return readOf(
    account.isLoadingBalances || !usdc ? undefined : BigInt(usdc.balance),
  )
}

const l2Reads = (
  wallets: Readonly<Record<number, L2Wallet | null>> | undefined,
): readonly BalanceRead[] => {
  if (!wallets) return [UNKNOWN_BALANCE]
  return Object.values(wallets).map((wallet) => readOf(wallet?.usdc))
}

/** The account's existing balance and every source the page checks, as balance reads. */
export const useCheckoutSources = (account: CheckoutSourcesAccount) => {
  const hca =
    account.signer?.type === 'rhinestone'
      ? (account.accountAddress ?? undefined)
      : undefined
  const owner = account.ownerAddress ?? undefined
  const isHcaRoute = !!hca

  const hcaBalance = useQuery(getHcaUsdcBalanceQueryOptions(hca))
  const l2Balances = useQuery({
    ...getL2BalancesQueryOptions(owner),
    enabled: isHcaRoute && !!owner,
  })
  const ethValue = useQuery(
    getWalletEthValueQueryOptions({ owner, isEnabled: isHcaRoute }),
  )

  if (!isHcaRoute) {
    return {
      accountBalance: knownBalance(0n),
      sources: { wallet: walletUsdcRead(account), l2s: [] },
    }
  }
  const sources: PaymentSources = {
    wallet: walletUsdcRead(account),
    l2s: l2Reads(l2Balances.isSuccess ? l2Balances.data : undefined),
    eth: readOf(ethValue.isSuccess ? ethValue.data.usdcRaw : undefined),
  }
  return {
    accountBalance: readOf(hcaBalance.isSuccess ? hcaBalance.data : undefined),
    sources,
  }
}
