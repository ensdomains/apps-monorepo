import { createAtom, useAtom } from '@xstate/store-react'
import { queryClient } from '@/utils/queryClient'

const imageVersions = createAtom<ReadonlyMap<string, number>>(new Map())

export const refreshRecordImage = (imageUrl: string, now: number) => {
  const url = new URL(imageUrl).href
  imageVersions.set(
    (versions) =>
      new Map([
        ...versions,
        [url, Math.max(now, (versions.get(url) ?? 0) + 1)],
      ]),
  )
}

export const useVersionedRecordImage = (
  imageUrl: string | null | undefined,
) => {
  const url = imageUrl && URL.canParse(imageUrl) ? new URL(imageUrl) : null
  const version = useAtom(imageVersions, (versions) =>
    url ? versions.get(url.href) : undefined,
  )
  if (!url || version === undefined) return imageUrl

  url.searchParams.set('v', String(version))
  return url.href
}

export const invalidateAvatar = (name: string) =>
  queryClient.invalidateQueries({ queryKey: ['ensAvatar', { name }] })
