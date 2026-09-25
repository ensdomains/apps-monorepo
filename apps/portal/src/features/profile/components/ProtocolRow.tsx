import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import {
  getMigrationStatusQueryOptions,
  type MigrationStatus,
} from '@/features/migration/hooks/useMigrationStatus'
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
      {protocolVersion}
      {showMigrationSuffix && (
        <>
          {': '}
          {migration.migratable ? 'Can be migrated' : 'Cannot be migrated'}
        </>
      )}
    </InfoRow>
  )
}

/**
 * Protocol row for an ENSv1 name. The verdict is a fact about the name, so it
 * is evaluated against the name's own v1 token holder rather than the
 * connected wallet: a visitor still sees whether the name can be migrated.
 */
export const V1ProtocolRow = ({ name }: { readonly name: string }) => {
  const { data, isLoading } = useQuery(getMigrationStatusQueryOptions({ name }))

  return (
    <ProtocolRow
      protocolVersion="ENSv1"
      migration={data}
      isLoading={isLoading}
    />
  )
}
