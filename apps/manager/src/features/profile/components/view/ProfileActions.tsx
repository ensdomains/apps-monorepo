import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { useIntercomClearance } from '@/hooks/useIntercomClearance'
import { cn } from '@/lib/utils'
import {
  desktopActionContainerClassName,
  editActionClassName,
  editBottomBarContentClassName,
  editBottomNavClassName,
  editBottomNavContentClassName,
  profileBarActionsClassName,
  profileButtonClassName,
  profileStickyBarClassName,
  renewActionClassName,
  renewBarActionClassName,
} from './ProfileAction.styles'
import { ProfileEditAction } from './ProfileEditAction'
import { ProfileFavoriteAction } from './ProfileFavoriteAction'
import { ProfileRenewAction } from './ProfileRenewAction'
import { ProfileShareAction } from './ProfileShareAction'

type ProfileActionsProps = {
  readonly avatarUrl?: string
  readonly canEdit: boolean
  readonly isInGrace: boolean
  readonly isOwner?: boolean
  readonly isUpgradeRequired: boolean
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly records: ProfileRecords
  readonly renewalProtocol?: RenewalProtocol
  readonly url: string
}

export const ProfileActions = ({
  avatarUrl,
  canEdit,
  isInGrace,
  isOwner,
  isUpgradeRequired,
  name,
  onUpdated,
  owner,
  records,
  renewalProtocol,
  url,
}: ProfileActionsProps) => {
  const { t } = useLingui()
  const [bar, setBar] = useState<HTMLElement | null>(null)
  useIntercomClearance(bar)
  const hasFloatingBar = canEdit
  const hasBottomNav = isUpgradeRequired && !isInGrace

  const barActions = (
    <>
      <ProfileFavoriteAction name={name} />
      <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
      <ProfileRenewAction
        className={renewBarActionClassName}
        isBarAction
        isOwner={isOwner}
        name={name}
        protocol={renewalProtocol}
      />
    </>
  )

  if (hasFloatingBar) {
    return (
      <ProfileEditAction
        className={profileButtonClassName}
        isInGrace={isInGrace}
        isOwner={isOwner}
        leftActions={barActions}
        name={name}
        onUpdated={onUpdated}
        owner={owner}
        protocol={renewalProtocol}
        records={records}
      />
    )
  }

  return (
    <>
      <div className={desktopActionContainerClassName}>
        <div className="flex items-center gap-6">
          <ProfileFavoriteAction name={name} />
          <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
        </div>
        <ProfileRenewAction
          className={renewActionClassName}
          isOwner={isOwner}
          name={name}
          protocol={renewalProtocol}
        />
      </div>

      {hasBottomNav ? (
        <nav
          aria-label={t`Profile actions`}
          className={editBottomNavClassName}
          ref={setBar}
        >
          <div className={editBottomNavContentClassName}>
            <div className={cn(profileBarActionsClassName, 'w-full xl:hidden')}>
              {barActions}
            </div>
            <ProfileEditAction
              className={editActionClassName}
              isInGrace={isInGrace}
              isOwner={isOwner}
              isUpgradeRequired={isUpgradeRequired}
              name={name}
              onUpdated={onUpdated}
              owner={owner}
              protocol={renewalProtocol}
              records={records}
            />
          </div>
        </nav>
      ) : (
        <nav
          aria-label={t`Profile actions`}
          className={profileStickyBarClassName}
          ref={setBar}
        >
          <div className={cn(editBottomBarContentClassName, 'justify-start')}>
            <div className={profileBarActionsClassName}>{barActions}</div>
          </div>
        </nav>
      )}
    </>
  )
}
