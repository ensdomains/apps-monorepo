import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
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
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getSupportsInterfacesQueryOptions } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'
import { cn } from '@/lib/utils'
import { getEnsContractName } from '@/utils/ens/ensContractNames'

export type EntityVariant = 'name' | 'address' | 'contract' | 'tx' | 'default'

// Combined (bg + text) — used for the standalone pill (no chips attached).
const variantClass: Record<EntityVariant, string> = {
  name: 'bg-accent-fill dark:bg-entity-bg text-accent-text',
  address: 'bg-success-fill dark:bg-entity-bg text-success-text',
  contract: 'bg-danger-fill dark:bg-entity-bg text-danger-text',
  tx: 'bg-warning-fill dark:bg-entity-bg text-warning-text',
  default: 'bg-default-fill dark:bg-entity-bg text-default-text',
}

// Fill only — used for the animated absolute bg div in the chip-enhanced path.
const variantBgClass: Record<EntityVariant, string> = {
  name: 'bg-accent-fill',
  address: 'bg-success-fill',
  contract: 'bg-danger-fill',
  tx: 'bg-warning-fill',
  default: 'bg-default-fill',
}

// Text only — used for the pill in the chip-enhanced path (bg comes from the
// absolute div so the pill's own background must be transparent).
const variantTextClass: Record<EntityVariant, string> = {
  name: 'text-accent-text',
  address: 'text-success-text',
  contract: 'text-danger-text',
  tx: 'text-warning-text',
  default: 'text-default-text',
}

export const hoverBgClass: Record<EntityVariant, string> = {
  name: 'hover:bg-accent-fill dark:hover:bg-entity-bg',
  address: 'hover:bg-success-fill dark:hover:bg-entity-bg',
  contract: 'hover:bg-danger-fill dark:hover:bg-entity-bg',
  tx: 'hover:bg-warning-fill dark:hover:bg-entity-bg',
  default: 'hover:bg-default-fill dark:hover:bg-entity-bg',
}

// Shared pill typography & layout.
// No tracking class here — .font-mono sets letter-spacing: 0.1 em globally
// (see src/styles/index.css @layer base).
const pillBase =
  'inline-flex items-center h-5 px-1 rounded w-fit ' +
  'font-mono text-sm font-medium leading-none whitespace-nowrap no-underline'

// Standalone pill: self-contained bg + text (used when there are no chips).
const pillClass = (variant: EntityVariant, className?: string) =>
  cn(pillBase, variantClass[variant], className)

const chipClass = cn(
  'inline-flex items-center cursor-pointer transition-colors',
  'h-7 px-2 gap-1.5 rounded-sm',
  // Default: outline variant — neutral-0 fill, neutral-3 border, neutral-7 text
  'border border-neutral-3 bg-neutral-0 text-neutral-7',
  // Hover: border → neutral-5, text → neutral-8 (fill stays neutral-0)
  'hover:border-neutral-5 hover:text-neutral-8',
  // Active: same border+text as hover, fill steps up to neutral-1
  'active:bg-neutral-1 active:border-neutral-5 active:text-neutral-8',
  'text-[11px] font-normal no-underline',
)

// Chip overlay reveal — opacity + pointer-events (not display:none) so chips
// stay in the tab order and a11y tree. Reveals on mouse hover and on
// keyboard focus-within the badge group.
const chipOverlayBase = cn(
  'absolute bottom-full pb-2 flex flex-row gap-1 z-50',
  'opacity-0 pointer-events-none transition-opacity',
  'group-hover/entity:opacity-100 group-hover/entity:pointer-events-auto',
  'group-focus-within/entity:opacity-100 group-focus-within/entity:pointer-events-auto',
)

// Default variant only: also show on touch devices, since copy is the
// primary affordance for read-only fields and there's no badge-level tap
// fallback the way other variants have a link.
const chipOverlayAlwaysOnTouch = cn(
  '[@media(hover:none)]:opacity-100',
  '[@media(hover:none)]:pointer-events-auto',
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
    <button
      type="button"
      className={chipClass}
      onClick={handleCopy}
      aria-label={label || 'Copy'}
    >
      {copied ? (
        <CheckIcon className="size-3.25" />
      ) : (
        showIcon && <ChipCopyIcon className="size-3.25" />
      )}
      {!copied && label ? label : null}
    </button>
  )
}

interface EntityBadgeProps {
  readonly children: ReactNode
  readonly variant: EntityVariant
  readonly className?: string
  /** Optional leading label rendered inside the pill */
  readonly label?: string
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
  /** Opt-in to a leading NameAvatar (only renders for variant="name" + name). */
  readonly showAvatar?: boolean
}

