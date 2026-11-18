import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import type { Address } from 'viem'
import type { ResolverCopySource } from '@/features/profile/service/resolverImport'
import type { ProfileRecords } from '@/features/profile/types'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { useIntercomClearance } from '@/hooks/useIntercomClearance'
import { cn } from '@/lib/utils'
import {
  barEditActionClassName,
  editActionClassName,
  editBottomBarContentClassName,
  editBottomNavClassName,
  editBottomNavContentClassName,
  headerActionClusterClassName,
  profileBarActionsClassName,
  profileStickyBarClassName,
  renewActionClassName,
} from './ProfileAction.styles'
import { ProfileEditAction } from './ProfileEditAction'
import { ProfileExploreAction } from './ProfileExploreAction'
import { ProfileFavoriteAction } from './ProfileFavoriteAction'
import { ProfileRenewAction } from './ProfileRenewAction'
import { ProfileShareAction } from './ProfileShareAction'

type ProfileDesktopActionsProps = {
  readonly avatarUrl?: string
  readonly isOwner?: boolean
  readonly name: string
  readonly renewalProtocol?: RenewalProtocol
  readonly url: string
}

type ProfileActionsProps = ProfileDesktopActionsProps & {
  readonly canEdit: boolean
  /** Owners keep the actions in the bottom bar at every width, even when they can't edit; visitors have them in the header. */
  readonly hasDesktopBar: boolean
  /** Latched by the view, so it also decides where the desktop actions go. */
  readonly hasFloatingBar: boolean
  readonly isInGrace: boolean
  readonly isUpgradeRequired: boolean
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly records: ProfileRecords
  readonly resolverCopySource?: ResolverCopySource
}

export const ProfileDesktopActions = ({
  avatarUrl,
  isOwner,
  name,
  renewalProtocol,
  url,
}: ProfileDesktopActionsProps) => (
  <div className={headerActionClusterClassName}>
    <ProfileFavoriteAction name={name} />
    <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
    <ProfileExploreAction isOwner={isOwner} target={{ kind: 'name', name }} />
    <ProfileRenewAction
      className={renewActionClassName}
      isOwner={isOwner}
      name={name}
      protocol={renewalProtocol}
    />
  </div>
)

export const ProfileActions = ({
  avatarUrl,
  canEdit,
  hasDesktopBar,
  hasFloatingBar,
  isInGrace,
  isOwner,
  isUpgradeRequired,
  name,
  onUpdated,
  owner,
  records,
  renewalProtocol,
  url,
  resolverCopySource,
}: ProfileActionsProps) => {
  const { t } = useLingui()
  const [bar, setBar] = useState<HTMLElement | null>(null)
  useIntercomClearance(bar)
  const hasBottomNav = isUpgradeRequired && !isInGrace

  const renderBarActions = () => (
    <>
      <ProfileFavoriteAction name={name} />
      <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
      <ProfileExploreAction isOwner={isOwner} target={{ kind: 'name', name }} />
      <ProfileRenewAction
        className={renewActionClassName}
        isOwner={isOwner}
        name={name}
        protocol={renewalProtocol}
      />
    </>
  )

  if (hasFloatingBar) {
    return (
      <ProfileEditAction
        canEdit={canEdit}
        className={barEditActionClassName}
        isInGrace={isInGrace}
        isUpgradeRequired={isUpgradeRequired}
        keepMounted
        // Owned profiles keep favorite, share, and renew in this bar at every width.
        leftActions={renderBarActions()}
        name={name}
        onUpdated={onUpdated}
        owner={owner}
        protocol={renewalProtocol}
        records={records}
        resolverCopySource={resolverCopySource}
      />
    )
  }

  // Visitors' actions sit in the profile header at every width, so they get no bar
  if (!hasBottomNav && !hasDesktopBar) return null

  return (
    <>
      {hasBottomNav ? (
        <nav
          aria-label={t`Profile actions`}
          className={editBottomNavClassName}
          ref={setBar}
        >
          <div className={editBottomNavContentClassName}>
            <div
              className={cn(
                profileBarActionsClassName,
                'w-full',
                hasDesktopBar ? 'xl:mr-auto xl:w-auto' : 'xl:hidden',
              )}
            >
              {renderBarActions()}
            </div>
            <ProfileEditAction
              canEdit={canEdit}
              className={editActionClassName}
              isInGrace={isInGrace}
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
          className={cn(profileStickyBarClassName, 'xl:block')}
          ref={setBar}
        >
          <div className={cn(editBottomBarContentClassName, 'justify-center')}>
            <div className={profileBarActionsClassName}>
              {renderBarActions()}
            </div>
          </div>
        </nav>
      )}
    </>
  )
}
