import { useFeatureFlagEnabled } from '@posthog/react'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { NotificationsMenuItem } from '../notifications/NotificationsMenuItem'
import { AccountMenuDivider } from './AccountMenuItem'
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
    <div className="ms-wght-300 flex flex-col">
      <NavSection
        onAction={onAction}
        onChoosePrimaryName={onChoosePrimaryName}
      />
      <NotificationsMenuItem onAction={onAction} />
      <AccountMenuDivider />
      {isLanguageSelectorEnabled === true ? (
        <>
          <div className="py-2">
            <LanguageSection onAction={onAction} />
          </div>
          <AccountMenuDivider />
        </>
      ) : null}
      <WalletSection onAction={onAction} />
    </div>
  )
}
