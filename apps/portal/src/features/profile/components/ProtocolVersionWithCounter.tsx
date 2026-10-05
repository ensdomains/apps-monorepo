import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { AlertCircleIcon } from 'lucide-react'
import { ShieldIcon } from '@/assets/icons'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  DataBlockCard,
  DataBlockCardError,
} from '@/features/dashboard/components'
import { getBurnedFuseCountQueryOptions } from '@/features/namewrapper/hooks/useBurnedFuseCount'
import { getNameResourceIdQueryOptions } from '@/features/registry/hooks/useNameResourceId'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { resourceIdForName } from '@/lib/resource/resourceId'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { ProtocolVersion } from '@/utils/types'

const v2EthRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

interface ProtocolVersionWithCounterProps {
  name: string
  protocolVersion: ProtocolVersion
}

const RoleCount = ({ name }: { name: string }) => {
  // The resource the grants were recorded against. An ordinary first label is
  // hashed here; only a label rendered `[<64 hex>]` costs a read, because that
  // string does not say which name it is (WEB-1458).
  const idFromName = resourceIdForName(name).unwrapOr(null)
  const { data: readId, isLoading: isReadingId } = useQuery({
    ...getNameResourceIdQueryOptions({
      name,
      registryAddress: v2EthRegistry,
    }),
    enabled: idFromName === null,
  })
  const resource = idFromName ?? readId ?? null

  const { data, isLoading, error } = useQuery({
    ...getNameRolesAccountsQueryOptions({
      resource,
      registryAddress: v2EthRegistry,
    }),
    enabled: Boolean(resource),
  })

  if (error)
    return (
      <DataBlockCardError
        icon={AlertCircleIcon}
        message="Failed to load roles"
      />
    )
  if (isReadingId) return <LoadingSpinner />
  if (isLoading) return <LoadingSpinner />

  return (
    <DataBlockCard
      to="/$name/roles"
      params={{ name }}
      icon={ShieldIcon}
      label="Role holders"
      value={(data || { size: 0 }).size}
    />
  )
}

const FuseCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getBurnedFuseCountQueryOptions({ name }),
  )

  if (error)
    return (
      <DataBlockCardError
        icon={AlertCircleIcon}
        message="Failed to load fuses"
      />
    )
  if (isLoading) return <LoadingSpinner />

  if (data === null) return null

  return (
    <DataBlockCard
      to="/$name/fuses"
      params={{ name }}
      icon={ShieldIcon}
      label="Fuses burned"
      value={data}
    />
  )
}

export const ProtocolVersionWithCounter = ({
  name,
  protocolVersion,
}: ProtocolVersionWithCounterProps) => {
  return protocolVersion === 'ENSv1' ? (
    <FuseCount name={name} />
  ) : (
    <RoleCount name={name} />
  )
}
