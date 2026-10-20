import { useQuery } from '@tanstack/react-query'
import { resolverWriteAccessQuery } from '@/features/profile/service/resolverWriteAccess'
import { useSmartAccountContext } from '@/lib/smart-account'

type UseCanEditRecordsParams = {
  readonly enabled: boolean
  readonly isOwner: boolean | undefined
  readonly name: string
}

/** Owners edit; a non-owner edits only while its wallet can still write the name's resolver. */
export const useCanEditRecords = ({
  enabled,
  isOwner,
  name,
}: UseCanEditRecordsParams) => {
  const { ownerAddress } = useSmartAccountContext()
  const { data: canWriteResolver } = useQuery({
    ...resolverWriteAccessQuery(name, ownerAddress ?? undefined),
    enabled: enabled && isOwner === false && Boolean(ownerAddress),
  })

  return isOwner || canWriteResolver === true
}
