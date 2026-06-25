import { ArrowUpCircle } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getManagerMigrateUrl } from '@/lib/constants/managerApp'

/**
 * Prompts the connected owner of a migratable v1 name to upgrade it to ENSv2 in
 * the Manager app. Rendered only when the name is migratable and the owner
 * wallet is connected (gated by the caller).
 */
export const UpgradeBanner = ({ name }: { name: string }) => (
  <Alert className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-start gap-3">
      <ArrowUpCircle className="size-6 shrink-0 mt-0.5" />
      <div>
        <p className="text-base font-medium leading-tight">Upgrade to ENSv2</p>
        <p className="text-sm text-muted-foreground">
          This name is reserved on ENS v2 until it is migrated from ENS v1.
        </p>
      </div>
    </div>
    <Button asChild size="sm">
      <a
        href={getManagerMigrateUrl(name)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Upgrade to v2
      </a>
    </Button>
  </Alert>
)
