import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { CardsStackIcon } from '@/assets/icons'
import { CounterCard, CounterCardRow } from '@/components/CounterCard'
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
    <CounterCard to="/$name/records" params={{ name }}>
      <CounterCardRow icon={CardsStackIcon}>
        <span className="font-medium text-foreground">{recordCount}</span>{' '}
        <span className="text-muted-foreground">records set</span>
      </CounterCardRow>
    </CounterCard>
  )
}
