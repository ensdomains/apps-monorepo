import { Trans } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import { tw } from '@/utils/tailwind'
import { PriceCooldownDecayChart } from './PriceCooldownDecayChart'
import type { PriceCooldownBannerProps } from './types'

type PriceCooldownExpandedContentProps = Pick<
  PriceCooldownBannerProps,
  | 'basePricePerYearLabel'
  | 'premiumEndsAtLabel'
  | 'periodDays'
  | 'timezoneLabel'
  | 'premiumStartDate'
  | 'nowPoint'
  | 'selectedPoint'
  | 'onSelectedPointChange'
  | 'targetPriceInput'
  | 'onTargetPriceInputChange'
  | 'onTargetPriceInputBlur'
  | 'targetPriceReachLabel'
  | 'favoriteCount'
  | 'searchCount30d'
>

const DemandStats = ({
  favoriteCount,
  searchCount30d,
}: {
  favoriteCount?: number
  searchCount30d?: number
}) => {
  if (favoriteCount === undefined && searchCount30d === undefined) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 text-ens-lapis-900 md:flex-row md:flex-wrap md:gap-3">
      {favoriteCount !== undefined && (
        <div className="flex items-center gap-1.5">
          <MSymbol className="ms-opsz-16 ms-wght-300" symbol="favorite" />
          <span className="font-mono text-sm uppercase">{favoriteCount}</span>
          <span className="font-medium text-ens-lapis-900 text-xs md:text-sm">
            <Trans>people have favorited this name</Trans>
          </span>
        </div>
      )}
      {searchCount30d !== undefined && (
        <div className="flex items-center gap-1.5">
          <MSymbol className="ms-opsz-16 ms-wght-300" symbol="search" />
          <span className="font-mono text-sm uppercase">{searchCount30d}</span>
          <span className="font-medium text-ens-lapis-900 text-xs md:text-sm">
            <Trans>unique searches in the last 30 days</Trans>
          </span>
        </div>
      )}
    </div>
  )
}

const TargetPriceField = ({
  basePricePerYearLabel,
  targetPriceInput,
  onTargetPriceInputChange,
  onTargetPriceInputBlur,
  targetPriceReachLabel,
}: Pick<
  PriceCooldownExpandedContentProps,
  | 'basePricePerYearLabel'
  | 'targetPriceInput'
  | 'onTargetPriceInputChange'
  | 'onTargetPriceInputBlur'
  | 'targetPriceReachLabel'
>) => {
  if (!onTargetPriceInputChange) return null

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="font-normal text-ens-quartz-700 text-sm tracking-tight md:text-base">
        <span className="md:hidden">
          <Trans>
            Enter a price you&apos;d be willing to pay. We&apos;ll calculate
            when the fee will reach that price.
          </Trans>
        </span>
        <span className="hidden md:inline">
          <Trans>What additional fee would you pay?</Trans>
        </span>
      </p>
      {/*
        Flat label wrapping a flush "$", an auto-sized input, and the suffix.
        We dropped the shadcn InputGroup primitive here because its
        inline-start addon has its own padding (and adds a sibling pl-1.5
        rule to the input), which produced a visible gap between "$" and
        the typed value — we want them tight ("$5,000" not "$ 5,000").

        Clicking anywhere on the <label> focuses the input natively.
        `field-sizing: content` shrinks the input to its value width so
        the suffix sits immediately after the digits instead of floating
        at the far right edge of the box.
      */}
      <label
        className={tw(
          'flex h-12 w-full cursor-text items-center gap-2 overflow-hidden',
          'rounded border border-ens-quartz-200 bg-white px-4',
          'focus-within:border-ens-lapis-400',
        )}
      >
        <span className="text-sm text-ens-quartz-900">$</span>
        <input
          className={tw(
            'flex-initial [field-sizing:content] min-w-[2ch]',
            'border-0 bg-transparent p-0 text-sm text-ens-quartz-900 outline-none',
            'placeholder:text-ens-quartz-360',
          )}
          inputMode="decimal"
          onBlur={onTargetPriceInputBlur}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.,]/g, '')
            onTargetPriceInputChange(raw)
          }}
          placeholder="0"
          type="text"
          value={targetPriceInput ?? ''}
        />
        {/*
          Suffix reminder: the cooldown fee is *additional* to the recurring
          yearly base price. Showing it inside the field keeps that framing
          inline with the typed number. Hidden until the oracle base rate
          has loaded so we never flash "+ undefined base price".
        */}
        {basePricePerYearLabel && (
          <span className="select-none text-sm text-ens-quartz-400">
            + {basePricePerYearLabel} base price
          </span>
        )}
      </label>
      {targetPriceReachLabel && (
        <p className="text-ens-quartz-400 text-xs leading-normal md:text-sm">
          {targetPriceReachLabel}
        </p>
      )}
    </div>
  )
}

