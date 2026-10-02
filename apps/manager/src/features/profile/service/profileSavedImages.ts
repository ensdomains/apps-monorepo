import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type QueryClient,
  type QueryKey,
  queryOptions,
  skipToken,
} from '@tanstack/react-query'
import type { ImageType } from './profileImageUpload'

type ImageRecords = Partial<Record<ImageType, string>>
type SavedProfileImages = Partial<
  Record<
    ImageType,
    {
      readonly record: string
      readonly isAcknowledged: boolean
    }
  >
>

const observedQueryClients = new WeakMap<QueryClient, Set<string>>()

const getRecordsQueryMeta = (
  queryKey: QueryKey,
):
  | {
      name: string
      kinds: readonly ImageType[]
    }
  | undefined => {
  const [meta] = queryKey
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return
  const fields = meta as Record<string, unknown>
  if (
    fields.$scope !== 'profile' ||
    fields.$action !== 'get_records' ||
    typeof fields.name !== 'string'
  )
    return
  if (fields.selection !== undefined && fields.selection !== 'name-row') return
  return {
    name: fields.name,
    kinds: fields.selection === 'name-row' ? ['avatar'] : ['avatar', 'header'],
  }
}

const getImageRecord = (data: unknown, kind: ImageType): string | undefined => {
  if (
    !data ||
    typeof data !== 'object' ||
    !('texts' in data) ||
    !Array.isArray(data.texts)
  )
    return
  const text = data.texts.find(
    (value: unknown) =>
      value !== null &&
      typeof value === 'object' &&
      'key' in value &&
      value.key === kind,
  ) as { readonly value?: unknown } | undefined
  if (text && typeof text.value !== 'string') return
  return typeof text?.value === 'string' ? text.value.trim() : ''
}

const reconcileImageRecords = (
  saved: SavedProfileImages,
  data: unknown,
  kinds: readonly ImageType[],
): SavedProfileImages => {
  const next = { ...saved }
  let hasChanges = false
  for (const kind of kinds) {
    const image = saved[kind]
    const record = getImageRecord(data, kind)
    if (!image || record === undefined) continue
    // Reads begun before a save may finish afterward. Wait for a read to
    // acknowledge the saved record before accepting subsequent changes.
    if (!image.isAcknowledged && record !== image.record) continue
    if (record === image.record && image.isAcknowledged) continue
    next[kind] = { record, isAcknowledged: true }
    hasChanges = true
  }
  return hasChanges ? next : saved
}

const observeProfileImageRecords = (queryClient: QueryClient): Set<string> => {
  const existing = observedQueryClients.get(queryClient)
  if (existing) return existing
  const pendingLookups = new Set<string>()
  observedQueryClients.set(queryClient, pendingLookups)
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return
    if (event.action.type === 'fetch' || event.action.type === 'error') {
      pendingLookups.delete(event.query.queryHash)
      return
    }
    if (event.action.type !== 'success') return
    // A pre-save row lookup can finish after a fresh full-profile lookup has
    // acknowledged the save. Its result must still be ignored.
    if (pendingLookups.delete(event.query.queryHash)) return
    const meta = getRecordsQueryMeta(event.query.queryKey)
    if (!meta) return
    const queryKey = savedProfileImagesQuery(meta.name).queryKey
    const saved = queryClient.getQueryData(queryKey)
    if (!saved) return
    const next = reconcileImageRecords(
      saved,
      event.query.state.data,
      meta.kinds,
    )
    if (next !== saved) queryClient.setQueryData(queryKey, next)
  })
  return pendingLookups
}

export const savedProfileImagesQuery = (name: string) =>
  queryOptions<SavedProfileImages>({
    queryKey: qk('profile', 'saved_images', {
      name: name.trim().toLowerCase(),
    }),
    queryFn: skipToken,
    // Metadata may still serve an older record after a save. Retain the saved
    // image records through navigation for this QueryClient's lifetime.
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  })

export const cacheSavedProfileImages = ({
  name,
  images,
  queryClient,
}: {
  readonly name: string
  readonly images: ImageRecords
  readonly queryClient: QueryClient
}): void => {
  const pendingLookups = observeProfileImageRecords(queryClient)
  const { queryKey, ...defaults } = savedProfileImagesQuery(name)
  queryClient.setQueryDefaults(queryKey, defaults)
  const cachedRecords = queryClient.getQueryCache().findAll({
    queryKey: $qk({ $scope: 'profile', $action: 'get_records' }),
    predicate: (query) =>
      getRecordsQueryMeta(query.queryKey)?.name.toLowerCase() ===
      name.trim().toLowerCase(),
  })
  for (const query of cachedRecords) {
    if (query.state.fetchStatus === 'fetching') {
      pendingLookups.add(query.queryHash)
    }
  }
  queryClient.setQueryData(queryKey, (previous) => {
    const next = { ...previous }
    for (const kind of ['avatar', 'header'] as const) {
      const record = images[kind]?.trim()
      if (record === undefined) continue
      const isAcknowledged = cachedRecords.some((query) => {
        const meta = getRecordsQueryMeta(query.queryKey)
        return (
          meta?.kinds.includes(kind) &&
          getImageRecord(query.state.data, kind) === record
        )
      })
      next[kind] = { record, isAcknowledged }
    }
    return next
  })
}
