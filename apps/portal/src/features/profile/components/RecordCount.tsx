import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { FileCodeIcon, ListIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { CopyableRecord } from '@/components/CopyableRecord'
import {
  CounterCard,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
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
        <span className="font-medium">{recordCount}</span> records set
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
        <span className="font-medium">Resolver</span>
        {underlyingResolverAddress ? (
          <CopyableRecord
            displayValue={truncateAddress(
              underlyingResolverAddress,
              6,
              4,
              '...',
            )}
            value={underlyingResolverAddress}
          />
        ) : (
          <div>No resolver set</div>
        )}
      </CounterCardRow>
    </CounterCard>
  )
}
