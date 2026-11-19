import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { useConnection } from 'wagmi'
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
  getFavoriteActionDisabled,
  getProfileFavoriteIntent,
} from '@/features/profile/components/common/favoriteAction.helpers'
import { cn } from '@/lib/utils'
import { useConnectModal } from '@/lib/wallet'
import { backendAuthStore, isBackendAuthed } from '@/utils/backend-client'
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
  const { isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()
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

  const toggleFavorite = () => {
    const intent = getProfileFavoriteIntent({
      isAuthed,
      isConnected,
      isFavorite,
      isPending,
      name,
    })

    switch (intent.kind) {
      case 'addFavorite':
        addMutation.mutate({ name: intent.name })
        return
      case 'removeFavorite':
        removeMutation.mutate({ name: intent.name })
        return
      case 'connectWallet':
        openConnectModal?.()
        return
      case 'signIn':
        backendAuthStore.trigger.resetModal()
        return
      case 'none':
        return
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-disabled={isDisabled}
          aria-label={
            isFavorite ? _(msg`Remove favorite`) : _(msg`Add favorite`)
          }
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
      </TooltipTrigger>
      <TooltipContent className={actionTooltipClassName}>
        {isFavorite ? _(msg`Remove from favorites`) : _(msg`Add to favorites`)}
      </TooltipContent>
    </Tooltip>
  )
}
