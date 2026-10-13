import { envConfig } from '@/config'

const ENS_METADATA_AVATAR_URL = `https://metadata.ens.domains/${envConfig.network}/avatar`

export const getMigrationAvatarUrl = (name: string): string =>
  `${ENS_METADATA_AVATAR_URL}/${encodeURIComponent(name)}`
