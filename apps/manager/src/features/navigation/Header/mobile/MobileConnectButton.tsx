import { useModal, useWallet } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { Button } from '@/components/ens-consumer/button/Button'

export const MobileConnectButton = () => {
  const { openModal } = useModal()
  const wallet = useWallet()

  return (
    <Button
      color="blue"
      loading={wallet.isLoading}
      onClick={() => openModal()}
      size="temp-xs"
    >
      <Trans>Connect</Trans>
    </Button>
  )
}
