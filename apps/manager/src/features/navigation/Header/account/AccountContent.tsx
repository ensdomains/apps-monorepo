import { useFeatureFlagEnabled } from '@posthog/react'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { NotificationsMenuItem } from '../notifications/NotificationsMenuItem'
import { LanguageSection } from './LanguageSection'
import { NavSection } from './NavSection'
import { WalletSection } from './WalletSection'

type AccountContentProps = {
  readonly onAction: () => void
  readonly onChoosePrimaryName: () => void
}

export const AccountContent = ({
  onAction,
  onChoosePrimaryName,
}: AccountContentProps) => {
  const isLanguageSelectorEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.I18N,
    false,
  )

  return (
    <div className="ms-wght-300 space-y-8">
      <div className="flex flex-col gap-0.5">
        <NavSection
          onAction={onAction}
          onChoosePrimaryName={onChoosePrimaryName}
        />
        <NotificationsMenuItem onAction={onAction} />
      </div>
      {isLanguageSelectorEnabled === true ? (
        <LanguageSection onAction={onAction} />
      ) : null}
      <WalletSection onAction={onAction} />
    </div>
  )
}
