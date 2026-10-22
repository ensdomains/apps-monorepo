import type { EnsNetwork } from '@ens-apps/config'
import { NOTICE_BANNER_FLAG } from '@ens-apps/utils/posthog/notice-banner'

export const POSTHOG_FEATURE_FLAGS = {
  I18N: 'i18n',
  MIGRATION: 'migration',
  MIGRATION_NFT: 'migration-nft',
  NOTICE_BANNER: NOTICE_BANNER_FLAG,
} as const

export const isMigrationNftEnabled = (params: {
  readonly network: EnsNetwork
  readonly migrationEnabled: boolean | null | undefined
  readonly migrationNftEnabled: boolean | null | undefined
}): boolean =>
  params.network === 'mainnet' &&
  params.migrationEnabled === true &&
  params.migrationNftEnabled === true
