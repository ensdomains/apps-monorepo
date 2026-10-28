import type { EnsNetwork } from '@ens-apps/config'
import { NOTICE_BANNER_FLAG } from '@ens-apps/utils/posthog/noticeBanner'

export const POSTHOG_FEATURE_FLAGS = {
  I18N: 'i18n',
  MIGRATION_NFT: 'migration-nft',
  MIGRATION_SUBNAME_RECREATION: 'migration-subname-recreation',
  NOTICE_BANNER: NOTICE_BANNER_FLAG,
} as const

/** On for every mainnet owner; elsewhere only for wallets the flag targets (QA). */
export const isMigrationNftEnabled = (params: {
  readonly network: EnsNetwork
  readonly migrationNftEnabled: boolean | null | undefined
}): boolean =>
  params.network === 'mainnet' || params.migrationNftEnabled === true
