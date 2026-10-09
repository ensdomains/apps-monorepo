import { useLingui } from '@lingui/react/macro'
import type { Address } from 'viem'
import { normalizeEthName } from '@/features/profile/service/profileName'
import type { ProfileRecords } from '@/features/profile/types'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { cn } from '@/lib/utils'
import {
  desktopActionContainerClassName,
  desktopActionContainerStyle,
  editActionClassName,
  editBottomBarContentClassName,
  editBottomNavClassName,
  editBottomNavContentClassName,
  editFloatingActionClassName,
  profileBarActionsClassName,
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
  const canEditProfile =
    isOwner && (renewalProtocol !== 'v1' || normalizeEthName(name) === null)
  const hasFloatingBar = canEditProfile && !isUpgradeRequired && !isInGrace
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
        className={editFloatingActionClassName}
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
      <div
        className={desktopActionContainerClassName}
        style={desktopActionContainerStyle}
      >
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
        <nav aria-label={t`Profile actions`} className={editBottomNavClassName}>
          <div className={editBottomNavContentClassName}>
            <div
              className={cn(
                profileBarActionsClassName,
                'w-full lg:landscape:hidden',
              )}
            >
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
        >
          <div className={cn(editBottomBarContentClassName, 'justify-start')}>
            <div className={profileBarActionsClassName}>{barActions}</div>
          </div>
        </nav>
      )}
    </>
  )
}
