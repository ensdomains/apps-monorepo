import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useConnectModal } from './ConnectModalProvider'

export const ConnectWalletAlert = ({
  className,
}: {
  readonly className?: string
}) => {
  const { openConnectModal } = useConnectModal()

  return (
    <Alert
      variant="warning"
      className={cn('items-center [&>svg]:translate-y-0', className)}
    >
      <CircleAlert strokeWidth={1.5} />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <p>Wallet not connected</p>
        <Button type="button" size="xs" onClick={() => openConnectModal()}>
          Connect
        </Button>
      </AlertDescription>
    </Alert>
  )
}
