import { Trans } from '@lingui/react/macro'
import { Button } from '@/components/ens-consumer/button/Button'
import { useLoginModal } from '@/features/auth/LoginModalProvider'

export const ConnectWallet = () => {
  const { openLogin } = useLoginModal()

  return (
    <Button color="blue" onClick={() => openLogin()} size="temp-xs">
      <Trans>Connect Wallet</Trans>
    </Button>
  )
}
