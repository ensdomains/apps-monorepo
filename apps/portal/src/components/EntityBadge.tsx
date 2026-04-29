import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useChainId } from 'wagmi'
import {
  ChipCopyIcon,
  ChipLinkIcon,
  ChipNameIcon,
  ChipWalletIcon,
  ResolverIcon,
} from '@/assets/icons'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'
import { cn } from '@/lib/utils'
import { getEnsContractName } from '@/utils/ens/ensContractNames'

export type EntityVariant = 'name' | 'address' | 'contract' | 'tx'

const variantClass: Record<EntityVariant, string> = {
  name: 'bg-accent-fill dark:bg-entity-bg text-accent-text',
  address: 'bg-success-fill dark:bg-entity-bg text-success-text',
  contract: 'bg-danger-fill dark:bg-entity-bg text-danger-text',
  tx: 'bg-warning-fill dark:bg-entity-bg text-warning-text',
}

export const hoverBgClass: Record<EntityVariant, string> = {
  name: 'hover:bg-accent-fill dark:hover:bg-entity-bg',
  address: 'hover:bg-success-fill dark:hover:bg-entity-bg',
  contract: 'hover:bg-danger-fill dark:hover:bg-entity-bg',
  tx: 'hover:bg-warning-fill dark:hover:bg-entity-bg',
}

const pillClass = (variant: EntityVariant, className?: string) =>
  cn(
    'inline-flex items-center h-5 px-1 rounded w-fit',
    'border-[0.5px] border-entity-border group-hover/entity:border-transparent',
    'font-mono text-sm font-medium tracking-tight whitespace-nowrap no-underline',
    variantClass[variant],
    className,
  )

const chipClass = cn(
  'inline-flex items-center cursor-pointer transition-colors',
  'h-7 px-2 gap-1 rounded-sm',
  'border border-border bg-popover text-popover-foreground',
  'hover:bg-accent hover:text-accent-foreground',
  'text-[11px] font-normal no-underline',
)

