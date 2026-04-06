import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { ListIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Address } from 'viem'
import {
  CounterCard,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
import { recordsToTableData } from '@/utils/records/recordsToTableData'

export const RecordCount = ({
  name,
  records,
}: {
  name: string
  records?: GetRecordsReturnType
  resolverAddress: Address
}) => {
  const recordCount = useMemo(() => {
    if (records) return recordsToTableData(records).length
    else return 0
  }, [records])

  return (
    <CounterCard>
      <CounterCardRow
        icon={ListIcon}
        action={<CounterCardLink to="/$name/records" params={{ name }} />}
      >
        <span className="font-medium text-foreground">{recordCount}</span>{' '}
        <span className="text-muted-foreground">records set</span>
      </CounterCardRow>
    </CounterCard>
  )
}
