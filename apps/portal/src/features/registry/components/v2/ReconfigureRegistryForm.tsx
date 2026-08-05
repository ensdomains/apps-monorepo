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
      <div className="flex flex-col gap-4 bg-warning-fill p-6 rounded-xl">
        <h3 className="text-3xl font-normal leading-none tracking-[-0.02em] font-serif text-warning-text">
          Configure new registry
        </h3>
        <p className="text-p">
          The current registry will still exist, but this name will no longer
          reference it or any subnames created within it.
        </p>
      </div>
      <SubregistryConfigurator
        name={name}
        onCancel={onClose}
        onComplete={onClose}
      />
    </div>
  )
}
