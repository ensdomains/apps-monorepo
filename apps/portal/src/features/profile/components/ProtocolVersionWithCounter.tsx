import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { useQuery } from '@tanstack/react-query'
import { HashIcon, ListIcon } from 'lucide-react'
import {
  CounterCard,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
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
    return <div>Failed to fetch fuses count: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner />

  return (
    <CounterCardRow
      icon={ListIcon}
      action={<CounterCardLink to="/$name/roles" params={{ name }} />}
    >
      <span className="font-medium">{(data || { size: 0 }).size}</span> roles
    </CounterCardRow>
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
    <CounterCardRow
      icon={ListIcon}
      action={<CounterCardLink to="/$name/fuses" params={{ name }} />}
    >
      <span className="font-medium">{data || 0}</span> fuses burned
    </CounterCardRow>
  )
}

export const ProtocolVersionWithCounter = ({
  name,
  protocolVersion,
}: ProtocolVersionWithCounterProps) => {
  return (
    <CounterCard>
      {protocolVersion === 'ENSv1' ? (
        <FuseCount name={name} />
      ) : (
        <RoleCount name={name} />
      )}
      <CounterCardRow
        icon={HashIcon}
        action={
          <CounterCardLink
            to="/$name/records"
            search={{ view: 'list' }}
            params={{ name }}
          />
        }
      >
        <div className="font-medium">Protocol</div>
        <div>{protocolVersion}</div>
      </CounterCardRow>
    </CounterCard>
  )
}
