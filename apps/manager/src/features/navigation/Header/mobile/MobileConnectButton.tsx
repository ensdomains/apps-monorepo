import { Trans } from '@lingui/react/macro'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ens-consumer/button/Button'
import { useLoginModal } from '@/lib/wallet'

export const MobileConnectButton = () => {
  const { openLogin } = useLoginModal()
  const { isConnecting, isReconnecting } = useConnection()

  return (
    <Button
      color="blue"
      loading={isConnecting || isReconnecting}
      onClick={() => openLogin()}
      size="temp-xs"
    >
      <Trans>Connect</Trans>
    </Button>
  )
}
