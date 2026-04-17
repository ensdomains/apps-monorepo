import { Link, useNavigate } from '@tanstack/react-router'
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  IdCardIcon,
  WalletIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EntityVariant = 'name' | 'address' | 'contract' | 'tx'

const variantClass: Record<EntityVariant, string> = {
  name: 'bg-accent-fill dark:bg-entity-bg text-accent-text',
  address: 'bg-success-fill dark:bg-entity-bg text-success-text',
  contract: 'bg-danger-fill dark:bg-entity-bg text-danger-text',
  tx: 'bg-warning-fill dark:bg-entity-bg text-warning-text',
}

export const hoverBgClass: Record<EntityVariant, string> = {
  name: 'hover:bg-accent-fill dark:hover:bg-accent-fill/40',
  address: 'hover:bg-success-fill dark:hover:bg-success-fill/40',
  contract: 'hover:bg-danger-fill dark:hover:bg-danger-fill/40',
  tx: 'hover:bg-warning-fill dark:hover:bg-warning-fill/40',
}

const pillClass = (variant: EntityVariant, className?: string) =>
  cn(
    'inline-flex items-center h-5 px-1 rounded w-fit',
    'border-[0.5px] border-entity-border',
    'font-mono text-sm font-medium tracking-tight whitespace-nowrap no-underline',
    variantClass[variant],
    className,
  )

const chipClass =
  'h-6 px-2 gap-1 text-[11px] font-normal cursor-pointer no-underline'

const CopyChip = ({
  value,
  label = 'Copy',
}: {
  value: string
  label?: string
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(value)
    setCopied(true)
  }

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [copied])

  return (
    <Button
      variant="outline"
      size="sm"
      className={chipClass}
      onClick={handleCopy}
    >
      {copied ? (
        <CheckIcon className="size-3.25" />
      ) : (
        <CopyIcon className="size-3.25" />
      )}
      {label}
    </Button>
  )
}

export const EntityBadge = ({
  children,
  variant,
  className,
  externalHref,
}: {
  children: ReactNode
  variant: EntityVariant
  className?: string
  /** External link — opens in new tab */
  externalHref?: string
}) => {
  if (externalHref) {
    return (
      <ExternalLink
        href={externalHref}
        className={pillClass(variant, className)}
      >
        {children}
      </ExternalLink>
    )
  }

  return <span className={pillClass(variant, className)}>{children}</span>
}

interface EntityBadgeWithActionsProps {
  readonly children: ReactNode
  readonly variant: EntityVariant
  readonly className?: string
  /** ENS name — enables Name chip (→ /$name) + Copy chip */
  readonly name?: string
  /** Owner ENS name — enables Owner chip (→ /$ownerName) */
  readonly ownerName?: string
  /** Owner address — enables Owner chip (→ /addr/$ownerAddress) when ownerName is absent */
  readonly ownerAddress?: string
  /** Address — enables Address chip (→ /addr/$address) */
  readonly address?: string
  /** Block explorer URL — enables Etherscan chip */
  readonly etherscanHref?: string
  /** Value to copy. Defaults: name → name, address/contract → address */
  readonly copyValue?: string
}

export const EntityBadgeWithActions = ({
  children,
  variant,
  className,
  name,
  ownerName,
  ownerAddress,
  address,
  etherscanHref,
  copyValue,
}: EntityBadgeWithActionsProps) => {
  const navigate = useNavigate()
  const derivedCopyValue =
    copyValue ?? (variant === 'name' ? name : address) ?? ''

  const hasChips =
    name !== undefined ||
    ownerName !== undefined ||
    ownerAddress !== undefined ||
    address !== undefined ||
    etherscanHref !== undefined ||
    derivedCopyValue !== ''

  if (!hasChips) {
    return (
      <EntityBadge variant={variant} className={className}>
        {children}
      </EntityBadge>
    )
  }

  const handleWrapperClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (variant === 'name' && name) {
      navigate({ to: '/$name', params: { name } })
    } else if (variant === 'address' && address) {
      navigate({ to: '/addr/$addr', params: { addr: address } })
    } else if (variant === 'contract' && etherscanHref) {
      window.open(etherscanHref, '_blank', 'noopener,noreferrer')
    } else if (variant === 'tx' && etherscanHref) {
      window.open(etherscanHref, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <button
      type="button"
      className={cn(
        'relative group/entity inline-flex rounded transition-colors cursor-pointer px-1.5 py-1',
        hoverBgClass[variant],
      )}
      onClick={handleWrapperClick}
    >
      {/*
        Chips float above the badge.
        pb-2 creates an invisible 8px bridge at the bottom of this container,
        so hovering from badge upward to chips doesn't break the hover state.
      */}
      <div className="absolute bottom-full left-0 pb-2 hidden group-hover/entity:flex flex-row gap-1 z-50">
        {/* Name chip */}
        {variant === 'name' && name && (
          <Button variant="outline" size="sm" className={chipClass} asChild>
            <Link
              to="/$name"
              params={{ name }}
              onClick={(e) => e.stopPropagation()}
            >
              <IdCardIcon className="size-3.25" />
              Name
            </Link>
          </Button>
        )}

        {/* Owner chip — prefer ENS name, fall back to address */}
        {variant === 'name' && ownerName && (
          <Button variant="outline" size="sm" className={chipClass} asChild>
            <Link
              to="/$name"
              params={{ name: ownerName }}
              onClick={(e) => e.stopPropagation()}
            >
              <WalletIcon className="size-3.25" />
              Owner
            </Link>
          </Button>
        )}
        {variant === 'name' && !ownerName && ownerAddress && (
          <Button variant="outline" size="sm" className={chipClass} asChild>
            <Link
              to="/addr/$addr"
              params={{ addr: ownerAddress }}
              onClick={(e) => e.stopPropagation()}
            >
              <WalletIcon className="size-3.25" />
              Owner
            </Link>
          </Button>
        )}

        {/* Address chip */}
        {variant === 'address' && address && (
          <Button variant="outline" size="sm" className={chipClass} asChild>
            <Link
              to="/addr/$addr"
              params={{ addr: address }}
              onClick={(e) => e.stopPropagation()}
            >
              <WalletIcon className="size-3.25" />
              Address
            </Link>
          </Button>
        )}

        {/* Copy chip */}
        {derivedCopyValue && <CopyChip value={derivedCopyValue} />}

        {/* Etherscan chip */}
        {etherscanHref && (
          <Button variant="outline" size="sm" className={chipClass} asChild>
            <ExternalLink
              href={etherscanHref}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <ExternalLinkIcon className="size-3.25" />
              Etherscan
            </ExternalLink>
          </Button>
        )}
      </div>

      <EntityBadge variant={variant} className={className}>
        {children}
      </EntityBadge>
    </button>
  )
}
