import { useLingui } from '@lingui/react/macro'
import { useRef, useState } from 'react'
import type { Address } from 'viem'
import type { ResolverCopySource } from '@/features/profile/service/resolverImport'
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
  readonly resolverCopySource?: ResolverCopySource
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
  resolverCopySource,
}: ProfileActionsProps) => {
  const { t } = useLingui()
  const [bar, setBar] = useState<HTMLElement | null>(null)
  useIntercomClearance(bar)
  // Keep an opened draft mounted across background capability/expiry refreshes.
  // Actions and publishing are paused when fresh permission data is unavailable.
  const hasEditor = useRef(false)
  if (canEdit || resolverCopySource) hasEditor.current = true
  const hasFloatingBar = hasEditor.current
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
        canEdit={canEdit}
        className={profileButtonClassName}
        isInGrace={isInGrace}
        isUpgradeRequired={isUpgradeRequired}
        keepMounted
        leftActions={barActions}
        name={name}
        onUpdated={onUpdated}
        owner={owner}
        protocol={renewalProtocol}
        records={records}
        resolverCopySource={resolverCopySource}
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
