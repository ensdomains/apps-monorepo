import { isWalletDeclineError } from '@ens-apps/transaction-manager/helpers/wallet-errors.helpers'
import { logger } from '@ens-apps/utils/logger'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useLingui } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import {
  type LeftoverFunds,
  readLeftoverFunds,
  withdrawLeftoverFunds,
} from '@/features/wallet/service/leftoverFunds'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { WalletChainError } from '@/lib/wallet/ensureWalletChain'
import { isFeatureEnabled } from '@/utils/feature-flags'

/** `declined` is the owner refusing in the wallet; `failed` is everything else. */
export type WithdrawLeftoverFundsOutcome =
  | { readonly status: 'withdrawn' }
  | { readonly status: 'declined' }
  | { readonly status: 'failed' }

export type UseLeftoverFundsResult = {
  /** Undefined until the first read lands, and in EOA-only mode. */
  readonly leftover: LeftoverFunds | undefined
  readonly isLoading: boolean
  readonly isError: boolean
  readonly isWithdrawing: boolean
  /** Last withdrawal error, already localized for display. */
  readonly withdrawError: string | null
  readonly withdraw: () => Promise<WithdrawLeftoverFundsOutcome>
}

/** What the smart account holds after its payments, and a way to get it back. */
export const useLeftoverFunds = (): UseLeftoverFundsResult => {
  const { t } = useLingui()
  const { accountAddress, client, refreshAccount } = useSmartAccountContext()
  const { address: owner } = useAccount()
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  // In EOA-only mode `accountAddress` is the wallet itself.
  const hca = isFeatureEnabled('USE_EOA') ? null : accountAddress

  const query = useQuery({
    queryKey: $qk({ $scope: 'wallet', $action: 'leftoverFunds', hca }),
    queryFn: () => (hca ? readLeftoverFunds(publicClient, hca) : null),
    enabled: !!hca,
  })

  const withdraw =
    useCallback(async (): Promise<WithdrawLeftoverFundsOutcome> => {
      if (!hca || !owner) {
        setWithdrawError(t`Connect your wallet to withdraw.`)
        return { status: 'failed' }
      }
      setIsWithdrawing(true)
      setWithdrawError(null)
      try {
        const { deployed } = await withdrawLeftoverFunds({
          hca,
          owner,
          hcaClient: client,
          publicClient,
          wagmiConfig,
        })
        // The account machine still believes the HCA is counterfactual.
        if (deployed) await refreshAccount()
        return { status: 'withdrawn' }
      } catch (error) {
        if (isWalletDeclineError(error)) return { status: 'declined' }
        logger.error('Leftover funds withdrawal failed', error)
        setWithdrawError(
          error instanceof WalletChainError
            ? error.message
            : t`Couldn't withdraw your leftover funds. Please try again.`,
        )
        return { status: 'failed' }
      } finally {
        setIsWithdrawing(false)
        // Both sides moved: the account's balance and the wallet's.
        void queryClient.invalidateQueries({
          queryKey: $qk({ $scope: 'wallet' }),
        })
      }
    }, [hca, owner, client, refreshAccount, wagmiConfig, queryClient, t])

  return {
    leftover: query.data ?? undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    isWithdrawing,
    withdrawError,
    withdraw,
  }
}
