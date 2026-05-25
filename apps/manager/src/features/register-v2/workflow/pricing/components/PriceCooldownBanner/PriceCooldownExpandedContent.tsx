import { Trans } from '@lingui/react/macro'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { MSymbol } from '@/components/ui/material-symbol'
import { tw } from '@/utils/tailwind'
import { PriceCooldownDecayChart } from './PriceCooldownDecayChart'
import type { PriceCooldownBannerProps } from './types'

type PriceCooldownExpandedContentProps = Pick<
  PriceCooldownBannerProps,
  | 'currentPremiumLabel'
  | 'premiumEndsAtLabel'
  | 'periodDays'
  | 'chartStartLabel'
  | 'chartWindowProgress'
  | 'timezoneLabel'
  | 'targetPriceInput'
  | 'onTargetPriceInputChange'
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
  targetPriceInput,
  onTargetPriceInputChange,
  targetPriceReachLabel,
}: Pick<
  PriceCooldownExpandedContentProps,
  'targetPriceInput' | 'onTargetPriceInputChange' | 'targetPriceReachLabel'
>) => {
  if (!onTargetPriceInputChange) return null

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="font-normal text-[#353535] text-sm tracking-tight md:text-base">
        <span className="md:hidden">
          <Trans>
            Enter a price you&apos;d be willing to pay. We&apos;ll calculate
            when the fee will reach that price.
          </Trans>
        </span>
        <span className="hidden md:inline">
          <Trans>What price are you willing to pay?</Trans>
        </span>
      </p>
      <InputGroup className="h-12 rounded border-[#e5e5e5]">
        <InputGroupAddon className="bg-[#f6f6f6] px-4">
          <InputGroupText className="text-[#9b9ba7] text-base">
            $
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          className="text-[#191919] text-sm"
          inputMode="decimal"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.,]/g, '')
            onTargetPriceInputChange(raw)
          }}
          placeholder="0.00"
          value={targetPriceInput ?? ''}
        />
      </InputGroup>
      {targetPriceReachLabel && (
        <p className="text-[#737373] text-xs leading-normal md:text-sm">
          {targetPriceReachLabel}
        </p>
      )}
    </div>
  )
}

export const PriceCooldownExpandedContent = ({
  currentPremiumLabel,
  premiumEndsAtLabel,
  periodDays = 21,
  chartStartLabel,
  chartWindowProgress,
  timezoneLabel,
  targetPriceInput,
  onTargetPriceInputChange,
  targetPriceReachLabel,
  favoriteCount,
  searchCount30d,
}: PriceCooldownExpandedContentProps) => {
  const showDemandSection =
    favoriteCount !== undefined || searchCount30d !== undefined

  return (
    <div className="flex w-full flex-col gap-5 md:gap-10">
      {/* Mobile-only intro */}
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
          <Trans>Fee hits $0 on</Trans>{' '}
          <span className="text-ens-lapis-900">{premiumEndsAtLabel}</span>
        </p>
        <PriceCooldownDecayChart
          compact
          currentPremiumLabel={currentPremiumLabel}
          startLabel={chartStartLabel}
          timezoneLabel={timezoneLabel}
          windowProgress={chartWindowProgress}
        />
        <TargetPriceField
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

      {/* Desktop two-column layout */}
      <div className="hidden gap-10 md:flex">
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[#353535] text-base">
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
            onTargetPriceInputChange={onTargetPriceInputChange}
            targetPriceInput={targetPriceInput}
            targetPriceReachLabel={targetPriceReachLabel}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <p className="text-[#737373] text-sm">
            <Trans>Fee hits $0 on</Trans>{' '}
            <span className="text-ens-lapis-900">{premiumEndsAtLabel}</span>
          </p>
          <PriceCooldownDecayChart
            currentPremiumLabel={currentPremiumLabel}
            startLabel={chartStartLabel}
            timezoneLabel={timezoneLabel}
            windowProgress={chartWindowProgress}
          />
        </div>
      </div>
    </div>
  )
}
