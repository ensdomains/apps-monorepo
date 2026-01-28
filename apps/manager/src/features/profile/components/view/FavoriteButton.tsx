import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store/react'
import { Heart } from 'lucide-react'
import { motion } from 'motion/react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { addFavoriteMutationOptions } from '@/features/dashboard/service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '@/features/dashboard/service/mutations/removeFavorite'
import { favoritesQueryOptions } from '@/features/dashboard/service/queries/getFavorites'
import { isBackendAuthed } from '@/utils/backend-client'

interface FavoriteButtonProps {
  readonly name: string
}

export const FavoriteButton = ({ name }: FavoriteButtonProps) => {
  const isAuthed = useAtom(isBackendAuthed)

  const { data: favorites = [] } = useQuery(favoritesQueryOptions)
  const addMutation = useMutation(addFavoriteMutationOptions)
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const isFavorite = favorites.some(
    (entry) => entry.name.toLowerCase() === name.toLowerCase(),
  )

  const toggleFavorite = () => {
    if (!isAuthed) return

    if (isFavorite) {
      removeMutation.mutate({ name })
    } else {
      addMutation.mutate({ name })
    }
  }

  const heartButton = (
    <motion.button
      className="flex size-10 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-sm disabled:cursor-not-allowed"
      disabled={!isAuthed}
      onClick={isAuthed ? toggleFavorite : undefined}
      transition={{ duration: 0.1 }}
      type="button"
      whileTap={isAuthed ? { scale: 0.8 } : undefined}
    >
      <Heart
        className={`size-5 ${isFavorite ? 'fill-[#f53293] text-[#f53293]' : 'text-gray-500'} ${isAuthed ? '' : 'opacity-50'}`}
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
      <TooltipContent>Login to favorite</TooltipContent>
    </Tooltip>
  )
}