export const PriceCooldownExpandedContent = ({
  basePricePerYearLabel,
  premiumEndsAtLabel,
  periodDays = 21,
  timezoneLabel,
  premiumStartDate,
  nowPoint,
  selectedPoint,
  onSelectedPointChange,
  targetPriceInput,
  onTargetPriceInputChange,
  onTargetPriceInputBlur,
  targetPriceReachLabel,
  favoriteCount,
  searchCount30d,
}: PriceCooldownExpandedContentProps) => {
  const showDemandSection =
    favoriteCount !== undefined || searchCount30d !== undefined

  const chartProps = {
    nowPoint,
    onSelectedPointChange,
    premiumStartDate,
    selectedPoint,
    timezoneLabel,
  }

  return (
    <div className="flex w-full flex-col gap-5 md:gap-10">
      <div className="flex flex-col gap-3 px-5 md:hidden">
        <p className="font-normal text-[#353535] text-sm">
          <Trans>How it works</Trans>
        </p>
        <p className="text-[#3f3f3e] text-xs leading-normal">
          <Trans>
            When a name expires, a temporary fee is added on top of its base
            price to prevent instant sniping by bots. The fee starts at an
            intentionally high price ($100M) and drops continuously toward $0
            over {periodDays} days.
          </Trans>
        </p>
        <p className="text-[#737373] text-sm">
          <Trans>The fee hits $0 on</Trans>{' '}
          <span className="text-ens-lapis-900">{premiumEndsAtLabel}</span>
        </p>
        <PriceCooldownDecayChart compact {...chartProps} />
        <TargetPriceField
          basePricePerYearLabel={basePricePerYearLabel}
          onTargetPriceInputBlur={onTargetPriceInputBlur}
          onTargetPriceInputChange={onTargetPriceInputChange}
          targetPriceInput={targetPriceInput}
          targetPriceReachLabel={targetPriceReachLabel}
        />
      </div>

      {showDemandSection && (
        <div
          className={tw(
            'mx-5 rounded-xl border-[#80c4e0] border-[0.5px] bg-[#effafe] p-4 md:mx-0 md:hidden',
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-[#353535] text-sm">
                <Trans>Should I buy now or wait?</Trans>
              </p>
              <p className="text-[#3f3f3e] text-xs leading-normal">
                <Trans>
                  You can buy this name at any point during the {periodDays}-day
                  cooldown. Some names are more in-demand than others — the
                  stats below can help you decide whether to act soon or wait.
                </Trans>
              </p>
            </div>
            <DemandStats
              favoriteCount={favoriteCount}
              searchCount30d={searchCount30d}
            />
          </div>
        </div>
      )}

      <div className="hidden md:grid md:grid-cols-2 md:items-start md:gap-x-10 md:gap-y-6">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[#353535] text-base leading-normal">
              <Trans>Should I buy now or wait?</Trans>
            </p>
            <p className="text-[#3f3f3e] text-sm leading-normal">
              <Trans>
                You can buy this name at any point during the {periodDays}-day
                cooldown. Some names are more in-demand than others — the stats
                below can help you decide whether to act soon or wait.
              </Trans>
            </p>
            <DemandStats
              favoriteCount={favoriteCount}
              searchCount30d={searchCount30d}
            />
          </div>
          <TargetPriceField
            basePricePerYearLabel={basePricePerYearLabel}
            onTargetPriceInputBlur={onTargetPriceInputBlur}
            onTargetPriceInputChange={onTargetPriceInputChange}
            targetPriceInput={targetPriceInput}
            targetPriceReachLabel={targetPriceReachLabel}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3 self-start">
          <p className="text-[#737373] text-sm leading-normal">
            <Trans>The fee hits $0 on</Trans>{' '}
            <span className="text-ens-lapis-900">{premiumEndsAtLabel}</span>
          </p>
          <PriceCooldownDecayChart {...chartProps} />
        </div>
      </div>
    </div>
  )
}
