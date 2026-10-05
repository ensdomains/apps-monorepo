import { Layers } from 'lucide-react'
import { match, P } from 'ts-pattern'
import {
  type MigrationStatus,
  useMigrationStatus,
} from '@/features/migration/hooks/useMigrationStatus'
import { useIsNameOwner } from '@/features/ownership/hooks/useIsNameOwner'
import type { ProtocolVersion } from '@/utils/types'
import { InfoRow } from './InfoRow'

/**
 * "Protocol" overview row. For ENSv2 names it shows the version; for an ENSv1
 * name's owner it also surfaces whether the name can be migrated to ENSv2.
 */
export const ProtocolRow = ({
  protocolVersion,
  migration,
  isLoading = false,
  isError = false,
}: {
  protocolVersion: ProtocolVersion
  migration?: MigrationStatus
  isLoading?: boolean
  isError?: boolean
}) => (
  <InfoRow icon={Layers} label="Protocol">
    {protocolVersion}
    {match({ isError, isLoading, migration })
      .with({ isError: true }, () => (
        <span className="text-muted-foreground">
          : Failed to check upgrade eligibility
        </span>
      ))
      .with({ isLoading: true }, () => (
        <span className="text-muted-foreground">
          : Checking upgrade eligibility
        </span>
      ))
      .with({ migration: { migratable: true } }, () => ': Can be upgraded')
      .with({ migration: { migratable: false } }, () => ': Cannot be upgraded')
      .with({ migration: P.nullish }, () => null)
      .exhaustive()}
  </InfoRow>
)

/**
 * Protocol row for an ENSv1 name. Only the owner is told whether it can be
 * migrated; anyone else sees the bare version.
 */
export const V1ProtocolRow = ({ name }: { readonly name: string }) => {
  const owner = useIsNameOwner({ name })
  const migration = useMigrationStatus(name)

  if (owner.isLoading || !owner.isOwner)
    return <ProtocolRow protocolVersion="ENSv1" />

  return (
    <ProtocolRow
      protocolVersion="ENSv1"
      migration={migration.data}
      isLoading={migration.isLoading}
      isError={!!migration.error}
    />
  )
}
