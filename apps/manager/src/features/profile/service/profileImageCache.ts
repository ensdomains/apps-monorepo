import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { ProfileRecords } from '@/features/profile/types'
import { imageRecordQuery } from './profileImageRecord'
import type { ImageType } from './profileImageUpload'
import {
  getVersionedProfileImageUrl,
  isUploadedProfileImageUrl,
  profileImageVersionQuery,
} from './profileImageVersion'
import type { ProfileRecordsResult } from './profileRecords'

export interface SignedProfileImageUpload {
  readonly kind: ImageType
  readonly imageUrl: string
}

interface RefreshProfileImageCachesParams {
  readonly images: readonly SignedProfileImageUpload[]
  readonly queryClient: QueryClient
}

const PROFILE_IMAGE_TEXT_KEYS = ['avatar', 'header', 'theme'] as const

export const updateProfileImageRecords = async ({
  name,
  records,
  queryClient,
}: {
  readonly name: string
  readonly records: ProfileRecords
  readonly queryClient: QueryClient
}) => {
  const filters = {
    queryKey: $qk({ $scope: 'profile', $action: 'get_records', name }),
  }
  // A read started before the save must not restore the previous image records.
  await queryClient.cancelQueries(filters)

  const texts = PROFILE_IMAGE_TEXT_KEYS.flatMap((key) => {
    const value = records.base[key]?.trim()
    return value ? [{ key, value }] : []
  })
  queryClient.setQueriesData<Pick<ProfileRecordsResult, 'texts'>>(
    filters,
    (previous) =>
      previous
        ? {
            ...previous,
            texts: [
              ...previous.texts.filter(
                ({ key }) =>
                  !PROFILE_IMAGE_TEXT_KEYS.some((imageKey) => imageKey === key),
              ),
              ...texts,
            ],
          }
        : undefined,
  )
}

const getQueryMeta = (queryKey: QueryKey): Record<string, unknown> | null => {
  const [meta] = queryKey

  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null
  }

  return meta as Record<string, unknown>
}

const getQueryMetaString = (
  queryKey: QueryKey,
  key: string,
): string | undefined => {
  const value = getQueryMeta(queryKey)?.[key]
  return typeof value === 'string' ? value : undefined
}

const normalizeImageUrl = (imageUrl: string) => imageUrl.trim()

export const getActiveSignedProfileImageUploads = <
  TImage extends SignedProfileImageUpload,
>({
  images,
  records,
}: {
  readonly images: readonly TImage[]
  readonly records: ProfileRecords
}) =>
  images.filter(
    ({ imageUrl, kind }) =>
      normalizeImageUrl(records.base[kind] ?? '') ===
      normalizeImageUrl(imageUrl),
  )

export const refreshProfileImageCaches = async ({
  images,
  queryClient,
}: RefreshProfileImageCachesParams) => {
  await Promise.all(
    images
      .filter(({ imageUrl }) => isUploadedProfileImageUrl(imageUrl))
      .map(async ({ imageUrl }) => {
        const record = normalizeImageUrl(imageUrl)
        const filters = {
          queryKey: $qk({ $scope: 'profile', $action: 'image_record' }),
          predicate: (query: { readonly queryKey: QueryKey }) =>
            getQueryMetaString(query.queryKey, 'record')?.trim() === record,
        }
        await queryClient.cancelQueries(filters)

        const { queryKey, ...defaults } = profileImageVersionQuery(record)
        queryClient.setQueryDefaults(queryKey, defaults)
        const version = Math.max(
          Date.now(),
          (queryClient.getQueryData(queryKey) ?? 0) + 1,
        )
        queryClient.setQueryData(queryKey, version)

        const url = getVersionedProfileImageUrl(record, version)
        queryClient.setQueriesData(filters, url)
        // Seed the default query even when the editor has only shown a local
        // preview and no image-record observer has mounted yet.
        queryClient.setQueryData(imageRecordQuery(record).queryKey, url)
      }),
  )
}
