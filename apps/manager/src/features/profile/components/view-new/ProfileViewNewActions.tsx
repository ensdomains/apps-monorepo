import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import type { Address } from 'viem'
import { LinkButton } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { addFavoriteMutationOptions } from '@/features/dashboard/service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '@/features/dashboard/service/mutations/removeFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import { EditProfileDialog } from '@/features/profile/components/dialogs/edit-profile/EditProfileDialog'
import { ShareProfileDialog } from '@/features/profile/components/dialogs/ShareProfileDialog'
import {
  profileExpiryDateFromSeconds,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import type { ProfileRecords } from '@/features/profile/types'
import { canRenewV2Name } from '@/features/renew/utils/renewableName'
import { cn } from '@/lib/utils'
import { isBackendAuthed } from '@/utils/backend-client'

type ProfileViewNewActionsProps = {
  readonly avatarUrl?: string
  readonly isInGrace: boolean
  readonly isOwner: boolean
  readonly name: string
  readonly onUpdated: () => undefined | Promise<unknown>
  readonly owner?: Address
  readonly profileEditNewEnabled: boolean
  readonly records: ProfileRecords
  readonly url: string
}

const iconActionClassName =
  'flex size-13.5 shrink-0 items-center justify-center rounded bg-white text-ens-quartz-700 shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50 disabled:cursor-not-allowed disabled:opacity-50'

const renewActionClassName =
  'h-13.5 min-w-34 gap-1 rounded border-none bg-white px-3 py-0 font-semi-mono text-xs text-ens-quartz-900 uppercase tracking-[0.96px] shadow-[0_2px_6px_rgba(0,0,0,0.06)] hover:bg-ens-quartz-50 md:w-33 md:min-w-33'

const editActionClassName =
  'h-[61px] w-full rounded border border-ens-quartz-900 bg-white px-6 py-0 font-semi-mono text-sm text-ens-quartz-900 uppercase tracking-[1.12px] shadow-none hover:bg-ens-quartz-50 md:h-12.5 md:w-[171px] md:border-none md:bg-(--theme-bg) md:text-(--theme-color) md:hover:bg-(--theme-hover-bg)'

const ProfileShareAction = ({
  avatarUrl,
  name,
  url,
}: {
  readonly avatarUrl?: string
  readonly name: string
  readonly url: string
}) => {
  const { t } = useLingui()

  return (
    <ShareProfileDialog
      avatarUrl={avatarUrl}
      name={name}
      trigger={
        <button
          aria-label={t`Share profile`}
          className={iconActionClassName}
          type="button"
        >
          <MSymbol
            className="ms-opsz-32 ms-wght-200 text-[32px]"
            symbol="ios_share"
          />
        </button>
      }
      url={url}
    />
  )
}

const ProfileFavoriteAction = ({ name }: { readonly name: string }) => {
  const { t } = useLingui()
  const isAuthed = useAtom(isBackendAuthed)
  const { data: favorites = [] } = useQuery({
    ...favoritesQueryOptions,
    enabled: isAuthed,
  })
  const addMutation = useMutation(addFavoriteMutationOptions)
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const isFavorite = favorites.some(
    (entry) => entry.name.toLowerCase() === name.toLowerCase(),
  )
  const isPending = addMutation.isPending || removeMutation.isPending

  const toggleFavorite = () => {
    if (!isAuthed || isPending) return

    if (isFavorite) {
      removeMutation.mutate({ name })
      return
    }

    addMutation.mutate({ name })
  }

  const button = (
    <button
      aria-label={isFavorite ? t`Remove favorite` : t`Add favorite`}
      className={iconActionClassName}
      disabled={!isAuthed || isPending}
      onClick={toggleFavorite}
      type="button"
    >
      <MSymbol
        className={cn(
          'ms-opsz-32 text-[32px]',
          isFavorite ? 'ms-fill ms-wght-300' : 'ms-wght-200',
        )}
        symbol="favorite"
      />
    </button>
  )

  if (isAuthed) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>
        <Trans>Login to favorite</Trans>
      </TooltipContent>
    </Tooltip>
  )
}

const ProfileEditAction = ({
  isInGrace,
  isOwner,
  name,
  onUpdated,
  owner,
  profileEditNewEnabled,
  records,
  className,
}: Pick<
  ProfileViewNewActionsProps,
  | 'isInGrace'
  | 'isOwner'
  | 'name'
  | 'onUpdated'
  | 'owner'
  | 'profileEditNewEnabled'
  | 'records'
> & {
  readonly className: string
}) => {
  if (!isOwner || isInGrace) return null

  const trigger = (
    <button className={className} type="button">
      <Trans>Edit Profile</Trans>
    </button>
  )

  if (profileEditNewEnabled) {
    return (
      <EditProfileDialog
        name={name}
        onUpdated={onUpdated}
        owner={owner}
        records={records}
        trigger={trigger}
      />
    )
  }

  return (
    <LinkButton className={className} params={{ name }} to="/p/$name/edit">
      <Trans>Edit Profile</Trans>
    </LinkButton>
  )
}

const ProfileRenewAction = ({
  className,
  name,
}: {
  readonly className: string
  readonly name: string
}) => {
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(name),
  })
  const expiryDate = profileExpiryDateFromSeconds(expiryData?.expiry)

  if (!canRenewV2Name(name, expiryDate)) return null

  return (
    <LinkButton className={className} params={{ name }} to="/renew/$name">
      <Trans>Renew Name</Trans>
      <MSymbol
        className="ms-opsz-20 ms-wght-700 text-base"
        symbol="double_arrow"
      />
    </LinkButton>
  )
}

export const ProfileViewNewActions = ({
  avatarUrl,
  isInGrace,
  isOwner,
  name,
  onUpdated,
  owner,
  profileEditNewEnabled,
  records,
  url,
}: ProfileViewNewActionsProps) => (
  <>
    <div className="absolute inset-x-0 top-[474px] z-30 md:hidden">
      <div className="mx-auto flex w-full max-w-[390px] items-center justify-between px-5">
        <ProfileRenewAction className={renewActionClassName} name={name} />
        <div className="flex items-center gap-4">
          <ProfileFavoriteAction name={name} />
          <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
        </div>
      </div>
    </div>

    <div className="absolute top-[316px] right-8 z-30 hidden w-33 flex-col gap-6 md:flex">
      <div className="flex items-center gap-6">
        <ProfileFavoriteAction name={name} />
        <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
      </div>
      <ProfileRenewAction className={renewActionClassName} name={name} />
    </div>

    {isOwner && !isInGrace ? (
      <div className="fixed right-0 bottom-0 left-0 z-40 h-[117px] bg-white px-6 pt-3 shadow-[0_-3px_2px_rgba(220,220,220,0.25)] md:right-8 md:bottom-4 md:left-auto md:h-auto md:bg-transparent md:p-0 md:shadow-none">
        <ProfileEditAction
          className={editActionClassName}
          isInGrace={isInGrace}
          isOwner={isOwner}
          name={name}
          onUpdated={onUpdated}
          owner={owner}
          profileEditNewEnabled={profileEditNewEnabled}
          records={records}
        />
      </div>
    ) : null}
  </>
)
