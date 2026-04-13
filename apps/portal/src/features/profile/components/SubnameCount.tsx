import { useQuery } from '@tanstack/react-query'
import { AlertCircleIcon } from 'lucide-react'
import { GraphIcon } from '@/assets/icons'
import { CounterCard, CounterCardRow } from '@/components/CounterCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { ProtocolVersion } from '@/utils/types'
import { getSubnamesQueryOptions } from '../hooks/useSubnames'

export const SubnameCount = ({
  name,
  protocolVersion,
}: {
  name: string
  protocolVersion: ProtocolVersion
}) => {
  const { data, isLoading, error } = useQuery(
    getSubnamesQueryOptions({ name, protocolVersion }),
  )

  if (error)
    return (
      <div className="h-21.5 w-full flex rounded-sm overflow-hidden border border-border items-center">
        <CounterCardRow icon={AlertCircleIcon}>
          <span className="text-sm text-muted-foreground">
            Failed to load subnames
          </span>
        </CounterCardRow>
      </div>
    )
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
