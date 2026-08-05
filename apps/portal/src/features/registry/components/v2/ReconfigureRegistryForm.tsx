import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { SubregistryConfigurator } from './SubregistryConfigurator'

type ReconfigureRegistryFormProps = {
  name: string
  onClose: () => void
}

export function ReconfigureRegistryForm({
  name,
  onClose,
}: ReconfigureRegistryFormProps) {
  const isMobile = useIsMobile()

  return (
    <div
      className={cn(
        'flex flex-col gap-4 max-w-xl',
        isMobile ? 'pl-0 pt-3' : 'pl-14',
      )}
    >
      <Alert className="p-6 gap-2" variant="warning">
        <AlertTitle>Configure new registry</AlertTitle>
        <AlertDescription className="text-foreground">
          The current registry will still exist, but this name will no longer
          reference it or any subnames created within it.
        </AlertDescription>
      </Alert>
      <SubregistryConfigurator
        name={name}
        onCancel={onClose}
        onComplete={onClose}
      />
    </div>
  )
}
