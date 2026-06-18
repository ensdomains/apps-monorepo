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
  'flex size-[54px] shrink-0 items-center justify-center rounded bg-(--theme-bg) text-(--theme-color) shadow-none transition hover:bg-(--theme-hover-bg) disabled:cursor-not-allowed disabled:opacity-50'

const primaryActionClassName =
  'h-[54px] w-auto min-w-[183px] rounded border border-(--theme-color) bg-white px-6 py-0 font-semi-mono text-sm text-(--theme-color) uppercase shadow-none hover:bg-(--theme-bg)'

const secondaryActionClassName =
  'h-[54px] w-auto min-w-[183px] rounded border-none bg-(--theme-bg) px-6 py-0 font-semi-mono text-sm text-(--theme-color) uppercase shadow-none hover:bg-(--theme-hover-bg)'

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
}: Pick<
  ProfileViewNewActionsProps,
  | 'isInGrace'
  | 'isOwner'
  | 'name'
  | 'onUpdated'
  | 'owner'
  | 'profileEditNewEnabled'
  | 'records'
>) => {
  if (!isOwner || isInGrace) return null

  const trigger = (
    <button className={secondaryActionClassName} type="button">
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
    <LinkButton
      className={secondaryActionClassName}
      params={{ name }}
      to="/p/$name/edit"
    >
      <Trans>Edit Profile</Trans>
    </LinkButton>
  )
}

const ProfileExtendAction = ({ name }: { readonly name: string }) => {
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(name),
  })
  const expiryDate = profileExpiryDateFromSeconds(expiryData?.expiry)

  if (!canRenewV2Name(name, expiryDate)) return null

  return (
    <LinkButton
      className={primaryActionClassName}
      params={{ name }}
      to="/renew/$name"
    >
      <MSymbol className="ms-opsz-24 ms-wght-700" symbol="arrow_forward" />
      <Trans>Extend Name</Trans>
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
  <div className="fixed right-0 bottom-0 left-0 z-40 rounded-t-[32px] bg-white px-3 py-3 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
    <div className="mx-auto flex max-w-[905px] items-center justify-center gap-3 overflow-x-auto pb-[env(safe-area-inset-bottom)]">
      <ProfileShareAction avatarUrl={avatarUrl} name={name} url={url} />
      <ProfileFavoriteAction name={name} />
      <ProfileEditAction
        isInGrace={isInGrace}
        isOwner={isOwner}
        name={name}
        onUpdated={onUpdated}
        owner={owner}
        profileEditNewEnabled={profileEditNewEnabled}
        records={records}
      />
      <ProfileExtendAction name={name} />
    </div>
  </div>
)
