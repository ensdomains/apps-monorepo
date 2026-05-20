import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Heart, History } from 'lucide-react'
import { motion } from 'motion/react'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  EligibleForUpgradePill,
  Ensv1OnlyPill,
  ExpiringPill,
  type NameRole,
  RolePill,
} from './DashboardPills'

export type NameStatus = 'eligibleUpgrade' | 'ensv1Only'
export type NameRowCta = 'renew' | 'manageExplorer'

interface NameRowProps {
  readonly label: string
  readonly avatarUrl?: string
  readonly nameVariant?: 'primary' | 'secondary'
  readonly verified?: boolean
  readonly nameRole?: NameRole | null
  readonly status?: NameStatus | null
  readonly expiringInDays?: number | null
  readonly expiryLabel?: string | null
  readonly cta?: NameRowCta | null
  readonly isFavorite?: boolean
  readonly showFavoriteButton?: boolean
  readonly onToggleFavorite?: () => void
  readonly isAuthenticated?: boolean
  readonly linkToMigration?: boolean
}

const explorerUrl = (label: string) => `https://app.ens.domains/${label}`

const NamePill = ({
  label,
  variant,
  linkToMigration,
}: {
  readonly label: string
  readonly variant: 'primary' | 'secondary'
  readonly linkToMigration: boolean
}) => {
  const className = cn(
    'inline-flex max-w-full items-center gap-2 rounded-[2px] px-2 py-1',
    variant === 'primary'
      ? 'bg-ens-lapis-core text-[#e5f7ff]'
      : 'bg-ens-quartz-200 text-[#454444]',
  )
  const textClassName =
    'min-w-0 break-all font-medium font-semi-mono text-[16px] leading-none tracking-[-0.32px] [text-wrap:pretty]'

  const inner = (
    <>
      <span className={textClassName}>{label}</span>
      <ArrowRight className="size-5 shrink-0" strokeWidth={2} />
    </>
  )

  return linkToMigration ? (
    <Link className={className} to="/migration">
      {inner}
    </Link>
  ) : (
    <Link className={className} params={{ name: label }} to="/$name">
      {inner}
    </Link>
  )
}

const VerifiedCheck = () => (
  <span className="flex size-[14px] shrink-0 items-center justify-center rounded-[4px] bg-ens-lapis-500">
    <Check className="size-[9px] text-white" strokeWidth={4} />
  </span>
)

const RowCta = ({
  cta,
  label,
}: {
  readonly cta: NameRowCta
  readonly label: string
}) => {
  const text =
    'flex items-center gap-1.5 font-medium font-semi-mono text-[16px] uppercase leading-none tracking-[-0.16px]'

  if (cta === 'manageExplorer') {
    return (
      <a
        className={cn(text, 'text-ens-garnet-500 hover:opacity-80')}
        href={explorerUrl(label)}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Trans>Manage on explorer</Trans>
        <MSymbol className="ms-opsz-20 text-[20px]" symbol="arrow_outward" />
      </a>
    )
  }

  return (
    <Link
      className={cn(text, 'text-ens-lapis-core hover:opacity-80')}
      params={{ name: label }}
      to="/$name"
    >
      <Trans>Renew name</Trans>
      <MSymbol className="ms-opsz-20 text-[20px]" symbol="double_arrow" />
    </Link>
  )
}

export const NameRow = ({
  label,
  avatarUrl,
  nameVariant = 'secondary',
  verified = false,
  nameRole = null,
  status = null,
  expiringInDays = null,
  expiryLabel = null,
  cta = null,
  isFavorite = false,
  showFavoriteButton = false,
  onToggleFavorite,
  isAuthenticated = true,
  linkToMigration = false,
}: NameRowProps) => {
  const { t } = useLingui()

  const heartButton = showFavoriteButton ? (
    <motion.button
      aria-label={isFavorite ? t`Remove favorite` : t`Add favorite`}
      aria-pressed={isFavorite}
      className="flex shrink-0 items-center justify-center disabled:cursor-not-allowed"
      disabled={!isAuthenticated}
      onClick={isAuthenticated ? onToggleFavorite : undefined}
      transition={{ duration: 0.1 }}
      type="button"
      whileTap={isAuthenticated ? { scale: 0.8 } : undefined}
    >
      <Heart
        className={cn(
          'size-[26px]',
          isFavorite ? 'fill-ens-magenta text-ens-magenta' : 'text-[#d3d3d3]',
          !isAuthenticated && 'opacity-50',
        )}
        strokeWidth={2}
      />
    </motion.button>
  ) : null

  const hasTopRow = Boolean(status || nameRole || expiringInDays)

  return (
    <div className="flex w-full flex-col gap-4 md:gap-6">
      {hasTopRow && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {status === 'eligibleUpgrade' && <EligibleForUpgradePill />}
            {status === 'ensv1Only' && <Ensv1OnlyPill />}
            {nameRole && <RolePill role={nameRole} />}
          </div>
          {expiringInDays !== null && expiringInDays > 0 && (
            <ExpiringPill days={expiringInDays} />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          {showFavoriteButton &&
            (isAuthenticated ? (
              heartButton
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>{heartButton}</TooltipTrigger>
                <TooltipContent>
                  <Trans>Login to favorite</Trans>
                </TooltipContent>
              </Tooltip>
            ))}
          <div className="relative size-[40px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6]">
            <ImageFallback.Root className="contents">
              <ImageFallback.Image
                alt={t`${label} avatar`}
                className="size-full object-cover"
                src={avatarUrl}
              />
              <ImageFallback.Fallback>
                <PatternAvatar
                  className="size-full rounded-full border-none bg-transparent p-0 shadow-none"
                  name={label}
                />
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
          <NamePill
            label={label}
            linkToMigration={linkToMigration}
            variant={nameVariant}
          />
          {verified && <VerifiedCheck />}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t`More options for ${label}`}
              className="flex shrink-0 items-center justify-center text-ens-quartz-400 outline-none hover:text-foreground"
              type="button"
            >
              <MSymbol className="ms-opsz-20 text-[20px]" symbol="more_horiz" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link params={{ name: label }} to="/$name">
                <Trans>View profile</Trans>
              </Link>
            </DropdownMenuItem>
            {cta === 'renew' && (
              <DropdownMenuItem asChild>
                <Link params={{ name: label }} to="/$name">
                  <Trans>Renew name</Trans>
                </Link>
              </DropdownMenuItem>
            )}
            {cta === 'manageExplorer' && (
              <DropdownMenuItem asChild>
                <a
                  href={explorerUrl(label)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Trans>Manage on explorer</Trans>
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(expiryLabel || cta) && (
        <div className="flex items-center justify-between gap-3">
          {expiryLabel ? (
            <div className="flex items-center gap-2">
              <History className="size-4 shrink-0 text-[#9b9ba7]" />
              <span className="font-sans text-[#7d7d7d] text-[14px]">
                <Trans>Expires on</Trans>
              </span>
              <span className="font-sans text-[#515151] text-[14px]">
                {expiryLabel}
              </span>
            </div>
          ) : (
            <span />
          )}
          {cta && <RowCta cta={cta} label={label} />}
        </div>
      )}
    </div>
  )
}
