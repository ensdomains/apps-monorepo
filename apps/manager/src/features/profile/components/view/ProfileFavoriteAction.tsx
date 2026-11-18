import { useMediaQuery } from '@ens-apps/utils/useMediaQuery'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { addFavoriteMutationOptions } from '@/features/dashboard/service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '@/features/dashboard/service/mutations/removeFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import {
  favoriteAuthPromptMessage,
  getFavoriteActionDisabled,
  getFavoriteActionIntent,
} from '@/features/profile/components/common/favoriteAction.helpers'
import { cn } from '@/lib/utils'
import { isBackendAuthed } from '@/utils/backend-client'
import {
  actionTooltipClassName,
  favoriteActionClassName,
  favoritedActionClassName,
  iconActionClassName,
  iconActionIconInnerClassName,
  iconActionSymbolClassName,
} from './ProfileAction.styles'

export const ProfileFavoriteAction = ({ name }: { readonly name: string }) => {
  const { _ } = useLingui()
  const isAuthed = useAtom(isBackendAuthed)
  const shouldPromptAuth = useMediaQuery('(max-width: 767px)')
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
  const isDisabled = getFavoriteActionDisabled({ isPending })
  const authPrompt = _(favoriteAuthPromptMessage)

  const toggleFavorite = () => {
    const intent = getFavoriteActionIntent({
      isAuthed,
      isFavorite,
      isPending,
      name,
      shouldPromptAuth,
    })

    switch (intent.kind) {
      case 'addFavorite':
        addMutation.mutate({ name: intent.name })
        return
      case 'removeFavorite':
        removeMutation.mutate({ name: intent.name })
        return
      case 'promptAuth':
        toast(authPrompt, { id: 'favorite-auth-prompt' })
        return
      case 'none':
        return
    }
  }

  const button = (
    <button
      aria-disabled={isDisabled}
      aria-label={isFavorite ? _(msg`Remove favorite`) : _(msg`Add favorite`)}
      className={cn(
        iconActionClassName,
        isFavorite ? favoritedActionClassName : favoriteActionClassName,
      )}
      disabled={isDisabled}
      onClick={toggleFavorite}
      type="button"
    >
      <span className={iconActionIconInnerClassName}>
        <MSymbol
          className={cn(
            iconActionSymbolClassName,
            isFavorite ? 'ms-fill' : undefined,
          )}
          symbol="favorite"
        />
      </span>
    </button>
  )

  const tooltip = match({ isAuthed, isFavorite })
    .with({ isAuthed: false }, () => authPrompt)
    .with({ isFavorite: true }, () => _(msg`Remove from favorites`))
    .otherwise(() => _(msg`Add to favorites`))

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className={actionTooltipClassName}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
