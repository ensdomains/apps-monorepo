import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import type { ProfileRecords } from '@/features/profile/types'
import {
  ProfileCard,
  profileCardCopyIconClassName,
  profileCardTrailingIconStrokeWidth,
  valueClassName,
} from './ProfileCard'

export const ProfileContentHashSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const contentHash = records.contentHash
  if (!contentHash?.trim() || contentHash.trim() === '0x') return null

  return (
    <ProfileCard title={<Trans>Content hash</Trans>}>
      <Card
        asChild
        className="h-auto w-full min-w-0 flex-row items-center justify-between gap-4 whitespace-normal rounded-[14px] p-4 text-left transition hover:bg-ens-quartz-50 has-[>svg]:px-4 lg:landscape:rounded-xl lg:landscape:p-6 lg:landscape:has-[>svg]:px-6"
      >
        <CopyableButton
          iconClassName={profileCardCopyIconClassName}
          iconStrokeWidth={profileCardTrailingIconStrokeWidth}
          value={contentHash}
          variant="ghost"
        >
          <span
            className={`${valueClassName} min-w-0 [overflow-wrap:anywhere]`}
          >
            {contentHash}
          </span>
        </CopyableButton>
      </Card>
    </ProfileCard>
  )
}
