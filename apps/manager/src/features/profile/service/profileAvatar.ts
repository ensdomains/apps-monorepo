import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken, useQuery } from '@tanstack/react-query'
import { ok } from 'neverthrow'

const ENS_METADATA_V2_SEPOLIA_URL =
  'https://ens-metadata-v2.ensdomains.workers.dev/sepolia'

export type NameAvatarMap = Record<string, string | undefined>

const buildNameImageUrl = ({
  kind,
  name,
}: {
  kind: 'avatar' | 'header'
  name: string
}): string => {
  const url = new URL(
    `${ENS_METADATA_V2_SEPOLIA_URL}/${kind}/${encodeURIComponent(name)}`,
  )

  return url.toString()
}

export const buildNameAvatarUrl = (name: string): string =>
  buildNameImageUrl({ kind: 'avatar', name })

export const buildNameHeaderUrl = (name: string): string =>
  buildNameImageUrl({ kind: 'header', name })

export const getNamesAvatarsByName = (
  names: readonly string[],
) =>
  ok(
    Object.fromEntries(
      names.map((name) => [name, buildNameAvatarUrl(name)]),
    ) as NameAvatarMap,
  )

export const namesAvatarsByNameQuery = (
  names: readonly string[],
) => {
  const sortedNames = names.slice().sort()
  return resultQueryOptions({
    queryKey: qk('profile', 'names_avatars_by_name', {
      names: sortedNames,
    }),
    queryFn:
      names.length > 0
        ? () => getNamesAvatarsByName(names)
        : skipToken,
  })
}

export const getNameAvatar = (name: string) => ok(buildNameAvatarUrl(name))

export const nameAvatarQuery = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'name_avatar', { name }),
    queryFn: name ? () => getNameAvatar(name) : skipToken,
  })

export const useAvatarFromName = ({
  name,
  enabled = true,
}: {
  name: string | undefined
  enabled?: boolean
}) => {
  const query = useQuery({
    ...nameAvatarQuery(name),
    enabled: !!name && enabled,
  })

  return {
    data: query.isSuccess ? query.data : undefined,
    isLoading: query.isLoading,
    error: query.error,
  }
}
