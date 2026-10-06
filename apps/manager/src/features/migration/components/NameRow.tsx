import { Trans } from '@lingui/react/macro'
import { memo, useId, useState } from 'react'
import type { Address } from 'viem'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn, truncateAddress } from '@/lib/utils'
import type { ClassifiedName } from '../service/classifyNames'
import { getMigrationAvatarUrl } from './nameAvatar.helpers'

type NameRowProps = {
  readonly item: Pick<ClassifiedName, 'domain'>
  readonly isSelected: boolean
  readonly isPrimary?: boolean
  readonly isInGrace?: boolean
  readonly depth: number
  readonly onToggle?: (name: string) => void
  /** The v1 registry controller, when it differs from the registrant. */
  readonly managerCandidate?: Address
  readonly isManagerRestored?: boolean
  /** A resumed run replays its recorded opt-in, so the choice is read-only. */
  readonly isManagerRestorationLocked?: boolean
  readonly onToggleManagerRestoration?: (name: string) => void
}

/**
 * The opt-in that carries a v1 registry controller across as a v2 manager.
 *
 * It always shows the address, because the account is neither the owner nor
 * anything the rest of the flow names: for a name bought on a marketplace it is
 * the seller, and granting it `ROLE_SET_RESOLVER` would let it keep changing
 * the name's resolver after the upgrade.
 */
const ManagerRestorationOptIn = ({
  name,
  manager,
  isRestored,
  isLocked,
  onToggle,
}: {
  readonly name: string
  readonly manager: Address
  readonly isRestored: boolean
  readonly isLocked: boolean
  readonly onToggle: (name: string) => void
}) => (
  <label
    className={cn(
      'mt-2 flex max-w-full items-start gap-2 pl-10 text-ens-garnet-900/70 text-xs leading-normal',
      isLocked ? 'cursor-default' : 'cursor-pointer',
    )}
    title={manager}
  >
    {/*
      The span below is the checkbox's accessible name because the label wraps
      both; pointing `aria-describedby` at it as well would read the sentence
      twice on the one control in this flow that hands a third party authority
      over a name.
    */}
    <input
      checked={isRestored}
      className="mt-0.5 size-3.5 shrink-0 accent-ens-garnet-900 disabled:opacity-60"
      disabled={isLocked}
      onChange={() => onToggle(name)}
      type="checkbox"
    />
    <span>
      <Trans>
        Keep{' '}
        <span className="font-semi-mono text-ens-garnet-900">
          {truncateAddress(manager)}
        </span>{' '}
        as a manager. It can change this name&apos;s resolver after the upgrade.
      </Trans>
      {isLocked && (
        <span className="block text-ens-garnet-900/50">
          <Trans>Carried over from your earlier attempt.</Trans>
        </span>
      )}
    </span>
  </label>
)

const NameRowComponent = ({
  item,
  isSelected,
  isPrimary = false,
  isInGrace = false,
  depth,
  onToggle,
  managerCandidate,
  isManagerRestored = false,
  isManagerRestorationLocked = false,
  onToggleManagerRestoration,
}: NameRowProps) => {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const avatarUrl = getMigrationAvatarUrl(item.domain.name)
  const isNested = depth > 0
  const showAvatar = failedAvatarUrl !== avatarUrl
  const primaryNameId = useId()
  const renewalId = useId()
  const descriptions =
    [isPrimary && primaryNameId, isInGrace && renewalId]
      .filter(Boolean)
      .join(' ') || undefined
  const badgeClass = cn(
    'flex size-7 items-center justify-center rounded-full border-3 transition-colors',
    isSelected
      ? 'border-ens-garnet-300 bg-ens-garnet-100 text-ens-garnet-500'
      : 'border-white bg-ens-quartz-500 text-ens-quartz-50',
  )

  const content = (
    <>
      {!isNested && (
        <div
          aria-hidden
          className={cn(
            'flex size-4.5 shrink-0 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ens-garnet-900 peer-focus-visible:ring-offset-2',
            isSelected
              ? 'border-ens-garnet-500 bg-ens-garnet-500'
              : 'border-ens-quartz-500 bg-transparent',
          )}
        >
          <MSymbol
            className={cn(
              'size-3.25 text-xs leading-none transition-opacity',
              isSelected
                ? 'text-ens-garnet-100 opacity-100'
                : 'text-transparent opacity-0',
            )}
            symbol="check"
          />
        </div>
      )}
      <div
        aria-hidden
        className="relative z-10 size-9.25 shrink-0 overflow-hidden rounded-md bg-ens-garnet-900/10"
      >
        <PatternAvatar
          className="size-full rounded-md border-none shadow-none"
          name={item.domain.name}
        />
        {showAvatar && (
          <img
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover"
            decoding="async"
            loading="lazy"
            onError={() => setFailedAvatarUrl(avatarUrl)}
            src={avatarUrl}
          />
        )}
      </div>
      <div
        className={cn(
          'relative flex h-9.25 min-w-0 items-center rounded-md px-2 py-1 font-medium font-semi-mono text-base leading-[0.96] tracking-[-0.32px] transition-colors md:text-[20px] md:tracking-[-0.4px]',
          isSelected
            ? 'bg-ens-garnet-300 text-ens-garnet-900'
            : 'bg-white text-ens-quartz-500',
        )}
      >
        <span className="truncate">{item.domain.name}</span>
        {(isPrimary || isInGrace) && (
          <span className="absolute -top-3.5 -right-3 flex gap-1">
            {isInGrace && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    aria-labelledby={renewalId}
                    className={cn(
                      badgeClass,
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2',
                    )}
                    role="img"
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: Allow keyboard access to the tooltip without adding a button inside the checkbox label.
                    tabIndex={0}
                    title=""
                  >
                    <MSymbol
                      aria-hidden
                      className="ms-wght-300 size-4 text-base leading-none"
                      symbol="cached"
                    />
                    <span className="sr-only" id={renewalId}>
                      <Trans>Renew before upgrade</Trans>
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Renew before upgrade</Trans>
                </TooltipContent>
              </Tooltip>
            )}
            {isPrimary && (
              <span className={badgeClass}>
                <MSymbol
                  aria-hidden
                  className="ms-wght-300 size-4 text-base leading-none"
                  symbol="person_check"
                />
                <span className="sr-only" id={primaryNameId}>
                  <Trans>Primary name</Trans>
                </span>
              </span>
            )}
          </span>
        )}
      </div>
    </>
  )

  const rowClass = cn(
    'relative flex max-w-full items-center gap-1',
    isNested ? 'cursor-default' : 'cursor-pointer',
  )

  if (isNested) {
    return (
      <div className={rowClass} title={item.domain.name}>
        {content}
      </div>
    )
  }

  // A locked row with nothing recorded has no choice left to show.
  const showManagerOptIn =
    isSelected &&
    !!managerCandidate &&
    !!onToggleManagerRestoration &&
    (!isManagerRestorationLocked || isManagerRestored)

  return (
    <div className="flex min-w-0 flex-col">
      <label className={rowClass} title={item.domain.name}>
        <input
          aria-describedby={descriptions}
          aria-label={item.domain.name}
          checked={isSelected}
          className="peer sr-only"
          onChange={() => onToggle?.(item.domain.name)}
          type="checkbox"
        />
        {content}
      </label>
      {showManagerOptIn && (
        <ManagerRestorationOptIn
          isLocked={isManagerRestorationLocked}
          isRestored={isManagerRestored}
          manager={managerCandidate}
          name={item.domain.name}
          onToggle={onToggleManagerRestoration}
        />
      )}
    </div>
  )
}

export const NameRow = memo(NameRowComponent)
