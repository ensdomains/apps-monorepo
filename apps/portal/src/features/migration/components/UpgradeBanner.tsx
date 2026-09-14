import { CircleAlert } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { UpgradeActions } from '@/features/migration/components/UpgradeActions'

/**
 * Prompts the connected owner of a migratable v1 name to upgrade it to ENSv2 in
 * the Manager app. Rendered only when the name is migratable and the owner
 * wallet is connected (gated by the caller).
 */
export const UpgradeBanner = ({ name }: { name: string }) => (
  <Alert
    variant="default"
    className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-5"
  >
    <div className="flex items-start gap-4 flex-col sm:flex-row sm:items-center">
      <CircleAlert className="size-6 shrink-0" />
      <p className="text-3xl font-normal leading-none tracking-[-0.02em] font-serif">
        Upgrade to ENSv2
      </p>
    </div>
    <div className="flex items-start lg:items-center gap-4 flex-col lg:flex-row">
      <p className="text-p">
        This name is reserved on ENS v2 until it is migrated from ENS v1{' '}
      </p>
      <UpgradeActions name={name} />
    </div>
  </Alert>
)
