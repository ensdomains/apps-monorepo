import { isWalletDeclineError } from '@ens-apps/transaction-manager/helpers/wallet-errors.helpers'
import { logger } from '@ens-apps/utils/logger'
import { useLingui } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import {
  findPendingRegistrationFor,
  getLeftoverFundsQueryOptions,
  invalidateAfterWithdrawal,
  type LeftoverFundsStatus,
} from '@/features/wallet/data/queries/leftoverFunds.query'
import {
  FundsHeldForRegistrationError,
  withdrawLeftoverFunds,
} from '@/features/wallet/service/leftoverFunds'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient } from '@/lib/wagmi'
import { WalletChainError } from '@/lib/wallet/ensureWalletChain'
import { isFeatureEnabled } from '@/utils/feature-flags'

/**
 * `declined` is the owner refusing in the wallet; `held` means a pending
 * registration still needs the funds, so nothing was sent; `failed` is
 * everything else.
 */
export type WithdrawLeftoverFundsOutcome =
  | { readonly status: 'withdrawn' }
  | { readonly status: 'declined' }
  | { readonly status: 'held'; readonly registrationName: string }
  | { readonly status: 'failed' }

export type UseLeftoverFundsResult = {
  /** Undefined until the first read lands, and in EOA-only mode. */
  readonly leftover: LeftoverFundsStatus | undefined
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

  const query = useQuery(getLeftoverFundsQueryOptions({ hca }))

  const withdraw =
    useCallback(async (): Promise<WithdrawLeftoverFundsOutcome> => {
      if (!hca || !owner) {
        setWithdrawError(t`Connect your wallet to withdraw.`)
        return { status: 'failed' }
      }
      setIsWithdrawing(true)
      setWithdrawError(null)
      try {
        await withdrawLeftoverFunds({
          hca,
          owner,
          hcaClient: client,
          publicClient,
          wagmiConfig,
          refreshAccount,
          findPendingRegistration: () => findPendingRegistrationFor(hca),
        })
        return { status: 'withdrawn' }
      } catch (error) {
        if (isWalletDeclineError(error)) return { status: 'declined' }
        // The refetch below picks the registration up, and the dialog explains.
        if (error instanceof FundsHeldForRegistrationError) {
          return {
            status: 'held',
            registrationName: error.registrationName,
          }
        }
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
        void invalidateAfterWithdrawal(queryClient, hca)
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
