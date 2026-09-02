import type { Signer } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { Address, PublicClient, WalletClient } from 'viem'
import {
  useConfig,
  useConnection,
  usePublicClient,
  useWalletClient,
} from 'wagmi'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import {
  STANDING_MIGRATION_CLEANUP_QUERY_KEY,
  useStandingMigrationCleanup,
} from '@/features/migration/hooks/useStandingMigrationCleanup'
import { deriveMigrationCleanupHcaAddress } from '@/features/migration/service/deriveMigrationCleanupHcaAddress'
import { revokeStandingTemporaryHcaAccess } from '@/features/migration/service/migrationService'
import { hasOwnerWallet } from '@/lib/wallet/hasOwnerWallet'

/**
 * Detects a standing temporary migration grant (the registry-wide
 * `setApprovalForAll` to the HCA) and offers a one-click revocation.
 *
 * Deliberately independent of the migration UI machine, any migration plan,
 * and v1 name selection: the grant can outlive all three. An interrupted
 * session can leave it standing after the wallet's final v1 name migrated,
 * when no migration run can ever be started again — this banner is the only
 * remaining route to the revocation. Renders nothing when no grant stands.
 */
export const RevokeTemporaryAccessBanner = ({
  className,
}: {
  readonly className?: string
}) => {
  const { address: ownerAddress, isConnected } = useConnection()
  const wagmiConfig = useConfig()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle')
  const hcaAddress = useMemo(
    () =>
      deriveMigrationCleanupHcaAddress({
        chainId: publicClient?.chain?.id,
        ownerAddress: ownerAddress as Address | undefined,
      }),
    [ownerAddress, publicClient?.chain?.id],
  )

  const cleanupQuery = useStandingMigrationCleanup({
    ownerAddress: ownerAddress as Address | undefined,
    hcaAddress: hcaAddress as Address | undefined,
    enabled: isConnected,
  })
  const standingApprovals = cleanupQuery.data?.approvals ?? []
  const isRevocationPending = Boolean(cleanupQuery.data?.pendingRevocationHash)
  const hasPendingPrompt = Boolean(cleanupQuery.data?.hasPendingPrompt)

  const handleRevoke = useCallback(async () => {
    if (
      !ownerAddress ||
      !hcaAddress ||
      !publicClient ||
      !hasOwnerWallet(walletClient, ownerAddress as Address)
    )
      return
    setStatus('pending')
    const signer: Signer = {
      type: 'eoa',
      walletClient: walletClient as WalletClient,
    }
    try {
      await revokeStandingTemporaryHcaAccess({
        wagmiConfig,
        publicClient: publicClient as unknown as PublicClient,
        signer,
        walletAddress: ownerAddress as Address,
        hcaAddress: hcaAddress as Address,
      })
      setStatus('idle')
    } catch {
      setStatus('error')
    } finally {
      await queryClient.invalidateQueries({
        queryKey: [STANDING_MIGRATION_CLEANUP_QUERY_KEY],
      })
    }
  }, [
    ownerAddress,
    hcaAddress,
    publicClient,
    walletClient,
    wagmiConfig,
    queryClient,
  ])

  if (!isConnected || standingApprovals.length === 0) return null

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-b from-ens-garnet-100 to-ens-garnet-200 px-4 py-6 md:rounded-lg md:px-6 md:py-8 ${className ?? ''}`}
    >
      <GrainOverlay />
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-2xl text-ens-garnet-900 leading-ens-tight tracking-tight">
            <Trans>Finish securing your account</Trans>
          </h2>
          <p className="text-base text-ens-garnet-500 leading-ens-normal tracking-normal">
            {hasPendingPrompt ? (
              <Trans>
                An earlier approval request may still be open in your wallet.
                Reject or close it before revoking. After a page reload, this
                warning may remain as a precaution.
              </Trans>
            ) : isRevocationPending ? (
              <Trans>
                Your revocation is pending. If it is taking too long, you can
                safely retry.
              </Trans>
            ) : (
              <Trans>
                An earlier upgrade may have left temporary access to your names.
                Revoking it takes one wallet confirmation.
              </Trans>
            )}
          </p>
          {status === 'error' ? (
            <p className="text-ens-garnet-900 text-sm leading-ens-normal">
              <Trans>Revocation didn&apos;t complete. Please try again.</Trans>
            </p>
          ) : null}
        </div>
        <button
          className="w-full shrink-0 rounded-sm bg-ens-garnet-900 px-4 py-3.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-wide shadow-inner disabled:opacity-60 md:w-84.5"
          disabled={
            status === 'pending' ||
            !hasOwnerWallet(walletClient, ownerAddress as Address | undefined)
          }
          onClick={handleRevoke}
          type="button"
        >
          {status === 'pending' ? (
            <Trans>Revoking temporary access…</Trans>
          ) : hasPendingPrompt ? (
            <Trans>Revoke current access</Trans>
          ) : isRevocationPending ? (
            <Trans>Retry revocation</Trans>
          ) : (
            <Trans>Revoke temporary HCA access</Trans>
          )}
        </button>
      </div>
    </div>
  )
}
