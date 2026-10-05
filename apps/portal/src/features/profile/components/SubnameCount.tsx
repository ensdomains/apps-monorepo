import { useQuery } from '@tanstack/react-query'
import { AlertCircleIcon } from 'lucide-react'
import { GraphIcon } from '@/assets/icons'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  DataBlockCard,
  DataBlockCardError,
} from '@/features/dashboard/components'
import type { ProtocolVersion } from '@/utils/types'
import { getSubnamesCountQueryOptions } from '../hooks/useSubnames'

export const SubnameCount = ({
  name,
  protocolVersion,
}: {
  name: string
  protocolVersion: ProtocolVersion
}) => {
  const { data, isLoading, error } = useQuery(
    getSubnamesCountQueryOptions({ name, protocolVersion }),
  )

  if (error)
    return (
      <DataBlockCardError
        icon={AlertCircleIcon}
        message="Failed to load subnames"
      />
    )
  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <DataBlockCard
      to="/$name/subnames"
      params={{ name }}
      icon={GraphIcon}
      label="Subnames"
      value={data ?? 0}
    />
  )
}
