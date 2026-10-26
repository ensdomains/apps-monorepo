import { NOTICE_BANNER_FLAG } from '@ens-apps/utils/posthog/noticeBanner'

export const POSTHOG_FEATURE_FLAGS = {
  I18N: 'i18n',
  MIGRATION_SUBNAME_RECREATION: 'migration-subname-recreation',
  NOTICE_BANNER: NOTICE_BANNER_FLAG,
} as const
