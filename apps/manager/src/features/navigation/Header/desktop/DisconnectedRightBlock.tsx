import { useModal, useWallet } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { Button } from '@/components/ens-consumer/button/Button'
import { MSymbol } from '@/components/ui/material-symbol'
import { FloatingWrapper } from '../shared/FloatingWrapper'

export const DisconnectedRightBlock = () => {
  const { openModal } = useModal()
  const wallet = useWallet()

  return (
    <FloatingWrapper>
      <Button
        color="blue"
        loading={wallet.isLoading}
        onClick={() => openModal()}
        size="temp-xs"
      >
        <Trans>Connect</Trans>
        <MSymbol
          className="ms-opsz-20 ms-wght-400"
          data-icon="inline-end"
          symbol="login"
        />
      </Button>
    </FloatingWrapper>
  )
}
