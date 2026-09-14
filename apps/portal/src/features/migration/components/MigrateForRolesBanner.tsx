import { CircleAlert } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { UpgradeActions } from '@/features/migration/components/UpgradeActions'

/**
 * The compact twin of {@link MigrateForRolesMessage}, for a wrapped v1 name
 * whose fuses do render: it mentions Roles without displacing the table.
 * Rendered only for the holder, who is the only one who can migrate.
 *
 * `Alert` lays its children out on a two-column grid, so the text and the
 * button share one `col-start-2` child rather than becoming two grid cells.
 */
export const MigrateForRolesBanner = ({ name }: { readonly name: string }) => (
  <Alert variant="default" className="p-4">
    <CircleAlert />
    <div className="col-start-2 flex flex-wrap items-center justify-between gap-3">
      <p className="text-p">
        ENSv2 replaces fuses with Roles, a finer-grained set of permissions you
        can grant per name.
      </p>
      <UpgradeActions name={name} learnMore={false} />
    </div>
  </Alert>
)
