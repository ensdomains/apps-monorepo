import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Heart } from 'lucide-react'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'

interface NameRowProps {
  readonly label: string
  readonly avatarUrl?: string
  readonly isFavorite: boolean
  readonly onToggleFavorite: () => void
}

export const NameRow = ({
  label,
  avatarUrl,
  isFavorite,
  onToggleFavorite,
}: NameRowProps) => {
  return (
    <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[12px]">
      <button
        className="flex shrink-0 items-center justify-center"
        onClick={onToggleFavorite}
        type="button"
      >
        <Heart
          className={`size-[16px] ${isFavorite ? 'fill-[#f53293] text-[#f53293]' : 'text-[#d3d3d3]'}`}
          strokeWidth={2}
        />
      </button>
      <div className="flex items-center gap-2 md:gap-[12px]">
        <div className="relative size-[32px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6] md:size-[36.9px]">
          <ImageFallback.Root className="contents">
            <ImageFallback.Image
              alt={`${label} avatar`}
              className="size-full object-cover"
              src={avatarUrl}
            />
            <ImageFallback.Fallback>
              <img
                alt={`${label} avatar placeholder`}
                className="size-full object-cover"
                src={placeholderAvatar}
              />
            </ImageFallback.Fallback>
          </ImageFallback.Root>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[2.8px] bg-[#e5f7ff] px-2 py-1 md:h-[24px] md:px-[8px] md:py-[4px]">
          <Link
            className="mr-1 truncate font-medium font-mono text-[#0080bc] text-[14px] tracking-[-0.28px] md:mr-2 md:text-[16px] md:tracking-[-0.32px]"
            params={{ name: label }}
            to="/p/$name"
          >
            {label}
          </Link>
          <ArrowUpRight
            className="size-[6px] shrink-0 text-[#0080bc] md:size-[7px]"
            strokeWidth={3}
          />
        </div>
      </div>
    </div>
  )
}
