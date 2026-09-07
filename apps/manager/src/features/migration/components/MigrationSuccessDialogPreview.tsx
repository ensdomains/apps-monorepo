import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Address } from 'viem'
import { useChainId, useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolveVerifiedOwner } from '@/lib/smart-account/sessionGate'
import { commemorativeNftEligibilityQueryOptions } from '../commemorative-nft/queries'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'
import { getPublishedPreviewState } from './MigrationSuccessDialogPreview.helpers'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

const noop = () => undefined

const PreviewDialog = ({
  onClose,
  onRetry,
  state,
}: {
  readonly onClose: () => void
  readonly onRetry: () => void
  readonly state: MigrationSuccessDialogState
}) => (
  <MigrationSuccessDialog
    canMint={false}
    context="mint-later"
    migratedNameCount={0}
    onClose={onClose}
    onMint={noop}
    onRetry={onRetry}
    onViewProfile={onClose}
    open
    state={state}
  />
)

const PublishedNftPreview = ({
  ownerAddress,
  chainId,
  onClose,
}: {
  readonly ownerAddress: Address
  readonly chainId: number
  readonly onClose: () => void
}) => {
  const [migratedAt] = useState(() => new Date())
  const query = useQuery({
    ...commemorativeNftEligibilityQueryOptions({ ownerAddress }),
    refetchOnMount: 'always',
  })

  return (
    <PreviewDialog
      onClose={onClose}
      onRetry={() => void query.refetch()}
      state={getPublishedPreviewState({
        ownerAddress,
        chainId,
        migratedAt,
        query,
      })}
    />
  )
}

// Mounted only by the temporary development button; no transaction can be sent.
export const MigrationSuccessDialogPreview = ({
  onClose,
}: {
  readonly onClose: () => void
}) => {
  const { ownerAddress } = useSmartAccountContext()
  const { address: walletAddress } = useConnection()
  const chainId = useChainId()
  const [migratedAt] = useState(() => new Date())
  const verifiedOwner =
    resolveVerifiedOwner(ownerAddress ?? null, walletAddress ?? null) ??
    undefined

  if (!verifiedOwner) {
    return (
      <PreviewDialog
        onClose={onClose}
        onRetry={noop}
        state={getPublishedPreviewState({ chainId, migratedAt })}
      />
    )
  }

  return (
    <PublishedNftPreview
      chainId={chainId}
      key={`${chainId}:${verifiedOwner.toLowerCase()}`}
      onClose={onClose}
      ownerAddress={verifiedOwner}
    />
  )
}
