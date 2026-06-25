import { Layers } from 'lucide-react'
import type { MigrationStatus } from '@/features/migration/useMigrationStatus'
import { cn } from '@/lib/utils'
import type { ProtocolVersion } from '@/utils/types'
import { InfoRow } from './InfoRow'

/**
 * "Protocol" overview row. For ENSv2 names it shows the version; for ENSv1 it
 * also surfaces whether the name can be migrated to ENSv2.
 */
export const ProtocolRow = ({
  protocolVersion,
  migration,
  isLoading,
}: {
  protocolVersion: ProtocolVersion
  migration?: MigrationStatus
  isLoading?: boolean
}) => {
  const showMigrationSuffix =
    protocolVersion === 'ENSv1' && !isLoading && migration !== undefined

  return (
    <InfoRow icon={Layers} label="Protocol">
      <span className="font-semi-mono">
        {protocolVersion}
        {showMigrationSuffix && (
          <>
            {': '}
            <span
              className={cn(
                migration.migratable
                  ? 'text-message-success-text'
                  : 'text-muted-foreground',
              )}
            >
              {migration.migratable ? 'Can be migrated' : 'Cannot be migrated'}
            </span>
          </>
        )}
      </span>
    </InfoRow>
  )
}
