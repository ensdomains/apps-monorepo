import { useLingui } from '@lingui/react/macro'
import type { Address } from 'viem'
import type { ProfileRecords } from '@/features/profile/types'
import {
  desktopActionContainerClassName,
  desktopActionContainerStyle,
  editActionClassName,
  editBottomNavClassName,
  editBottomNavContentClassName,
  renewActionClassName,
} from './ProfileViewNewAction.styles'
import { ProfileViewNewEditAction } from './ProfileViewNewEditAction'
import { ProfileViewNewFavoriteAction } from './ProfileViewNewFavoriteAction'
import { ProfileViewNewRenewAction } from './ProfileViewNewRenewAction'
import { ProfileViewNewShareAction } from './ProfileViewNewShareAction'

type ProfileViewNewActionsProps = {
  readonly avatarUrl?: string
  readonly isInGrace: boolean
  readonly isOwner?: boolean
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly records: ProfileRecords
  readonly url: string
}

export const ProfileViewNewActions = ({
  avatarUrl,
  isInGrace,
  isOwner,
  name,
  onUpdated,
  owner,
  records,
  url,
}: ProfileViewNewActionsProps) => {
  const { t } = useLingui()

  return (
    <>
      <div className="absolute inset-x-0 top-118.5 z-30 lg:landscape:hidden">
        <div className="mx-auto flex w-full max-w-97.5 items-center justify-between px-5">
          <ProfileViewNewRenewAction
            className={renewActionClassName}
            isOwner={isOwner}
            name={name}
          />
          <div className="flex items-center gap-4">
            <ProfileViewNewFavoriteAction name={name} />
            <ProfileViewNewShareAction
              avatarUrl={avatarUrl}
              name={name}
              url={url}
            />
          </div>
        </div>
      </div>

      <div
        className={desktopActionContainerClassName}
        style={desktopActionContainerStyle}
      >
        <div className="flex items-center gap-6">
          <ProfileViewNewFavoriteAction name={name} />
          <ProfileViewNewShareAction
            avatarUrl={avatarUrl}
            name={name}
            url={url}
          />
        </div>
        <ProfileViewNewRenewAction
          className={renewActionClassName}
          isOwner={isOwner}
          name={name}
        />
      </div>

      {isOwner && !isInGrace ? (
        <nav aria-label={t`Profile actions`} className={editBottomNavClassName}>
          <div className={editBottomNavContentClassName}>
            <ProfileViewNewEditAction
              className={editActionClassName}
              isInGrace={isInGrace}
              isOwner={isOwner}
              name={name}
              onUpdated={onUpdated}
              owner={owner}
              records={records}
            />
          </div>
        </nav>
      ) : null}
    </>
  )
}