export const EntityBadge = ({
  children,
  variant,
  className,
  label,
  name,
  ownerName,
  ownerAddress,
  address,
  etherscanHref,
  copyValue,
  showAvatar = false,
}: EntityBadgeProps) => {
  const chainId = useChainId()

  const labelContent = label ? (
    <span className="bg-background text-center font-sans font-[425] leading-none px-1 py-0.5 rounded-[2px] mr-1">
      {label}
    </span>
  ) : null

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

  const resolvedAvatar =
    showAvatar && variant === 'name' && name ? (
      <NameAvatar
        name={name}
        width="20px"
        height="20px"
        rounded="rounded-[2px]"
      />
    ) : null

  // Default variant: plain truncatable text with a floating Copy chip above
  // it on hover/focus. Used for read-only key-value displays where copy is
  // the primary affordance; no link, no animated bg.
  if (variant === 'default') {
    return (
      <div className="relative group/entity flex w-full min-w-0">
        {derivedCopyValue && (
          <div
            className={cn(chipOverlayBase, chipOverlayAlwaysOnTouch, 'left-0')}
          >
            <CopyChip value={derivedCopyValue} />
          </div>
        )}
        <span
          className={cn(
            'block min-w-0 truncate font-mono text-sm font-medium tracking-tight',
            'px-1 rounded border-[0.5px] border-entity-border',
            variantClass[variant],
            className,
          )}
        >
          {labelContent}
          {children}
        </span>
      </div>
    )
  }

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
      <span className={pillClass(variant, className)}>
        {labelContent}
        {children}
      </span>
    )
  }

  // Real <Link>/<a> elements preserve middle-click, ⌘+click, "Open in new
  // tab", status-bar URL preview, and right-click affordances — none of
  // which work with a button + navigate() pattern.
  const primaryWrapperClass =
    'inline-flex items-center gap-2 py-4 px-2 rounded cursor-pointer text-left no-underline'
  const renderPrimary = () => {
    if (variant === 'name' && name) {
      return (
        <Link to="/$name" params={{ name }} className={primaryWrapperClass}>
          {pillNode}
        </Link>
      )
    }
    if (variant === 'address' && address) {
      return (
        <Link
          to="/addr/$addr"
          params={{ addr: address }}
          className={primaryWrapperClass}
        >
          {pillNode}
        </Link>
      )
    }
    if (variant === 'contract' && isResolver && address) {
      return (
        <Link
          to="/resolver/$address"
          params={{ address }}
          className={primaryWrapperClass}
        >
          {pillNode}
        </Link>
      )
    }
    if (variant === 'contract' && !isResolver && etherscanHref) {
      return (
        <a
          href={etherscanHref}
          target="_blank"
          rel="noopener noreferrer"
          className={primaryWrapperClass}
        >
          {pillNode}
        </a>
      )
    }
    if (variant === 'tx' && etherscanHref) {
      return (
        <a
          href={etherscanHref}
          target="_blank"
          rel="noopener noreferrer"
          className={primaryWrapperClass}
        >
          {pillNode}
        </a>
      )
    }
    return (
      <div className="inline-flex items-center gap-2 py-4 px-2 rounded">
        {pillNode}
      </div>
    )
  }

  /*
   * Chip-enhanced pill.
   *
   * An absolutely-positioned bg div lives *inside* a `relative` wrapper span
   * so it never affects layout. At rest it sits 2px outside the pill on every
   * side (matching the Figma "always-on" small halo). On group hover it
   * expands to 12px outside — the same zone the chips occupy — giving the
   * appearance of the badge growing to accommodate them. CSS inset transition
   * makes it smooth without any layout shift.
   */
  const pillNode = (
    <span className="relative inline-flex items-center">
      <span
        className={cn(
          'absolute rounded transition-[inset] duration-150',
          // Horizontal px-1 on the pill adds 4px of internal colored area on
          // each side; vertical centering in h-5 adds only 3px. Use -1px x-inset
          // vs -2px y-inset so the visible rim is equal (~5px) on all sides.
          // When a label is present its bg-background sub-chip acts as a visual
          // reference that makes the left strip read one pixel too wide, so
          // flush the x-inset to 0 in that case.
          'inset-y-[-2px]',
          // No label: bg extends 1px beyond pill edge → ~5px colored strip to text (matches top)
          // With label: label sub-chip (~18px) in a 20px pill leaves only 1px above it, so
          //   push x inset 1px *inside* the pill edge → 3px strip to sub-chip (matches top)
          label
            ? 'inset-x-px'
            : resolvedAvatar
              ? 'inset-x-[-2px]'
              : 'inset-x-[-1px]',
          'group-hover/entity:inset-[-12px]',
          variantBgClass[variant],
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          pillBase,
          'relative z-10',
          variantTextClass[variant],
          // Avatar sits flush against the left edge — remove left padding
          // and add gap-1 so avatar doesn't touch the text
          resolvedAvatar && 'pl-0 gap-1.5',
          className,
        )}
      >
        {resolvedAvatar}
        {labelContent}
        {children}
      </span>
    </span>
  )

  return (
    <div
      className={cn(
        'relative group/entity inline-flex -ml-2',
        // `-ml-2` compensates the inner wrapper's `px-2` so the pill text
        // sits flush with the container's left edge.
      )}
    >
      {/*
        Chip container's bottom-left corner sits INSIDE the hover zone:
        - `bottom: calc(100% - 12px)` puts chip bottom 12px below wrapper top
          (= 4px above pill top, bridged by the inner wrapper's py-4)
        - `left-2` puts chip left 8px inside wrapper from left
          (matching Figma's chip-to-bg-edge gap of 8px)
      */}
      <div
        className={cn(
          'absolute bottom-[calc(100%-12px)] left-2 flex flex-row gap-1 z-50',
          // Reveal on mouse hover and on keyboard focus-within the badge;
          // opacity/pointer-events (not display:none) keeps chips in the tab
          // order and the accessibility tree.
          'opacity-0 pointer-events-none transition-opacity',
          'group-hover/entity:opacity-100 group-hover/entity:pointer-events-auto',
          'group-focus-within/entity:opacity-100 group-focus-within/entity:pointer-events-auto',
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

      {renderPrimary()}
    </div>
  )
}
