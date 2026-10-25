import { useQuery } from '@tanstack/react-query'
import { resolverWriteAccessQuery } from '@/features/profile/service/resolverWriteAccess'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseCanEditRecordsParams = {
  readonly enabled: boolean
  readonly isOwner: boolean | undefined
  readonly name: string
}

/** Registry ownership alone never grants resolver write access. */
export const useCanEditRecords = ({
  enabled,
  isOwner,
  name,
}: UseCanEditRecordsParams) => {
  const { ownerAddress } = useSmartAccountContext()
  const { data: canWriteResolver, isError } = useQuery({
    ...resolverWriteAccessQuery(name, ownerAddress ?? undefined),
    enabled: enabled && isOwner !== undefined && Boolean(ownerAddress),
  })

  return enabled && !isError && canWriteResolver === true
}
