import { useQuery } from '@tanstack/react-query'
import { GraphIcon } from '@/assets/icons'
import { CounterCard, CounterCardRow } from '@/components/CounterCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { WithEnsNetwork } from '@/utils/types'
import { getSubnamesQueryOptions } from '../hooks/useSubnames'

export const SubnameCount = ({
  name,
  network,
}: WithEnsNetwork<{
  name: string
}>) => {
  const { data, isLoading, error } = useQuery(
    getSubnamesQueryOptions({ name, network }),
  )

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <CounterCard to="/$name/subnames" params={{ name }}>
      <CounterCardRow icon={GraphIcon}>
        <span className="font-medium text-foreground">
          {data ? data.length : 0}
        </span>{' '}
        <span className="text-muted-foreground">subnames</span>
      </CounterCardRow>
    </CounterCard>
  )
}
