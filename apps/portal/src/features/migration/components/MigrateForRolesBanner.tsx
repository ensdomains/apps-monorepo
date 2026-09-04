import { ArrowUpCircle, CircleAlert } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MANAGER_MIGRATE_URL } from '@/lib/constants/domain'

/**
 * The compact twin of {@link MigrateForRolesMessage}, for a wrapped v1 name
 * whose fuses do render: it mentions Roles without displacing the table.
 * Rendered only for the holder, who is the only one who can migrate.
 *
 * `Alert` lays its children out on a two-column grid, so the text and the
 * button share one `col-start-2` child rather than becoming two grid cells.
 */
export const MigrateForRolesBanner = () => (
  <Alert variant="default" className="p-4">
    <CircleAlert />
    <div className="col-start-2 flex flex-wrap items-center justify-between gap-3">
      <p className="text-p">
        ENSv2 replaces fuses with Roles, a finer-grained set of permissions you
        can grant per name.
      </p>
      <Button
        className="rounded-xs shrink-0"
        asChild
        variant="entity"
        size="xs"
      >
        <a href={MANAGER_MIGRATE_URL} target="_blank" rel="noopener noreferrer">
          <ArrowUpCircle className="size-4 shrink-0" />
          Upgrade to v2
        </a>
      </Button>
    </div>
  </Alert>
)
