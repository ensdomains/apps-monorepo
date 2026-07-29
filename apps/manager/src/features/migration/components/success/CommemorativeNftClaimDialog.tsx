import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { useCommemorativeNftFlow } from '../../commemorative-nft/useCommemorativeNftFlow'
import { MigrationSuccessDialog } from '../MigrationSuccessDialog'

type CommemorativeNftClaimDialogProps = {
  readonly context: 'migration' | 'mint-later'
  readonly migratedNameCount?: number
  readonly onClose: (profileName: string | undefined) => void
  readonly onViewProfile: (profileName: string | undefined) => void
  readonly open: boolean
  readonly ownerAddress: Address | undefined
  readonly preview?: boolean
  readonly previewProfileName?: string
}

const OpenCommemorativeNftClaimDialog = ({
  context,
  migratedNameCount = 0,
  onClose,
  onViewProfile,
  ownerAddress,
  preview,
  previewProfileName,
}: CommemorativeNftClaimDialogProps) => {
  const { address: walletAddress } = useConnection()
  const flow = useCommemorativeNftFlow({
    open: true,
    ownerAddress,
    walletAddress,
    migratedNameCount,
    preview,
    previewProfileName,
  })

  return (
    <MigrationSuccessDialog
      canMint={flow.canMint}
      context={context}
      onClose={() => onClose(flow.eligibility?.profileName)}
      onMint={() => void flow.mint()}
      onRetry={() => void flow.retry()}
      onRevealComplete={flow.completeReveal}
      onViewProfile={() => onViewProfile(flow.eligibility?.profileName)}
      open
      state={flow.state}
    />
  )
}

export const CommemorativeNftClaimDialog = (
  props: CommemorativeNftClaimDialogProps,
) => {
  if (!props.open) return null
  return <OpenCommemorativeNftClaimDialog {...props} />
}
