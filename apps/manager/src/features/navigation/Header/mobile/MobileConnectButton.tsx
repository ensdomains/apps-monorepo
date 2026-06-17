import { Trans } from '@lingui/react/macro'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ens-consumer/button/Button'

export const MobileConnectButton = () => {
  const { openConnectModal } = useConnectModal()
  const { isConnecting, isReconnecting } = useConnection()

  return (
    <Button
      color="blue"
      loading={isConnecting || isReconnecting}
      onClick={() => openConnectModal?.()}
      size="temp-xs"
    >
      <Trans>Connect</Trans>
    </Button>
  )
}
