const ENS_METADATA_V2_SEPOLIA_URL =
  'https://ens-metadata-v2.ensdomains.workers.dev/sepolia'

const buildNameImageUrl = ({
  kind,
  name,
  version,
}: {
  kind: 'avatar' | 'header'
  name: string
  version?: number
}): string => {
  const url = new URL(
    `${ENS_METADATA_V2_SEPOLIA_URL}/${kind}/${encodeURIComponent(name)}`,
  )

  if (version !== undefined) {
    url.searchParams.set('v', String(version))
  }

  return url.toString()
}

export const buildNameAvatarUrl = (name: string, version?: number): string =>
  buildNameImageUrl({ kind: 'avatar', name, version })

export const buildNameHeaderUrl = (name: string, version?: number): string =>
  buildNameImageUrl({ kind: 'header', name, version })