const CopyChip = ({
  value,
  label = 'Copy',
  showIcon = true,
}: {
  readonly value: string
  readonly label?: string
  readonly showIcon?: boolean
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // clipboard access denied or unavailable — silently ignore
    }
  }

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [copied])

  return (
    <button type="button" className={chipClass} onClick={handleCopy}>
      {copied ? (
        <CheckIcon className="size-3.25" />
      ) : (
        showIcon && <ChipCopyIcon className="size-3.25" />
      )}
      {!copied && label}
    </button>
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
  readonly ownerAddress?: Address
  /** Address — enables Address chip (→ /addr/$address) */
  readonly address?: Address
  /** Block explorer URL — enables Etherscan chip */
  readonly etherscanHref?: string
  /** Value to copy. Defaults: name → name, address/contract → address */
  readonly copyValue?: string
  /** Optional leading avatar rendered inside the hover surface, before the pill */
  readonly avatar?: ReactNode
  /** Render as an inline pill instead of a full-width 48px row */
  readonly inline?: boolean
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
  avatar,
  inline = false,
}: EntityBadgeWithActionsProps) => {
  const navigate = useNavigate()
  const chainId = useChainId()

  const { data: resolverInterfaces } = useQuery({
    ...getSupportsInterfacesQueryOptions({
      address: address ?? zeroAddress,
      interfaces: Object.values(RESOLVER_INTERFACE_IDS),
    }),
    enabled: variant === 'contract' && !!address,
  })
  const isResolver = resolverInterfaces?.some(Boolean) ?? false
  const contractName =
    variant === 'contract' && address
      ? getEnsContractName(chainId, address)
      : undefined

  const derivedCopyValue =
    copyValue ?? (variant === 'name' ? name : address) ?? ''

  const hasChips = !!(
    name ||
    ownerName ||
    ownerAddress ||
    address ||
    etherscanHref ||
    derivedCopyValue
  )

  if (!hasChips) {
    return (
      <EntityBadge variant={variant} className={className}>
        {children}
      </EntityBadge>
    )
  }

  const hasPrimaryAction =
    (variant === 'name' && !!name) ||
    (variant === 'address' && !!address) ||
    (variant === 'contract' && (isResolver ? !!address : !!etherscanHref)) ||
    (variant === 'tx' && !!etherscanHref)

  const triggerPrimaryAction = () => {
    if (variant === 'name' && name) {
      navigate({ to: '/$name', params: { name } })
      return
    }

    if (variant === 'address' && address) {
      navigate({ to: '/addr/$addr', params: { addr: address } })
      return
    }

    if (variant === 'contract') {
      if (isResolver && address) {
        navigate({ to: '/resolver/$address', params: { address } })
      } else if (etherscanHref) {
        window.open(etherscanHref, '_blank', 'noopener,noreferrer')
      }
      return
    }

    if (variant === 'tx' && etherscanHref) {
      window.open(etherscanHref, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className={cn(
        'relative group/entity',
        inline ? 'inline-flex' : 'flex w-full',
      )}
    >
      {/*
        Chips float above the badge.
        pb-2 creates an invisible 8px bridge at the bottom of this container,
        so hovering from badge upward to chips doesn't break the hover state.
      */}
      <div
        className={cn(
          'absolute bottom-full pb-2 hidden group-hover/entity:flex flex-row gap-1 z-50',
          inline ? 'right-0' : 'left-3.5',
        )}
      >
        {variant === 'name' && name && (
          <Link to="/$name" params={{ name }} className={chipClass}>
            <ChipNameIcon className="size-3.25" />
            Name
          </Link>
        )}

        {variant === 'name' && ownerName && (
          <Link to="/$name" params={{ name: ownerName }} className={chipClass}>
            <ChipWalletIcon className="size-3.25" />
            Owner
          </Link>
        )}

        {variant === 'name' && !ownerName && ownerAddress && (
          <Link
            to="/addr/$addr"
            params={{ addr: ownerAddress }}
            className={chipClass}
          >
            <ChipWalletIcon className="size-3.25" />
            Owner
          </Link>
        )}

        {variant === 'address' && address && (
          <Link
            to="/addr/$addr"
            params={{ addr: address }}
            className={chipClass}
          >
            <ChipWalletIcon className="size-3.25" />
            Address
          </Link>
        )}

        {variant === 'contract' && isResolver && address && (
          <Link
            to="/resolver/$address"
            params={{ address }}
            className={chipClass}
          >
            <ResolverIcon className="size-3.25" />
            Resolver
          </Link>
        )}

        {contractName && (
          <CopyChip
            value={contractName}
            label={contractName}
            showIcon={false}
          />
        )}

        {derivedCopyValue && <CopyChip value={derivedCopyValue} />}

        {etherscanHref && (
          <a
            href={etherscanHref}
            target="_blank"
            rel="noopener noreferrer"
            className={chipClass}
          >
            <ChipLinkIcon className="size-3.25" />
            Etherscan
          </a>
        )}
      </div>

      {hasPrimaryAction ? (
        <button
          type="button"
          className={cn(
            'items-center gap-2 rounded-lg transition-colors cursor-pointer text-left',
            inline
              ? 'inline-flex px-1.5 py-1 rounded'
              : 'flex w-full px-3.5 py-3.5',
            hoverBgClass[variant],
          )}
          onClick={triggerPrimaryAction}
        >
          {avatar}
          <span className={pillClass(variant, className)}>{children}</span>
        </button>
      ) : (
        <div
          className={cn(
            'items-center gap-2 rounded-lg transition-colors',
            inline
              ? 'inline-flex px-1.5 py-1 rounded'
              : 'flex w-full px-3.5 py-3.5',
            hoverBgClass[variant],
          )}
        >
          {avatar}
          <span className={pillClass(variant, className)}>{children}</span>
        </div>
      )}
    </div>
  )
}
