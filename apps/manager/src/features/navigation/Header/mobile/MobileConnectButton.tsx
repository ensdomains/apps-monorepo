import { Trans } from '@lingui/react/macro'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ens-consumer/button/Button'

export const MobileConnectButton = () => {
  const { openConnectModal } = useConnectModal()
  const { status } = useAccount()

  return (
    <Button
      color="blue"
      loading={status === 'connecting' || status === 'reconnecting'}
      onClick={() => openConnectModal?.()}
      size="temp-xs"
    >
      <Trans>Connect</Trans>
    </Button>
  )
}
