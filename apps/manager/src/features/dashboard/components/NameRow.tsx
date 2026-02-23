import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Heart } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface NameRowProps {
  readonly label: string
  readonly avatarUrl?: string
  readonly isFavorite?: boolean
  readonly onToggleFavorite?: () => void
  readonly isAuthenticated?: boolean
  readonly showFavoriteButton?: boolean
}

export const NameRow = ({
  label,
  avatarUrl,
  isFavorite = false,
  onToggleFavorite,
  isAuthenticated = true,
  showFavoriteButton = false,
}: NameRowProps) => {
  const { t } = useTranslation('dashboard')

  const heartButton = showFavoriteButton ? (
    <motion.button
      className="flex shrink-0 items-center justify-center disabled:cursor-not-allowed"
      disabled={!isAuthenticated}
      onClick={isAuthenticated ? onToggleFavorite : undefined}
      transition={{ duration: 0.1 }}
      type="button"
      whileTap={isAuthenticated ? { scale: 0.8 } : undefined}
    >
      <Heart
        className={`size-[16px] ${isFavorite ? 'fill-[#f53293] text-[#f53293]' : 'text-[#d3d3d3]'} ${isAuthenticated ? '' : 'opacity-50'}`}
        strokeWidth={2}
      />
    </motion.button>
  ) : null

  return (
    <div className="flex w-full items-center gap-3 md:gap-[12px]">
      {showFavoriteButton &&
        (isAuthenticated ? (
          heartButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>{heartButton}</TooltipTrigger>
            <TooltipContent>{t('nameRow.loginToFavorite')}</TooltipContent>
          </Tooltip>
        ))}
      <div className="flex items-center gap-2 md:gap-[12px]">
        <div className="relative size-[32px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6] md:size-[36.9px]">
          <ImageFallback.Root className="contents">
            <ImageFallback.Image
              alt={t('nameRow.avatarAlt', { label })}
              className="size-full object-cover"
              src={avatarUrl}
            />
            <ImageFallback.Fallback>
              <img
                alt={t('nameRow.avatarPlaceholderAlt', { label })}
                className="size-full object-cover"
                src={placeholderAvatar}
              />
            </ImageFallback.Fallback>
          </ImageFallback.Root>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[2.8px] bg-[#e5f7ff] px-2 py-1 md:px-[8px] md:py-[4px]">
          <Link
            className="mr-1 max-w-full break-all font-medium font-mono text-ens-blue text-sm tracking-[-0.28px] [text-wrap:pretty] md:mr-2 md:tracking-[-0.32px]"
            params={{ name: label }}
            to="/p/$name"
          >
            {label}
          </Link>
          <ArrowUpRight
            className="size-2 shrink-0 text-ens-blue md:size-3"
            strokeWidth={2}
          />
        </div>
      </div>
    </div>
  )
}
