import { useQuery } from '@tanstack/react-query'
import { ListIcon, ListStartIcon } from 'lucide-react'
import type { Address } from 'viem'
import {
  CounterCard,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { ProtocolVersion } from '@/utils/types'
import { getSubnamesQueryOptions } from '../hooks/useSubnames'
import { RegistryLocation } from './RegistryLocation'

const v1EnsRegistry = sepoliaWithEns.contracts.ensLegacyRegistry.address

export const SubnameCount = ({
  name,
  registryAddress,
  protocolVersion,
}: {
  name: string
  registryAddress?: Address
  protocolVersion: ProtocolVersion
}) => {
  const { data, isLoading, error } = useQuery(
    getSubnamesQueryOptions({ name, protocolVersion }),
  )

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <CounterCard>
      <CounterCardRow
        icon={ListIcon}
        action={<CounterCardLink to="/$name/subnames" params={{ name }} />}
      >
        <span className="font-medium">{data ? data.length : 0}</span> subnames
      </CounterCardRow>
      <CounterCardRow
        icon={ListStartIcon}
        action={
          <CounterCardLink
            to="/$name/registry"
            search={{ view: 'list' }}
            params={{ name }}
          />
        }
      >
        {registryAddress && registryAddress !== v1EnsRegistry ? (
          <RegistryLocation name={name} registryAddress={registryAddress} />
        ) : (
          <>
            <span className="font-medium">Subregistry</span>
            <div>None set</div>
          </>
        )}
      </CounterCardRow>
    </CounterCard>
  )
}
