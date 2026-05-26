import { AlertCircleIcon } from 'lucide-react'
import { GraphIcon } from '@/assets/icons'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  DataBlockCard,
  DataBlockCardError,
} from '@/features/dashboard/components'
import { useSubnameCount } from '../hooks/useSubnameCount'

export const SubnameCount = ({ name }: { name: string }) => {
  const { data, fetching, error } = useSubnameCount({ name })

  if (error)
    return (
      <DataBlockCardError
        icon={AlertCircleIcon}
        message="Failed to load subnames"
      />
    )
  if (!data && fetching) return <LoadingSpinner title="Loading..." />

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
