import { useConnection } from 'wagmi'
import { useMigrationNftEnabled } from '@/lib/posthog/useMigrationNftEnabled'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolveVerifiedOwner } from '@/lib/smart-account/sessionGate'
import { CommemorativeNftClaimDialog } from './success/CommemorativeNftClaimDialog'

export const MigrationNftMintDialog = ({
  onClose,
  onViewProfile,
}: {
  readonly onClose: () => void
  readonly onViewProfile: (profileName: string | undefined) => void
}) => {
  const featureEnabled = useMigrationNftEnabled()
  const { ownerAddress } = useSmartAccountContext()
  const { address: walletAddress } = useConnection()
  const verifiedOwner =
    resolveVerifiedOwner(ownerAddress ?? null, walletAddress ?? null) ??
    undefined

  if (!featureEnabled) return null

  return (
    <CommemorativeNftClaimDialog
      context="mint-later"
      onClose={onClose}
      onViewProfile={onViewProfile}
      open
      ownerAddress={verifiedOwner}
    />
  )
}
