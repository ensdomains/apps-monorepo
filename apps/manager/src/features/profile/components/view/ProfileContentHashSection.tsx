import { Trans } from '@lingui/react/macro'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card } from '@/components/ui/card'
import { MSymbol } from '@/components/ui/material-symbol'
import { chain } from '@/config'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import {
  ProfileCard,
  profileCardArrowClassName,
  profileCardCopyIconClassName,
  profileFieldValueClassName,
  profileTileClassName,
} from './ProfileCard'
import { getContentHashHref } from './ProfileView.helpers'

const cardClassName = cn(
  profileTileClassName,
  'h-auto w-full min-w-0 flex-row items-center justify-between gap-4 p-6 text-left transition hover:bg-ens-quartz-50',
)

export const ProfileContentHashSection = ({
  name,
  records,
}: {
  readonly name: string
  readonly records: ProfileRecords
}) => {
  const contentHash = records.contentHash?.trim()
  if (!contentHash || contentHash === '0x') return null

  const href = getContentHashHref({ name, contentHash, chainId: chain.id })
  const value = (
    <span className={cn(profileFieldValueClassName, 'min-w-0 truncate')}>
      {contentHash}
    </span>
  )

  return (
    <ProfileCard title={<Trans>Content hash</Trans>}>
      {href ? (
        <Card asChild className={cardClassName}>
          <a
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            title={contentHash}
          >
            {value}
            <MSymbol
              aria-hidden="true"
              className={profileCardArrowClassName}
              symbol="arrow_outward"
            />
          </a>
        </Card>
      ) : (
        <Card asChild className={cardClassName}>
          <CopyableButton
            iconClassName={profileCardCopyIconClassName}
            value={contentHash}
            variant="ghost"
          >
            {value}
          </CopyableButton>
        </Card>
      )}
    </ProfileCard>
  )
}
