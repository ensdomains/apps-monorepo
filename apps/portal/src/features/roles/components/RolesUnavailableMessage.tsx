import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { UpgradeActions } from '@/features/migration/components/UpgradeActions'

/**
 * Roles are an ENSv2 concept, and a v1 name cannot be wrapped any more, so the
 * page points at migration rather than at a feature the name can never use.
 */
export const RolesUnavailableMessage = ({
  name,
}: {
  readonly name: string
}) => (
  <Alert className="max-w-xl mx-auto gap-y-2 p-5">
    <CircleAlert />
    <AlertTitle>Roles not available</AlertTitle>
    <AlertDescription>
      Roles and permissions are available in ENSv2. Migrate this name to v2 in
      order to assign Roles.
    </AlertDescription>
    <div className="col-start-2 mt-2">
      <UpgradeActions name={name} />
    </div>
  </Alert>
)
