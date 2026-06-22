import { useLingui } from '@lingui/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import clsx from 'clsx'
import { Heart } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
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
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { isBackendAuthed } from '@/utils/backend-client'

interface FavoriteButtonProps {
  readonly name: string
}

export const FavoriteButton = ({ name }: FavoriteButtonProps) => {
  const { _ } = useLingui()
  const shouldReduceMotion = useReducedMotion()
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

  const heartButton = (
    <motion.button
      aria-disabled={isDisabled}
      className="flex size-10 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-sm disabled:cursor-not-allowed"
      disabled={isDisabled}
      onClick={toggleFavorite}
      transition={shouldReduceMotion ? undefined : { duration: 0.1 }}
      type="button"
      whileTap={
        isAuthed && !isDisabled && !shouldReduceMotion
          ? { scale: 0.8 }
          : undefined
      }
    >
      <Heart
        className={clsx(
          'size-5',
          isFavorite ? 'fill-[#f53293] text-[#f53293]' : 'text-gray-500',
          !isAuthed && 'opacity-50',
        )}
        strokeWidth={2}
      />
    </motion.button>
  )

  if (isAuthed) {
    return heartButton
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{heartButton}</TooltipTrigger>
      <TooltipContent>{authPrompt}</TooltipContent>
    </Tooltip>
  )
}
