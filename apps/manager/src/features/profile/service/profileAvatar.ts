import { envConfig } from '@/config'

const ENS_METADATA_V2_URL = `https://ens-metadata-v2.ensdomains.workers.dev/${envConfig.network}`

const buildNameImageUrl = ({
  kind,
  name,
}: {
  kind: 'avatar' | 'header'
  name: string
}): string => {
  const url = new URL(
    `${ENS_METADATA_V2_URL}/${kind}/${encodeURIComponent(name)}`,
  )

  return url.toString()
}

export const buildNameAvatarUrl = (name: string): string =>
  buildNameImageUrl({ kind: 'avatar', name })
