import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken, useQuery } from '@tanstack/react-query'
import { ok } from 'neverthrow'

const ENS_METADATA_V2_SEPOLIA_AVATAR_URL =
  'https://ens-metadata-v2.ensdomains.workers.dev/sepolia/avatar'

export type NameAvatarMap = Record<string, string | undefined>

export const buildNameAvatarUrl = (name: string, version?: number): string => {
  const url = new URL(
    `${ENS_METADATA_V2_SEPOLIA_AVATAR_URL}/${encodeURIComponent(name)}`,
  )

  if (version !== undefined) {
    url.searchParams.set('v', String(version))
  }

  return url.toString()
}

export const getNamesAvatarsByName = (
  names: readonly string[],
  version?: number,
) =>
  ok(
    Object.fromEntries(
      names.map((name) => [name, buildNameAvatarUrl(name, version)]),
    ) as NameAvatarMap,
  )

export const namesAvatarsByNameQuery = (
  names: readonly string[],
  version?: number,
) => {
  const sortedNames = names.slice().sort()
  return resultQueryOptions({
    queryKey: qk('profile', 'names_avatars_by_name', {
      names: sortedNames,
      version,
    }),
    queryFn:
      names.length > 0
        ? () => getNamesAvatarsByName(names, version)
        : skipToken,
  })
}

export const getNameAvatar = (name: string, version?: number) =>
  ok(buildNameAvatarUrl(name, version))

export const nameAvatarQuery = (name: string | undefined, version?: number) =>
  resultQueryOptions({
    queryKey: qk('profile', 'name_avatar', { name, version }),
    queryFn: name ? () => getNameAvatar(name, version) : skipToken,
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
