import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { addFavoriteMutationOptions } from '@/features/dashboard/service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '@/features/dashboard/service/mutations/removeFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import { cn } from '@/lib/utils'
import { isBackendAuthed } from '@/utils/backend-client'
import { iconActionClassName } from './ProfileViewNewAction.styles'

export const ProfileViewNewFavoriteAction = ({
  name,
}: {
  readonly name: string
}) => {
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
          'ms-opsz-32 text-[32px] text-ens-magenta',
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
