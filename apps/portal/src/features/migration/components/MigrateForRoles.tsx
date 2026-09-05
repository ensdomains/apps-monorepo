import { MigrateForRolesBanner } from '@/features/migration/components/MigrateForRolesBanner'
import { MigrateForRolesMessage } from '@/features/migration/components/MigrateForRolesMessage'
import { useMigrationStatus } from '@/features/migration/hooks/useMigrationStatus'

/**
 * Owns the migration read for the Fuses page so the route does not gate one
 * query on another's result. Mounted only for a v1 name, which is why it can
 * name the protocol outright.
 *
 * A wrapped name keeps its fuses and gets the compact banner; one with none
 * gets the full message, which explains itself even to a viewer who cannot act.
 */
export const MigrateForRoles = ({
  name,
  hasFuses,
}: {
  readonly name: string
  readonly hasFuses: boolean
}) => {
  const { isMigratableByConnectedOwner } = useMigrationStatus({
    name,
    protocolVersion: 'ENSv1',
  })

  if (hasFuses)
    return isMigratableByConnectedOwner ? <MigrateForRolesBanner /> : null

  return (
    <MigrateForRolesMessage
      name={name}
      canMigrate={isMigratableByConnectedOwner}
    />
  )
}
