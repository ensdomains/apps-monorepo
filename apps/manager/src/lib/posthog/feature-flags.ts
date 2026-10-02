import type { EnsNetwork } from '@ens-apps/config'

export const POSTHOG_FEATURE_FLAGS = {
  I18N: 'i18n',
  MIGRATION: 'migration',
  MIGRATION_NFT: 'migration-nft',
} as const

export const isMigrationNftEnabled = (params: {
  readonly network: EnsNetwork
  readonly migrationEnabled: boolean | null | undefined
  readonly migrationNftEnabled: boolean | null | undefined
}): boolean =>
  params.network === 'mainnet' &&
  params.migrationEnabled === true &&
  params.migrationNftEnabled === true
