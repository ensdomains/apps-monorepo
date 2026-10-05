import { CircleAlert, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { UpgradeActions } from '@/features/migration/components/UpgradeActions'

/**
 * Shown on the Fuses page of a v1 name that has none. Wrapping is closed, so
 * the page can never fill up: it points at Roles in ENSv2 instead.
 *
 * The holder gets the entity-blue prompt and the buttons. Anyone else gets the
 * same fact in the page's neutral card, stated rather than asked of them: with
 * no buttons, "migrate this name" is an instruction they cannot carry out.
 */
export const MigrateForRolesMessage = ({
  name,
  canMigrate,
}: {
  readonly name: string
  readonly canMigrate: boolean
}) => (
  <Alert
    variant={canMigrate ? 'default' : 'neutral'}
    className="max-w-xl mx-auto gap-y-2 p-5"
  >
    {canMigrate ? <CircleAlert /> : <Info />}
    <AlertTitle>Fuses not available</AlertTitle>
    <AlertDescription>
      <p>This name is not wrapped, so it has no fuses to show.</p>
      <p>
        {canMigrate
          ? 'Roles and permissions replace fuses in ENSv2. Upgrade this name to v2 in order to assign Roles.'
          : 'Roles and permissions replace fuses in ENSv2. This name would need to be upgraded to v2 to use them.'}
      </p>
    </AlertDescription>
    {canMigrate && (
      <div className="col-start-2 mt-2">
        <UpgradeActions name={name} />
      </div>
    )}
  </Alert>
)
