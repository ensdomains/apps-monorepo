import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { useQuery } from '@tanstack/react-query'
import { ShieldIcon } from '@/assets/icons'
import { CounterCard, CounterCardRow } from '@/components/CounterCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getBurnedFuseCountQueryOptions } from '@/features/namewrapper/hooks/useBurnedFuseCount'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
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
  const { data, isLoading, error } = useQuery(
    getNameRolesAccountsQueryOptions({
      ...makeLabelNodeAndParent(name),
      registryAddress: v2EthRegistry,
      fromBlock: 9782822n,
    }),
  )

  if (error)
    return <div>Failed to fetch roles count: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner />

  return (
    <CounterCard to="/$name/roles" params={{ name }}>
      <CounterCardRow icon={ShieldIcon}>
        <span className="font-medium text-foreground">
          {(data || { size: 0 }).size}
        </span>{' '}
        <span className="text-muted-foreground">roles</span>
      </CounterCardRow>
    </CounterCard>
  )
}

const FuseCount = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(
    getBurnedFuseCountQueryOptions({ name }),
  )

  if (error)
    return <div>Failed to fetch fuses count: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner />

  return (
    <CounterCard to="/$name/fuses" params={{ name }}>
      <CounterCardRow icon={ShieldIcon}>
        <span className="font-medium text-foreground">{data || 0}</span>{' '}
        <span className="text-muted-foreground">fuses burned</span>
      </CounterCardRow>
    </CounterCard>
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
