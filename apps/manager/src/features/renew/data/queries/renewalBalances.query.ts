import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, erc20Abi, formatUnits } from 'viem'
import { readContract } from 'viem/actions'
import type { StablecoinBalance } from '@/lib/smart-account'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import {
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
}

const NO_BALANCES: RenewalBalances = { wallet: [], accountCredit: {} }

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
  const [wallet, account] = await Promise.all([
    readBalances(owner),
    hca ? readBalances(hca) : Promise.resolve([]),
  ])

  return {
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
  }
}

/**
 * Balances of every renewal token: the wallet's, which the pickers list, and on
 * the smart-account route the account's own, which pays first.
 */
export const useRenewalBalances = () => {
  const account = useSmartAccountContext()
  const owner = account.ownerAddress
  // Only the intent route spends from the account; an EOA pays for itself.
  const hca =
    account.signer?.type === 'rhinestone' ? account.accountAddress : null

  const query = useQuery({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'renewalBalances',
      owner,
      hca,
    }),
    queryFn: () => (owner ? readRenewalBalances(owner, hca) : NO_BALANCES),
    enabled: !!owner,
    refetchInterval: 30_000,
  })

  return { ...(query.data ?? NO_BALANCES), isLoading: query.isLoading }
}
