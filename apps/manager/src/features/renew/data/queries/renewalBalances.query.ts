import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { readContract } from 'viem/actions'
import { useRenewalSigner } from '@/features/renew/hooks/useRenewalSigner'
import type { StablecoinBalance } from '@/lib/smart-account'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import {
  CIRCLE_PAYMENT_TOKEN,
  RENEWAL_TOKEN_SYMBOLS as RENEWAL_SYMBOLS,
  type RENEWAL_TOKEN,
  TOKENS,
} from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

export type RenewalBalances = {
  /** The owner wallet's balance of each renewal token. */
  readonly wallet: readonly StablecoinBalance[]
  /** What the smart account already holds of each; empty off the HCA route. */
  readonly accountCredit: Partial<Record<RENEWAL_TOKEN, number>>
  /** The same balances in token units, for the debit the intent is checked against. */
  readonly accountCreditRaw: Partial<Record<RENEWAL_TOKEN, bigint>>
  /** What the account holds of the Circle USDC an ETH or L2 payment pays in; absent when unread. */
  readonly circleCreditRaw?: bigint
}

const NO_BALANCES: RenewalBalances = {
  wallet: [],
  accountCredit: {},
  accountCreditRaw: {},
}

/** The account's USDC credit replaced by what it holds of Circle's USDC; unread, none. */
const getCirclePaymentBalances = (
  balances: RenewalBalances,
): RenewalBalances => {
  const { USDC: _credit, ...accountCredit } = balances.accountCredit
  const { USDC: _creditRaw, ...accountCreditRaw } = balances.accountCreditRaw
  const raw = balances.circleCreditRaw
  return raw === undefined
    ? { ...balances, accountCredit, accountCreditRaw }
    : {
        ...balances,
        accountCredit: {
          ...accountCredit,
          USDC: decimalBigintToNumber(raw, TOKENS.USDC.decimals),
        },
        accountCreditRaw: { ...accountCreditRaw, USDC: raw },
      }
}

/** The balances a renewal counts: paid in Circle's USDC (ETH or a chosen L2), the account's USDC is what it holds of it. */
export const getPaymentBalances = (
  balances: RenewalBalances,
  isCirclePayment: boolean,
): RenewalBalances =>
  isCirclePayment ? getCirclePaymentBalances(balances) : balances

const readBalances = (holder: Address) =>
  Promise.allSettled(
    RENEWAL_SYMBOLS.map((symbol) =>
      readContract(publicClient, {
        address: TOKENS[symbol].address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [holder],
      }),
    ),
  )

const readRenewalBalances = async (
  owner: Address,
  hca: Address | null,
): Promise<RenewalBalances> => {
  const [wallet, account, ethPaymentCredit] = await Promise.all([
    readBalances(owner),
    hca ? readBalances(hca) : Promise.resolve([]),
    // Where ETH and L2s pay in Circle's USDC, the account's balance of it too.
    hca && CIRCLE_PAYMENT_TOKEN
      ? readContract(publicClient, {
          address: CIRCLE_PAYMENT_TOKEN,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [hca],
        }).catch(() => undefined)
      : undefined,
  ])
  const usdcIndex = RENEWAL_SYMBOLS.indexOf('USDC')
  const usdcCredit = account[usdcIndex]

  return {
    circleCreditRaw: CIRCLE_PAYMENT_TOKEN
      ? ethPaymentCredit
      : usdcCredit?.status === 'fulfilled'
        ? usdcCredit.value
        : undefined,
    wallet: RENEWAL_SYMBOLS.flatMap((symbol, index) => {
      const read = wallet[index]
      if (read?.status !== 'fulfilled') return []
      const { address, decimals } = TOKENS[symbol]
      return [
        {
          address,
          symbol,
          decimals,
          balance: read.value.toString(),
          formattedBalance: `${formatUnits(read.value, decimals)} ${symbol}`,
        },
      ]
    }),
    // An unreadable account balance earns no credit: the stricter gate.
    accountCredit: Object.fromEntries(
      RENEWAL_SYMBOLS.flatMap((symbol, index) => {
        const read = account[index]
        return read?.status === 'fulfilled'
          ? [
              [
                symbol,
                decimalBigintToNumber(read.value, TOKENS[symbol].decimals),
              ],
            ]
          : []
      }),
    ),
    accountCreditRaw: Object.fromEntries(
      RENEWAL_SYMBOLS.flatMap((symbol, index) => {
        const read = account[index]
        return read?.status === 'fulfilled' ? [[symbol, read.value]] : []
      }),
    ),
  }
}

/**
 * Balances of every renewal token: the wallet's, which the pickers list, and on
 * the smart-account route the account's own, which pays first.
 */
export const useRenewalBalances = ({ enabled = true } = {}) => {
  const account = useSmartAccountContext()
  const signer = useRenewalSigner()
  const owner = account.ownerAddress
  // Only the intent route spends from the account; an EOA pays for itself.
  const hca = signer?.type === 'rhinestone' ? account.accountAddress : null

  const query = useQuery({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'renewalBalances',
      owner,
      hca,
    }),
    queryFn: () => (owner ? readRenewalBalances(owner, hca) : NO_BALANCES),
    enabled: enabled && !!owner,
    refetchInterval: 30_000,
  })

  return {
    ...(query.data ?? NO_BALANCES),
    isLoading: query.isLoading,
    refetch: () => {
      query.refetch()
    },
  }
}
