import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { FileCodeIcon, ListIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Address } from 'viem'
import {
  CounterCard,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const RecordCount = ({
  name,
  records,
  resolverAddress,
}: {
  name: string
  records?: GetRecordsReturnType
  resolverAddress: Address
}) => {
  const recordCount = useMemo(() => {
    if (records) return recordsToTableData(records).length
    else return 0
  }, [records])

  const { data, isLoading, error } = useQuery({
    ...getUnderlyingAddressQueryOptions({
      name,
      resolverAddress,
    }),
    enabled: Boolean(resolverAddress),
  })

  if (isLoading) return <LoadingSpinner title="Loading underlying resolver" />

  if (error) return <div>Error: {error.cause?.message}</div>

  const underlyingResolverAddress = data?.[0] || undefined

  return (
    <CounterCard>
      <CounterCardRow
        icon={ListIcon}
        action={<CounterCardLink to="/$name/records" params={{ name }} />}
      >
        <span className="font-medium text-foreground">{recordCount}</span>{' '}
        <span className="text-muted-foreground">records set</span>
      </CounterCardRow>
      <CounterCardRow
        icon={FileCodeIcon}
        action={
          <CounterCardLink
            to="/$name/resolver"
            search={{ view: 'list' }}
            params={{ name }}
          />
        }
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Resolver</span>
          {underlyingResolverAddress ? (
            <EntityBadge variant="contract">
              {truncateAddress(underlyingResolverAddress, 6, 4, '...')}
            </EntityBadge>
          ) : (
            <div>No resolver set</div>
          )}
        </div>
      </CounterCardRow>
    </CounterCard>
  )
}
