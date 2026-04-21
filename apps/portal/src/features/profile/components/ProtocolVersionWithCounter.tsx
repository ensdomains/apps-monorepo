import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { useQuery } from '@tanstack/react-query'
import { AlertCircleIcon } from 'lucide-react'
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
    return (
      <div className="h-21.5 w-full flex rounded-sm overflow-hidden border border-border items-center">
        <CounterCardRow icon={AlertCircleIcon}>
          <span className="text-sm text-muted-foreground">
            Failed to load roles
          </span>
        </CounterCardRow>
      </div>
    )
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
    return (
      <div className="h-21.5 w-full flex rounded-sm overflow-hidden border border-border items-center">
        <CounterCardRow icon={AlertCircleIcon}>
          <span className="text-sm text-muted-foreground">
            Failed to load fuses
          </span>
        </CounterCardRow>
      </div>
    )
  if (isLoading) return <LoadingSpinner />

  if (data === null) return null

  return (
    <CounterCard to="/$name/fuses" params={{ name }}>
      <CounterCardRow icon={ShieldIcon}>
        <span className="font-medium text-foreground">{data}</span>{' '}
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
