import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RegistryPanel } from './RegistryPanel'
import { SubregistryConfigurator } from './SubregistryConfigurator'

type ReconfigureRegistryFormProps = {
  name: string
  onClose: () => void
}

export const ReconfigureRegistryForm = ({
  name,
  onClose,
}: ReconfigureRegistryFormProps) => {
  return (
    <RegistryPanel>
      <Alert className="p-5 gap-2" variant="warning">
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
        // Replacing the current registry is what this form is for; the warning
        // above is the confirmation.
        assertWritable={null}
      />
    </RegistryPanel>
  )
}
