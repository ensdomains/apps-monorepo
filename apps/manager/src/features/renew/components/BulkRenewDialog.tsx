import { TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getNameRowProfilePreview } from '@/features/dashboard/components/nameRowProfileRecords'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getBaseRatesQueryOptions } from '@/features/register-v2/data/queries/baseRates.query'
import { getRenewPriceQueryOptions } from '@/features/register-v2/data/queries/pricing.query'
import { calculateDiscount } from '@/features/register-v2/utils/discount'
import { getLabelLength } from '@/features/register-v2/utils/name-parser'
import { SECONDS_IN_YEAR } from '@/features/register-v2/utils/time'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

const USDC = TOKENS.USDC

type Preset = {
  readonly years: number
  readonly pillClassName: string
}

const PRESETS: readonly Preset[] = [
  { years: 1, pillClassName: 'bg-ens-citrine-100 text-ens-citrine-500' },
  { years: 3, pillClassName: 'bg-ens-peridot-100 text-ens-peridot-500' },
  { years: 6, pillClassName: 'bg-ens-garnet-100 text-ens-garnet-500' },
]

export type BulkRenewName = {
  /** Bare label without `.eth`, used for the on-chain price read. */
  readonly label: string
  /** Full name (e.g. `erni.eth`) used for profile record lookups. */
  readonly name: string
  /** Label shown in the UI. */
  readonly displayName: string
  /** Current on-chain expiry in seconds. */
  readonly currentExpiry: number
}

type Selection =
  | { readonly kind: 'preset'; readonly years: number }
  | { readonly kind: 'custom'; readonly targetMs: number }

interface BulkRenewDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly names: readonly BulkRenewName[]
}

const usd = (value: number): string =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—'

const yearsToSeconds = (years: number): number =>
  Math.round(years * SECONDS_IN_YEAR)

/** Per-name renewal duration (seconds) for the active selection. */
const durationForName = (
  selection: Selection,
  currentExpiry: number,
): number => {
  if (selection.kind === 'preset') return yearsToSeconds(selection.years)
  return Math.max(0, Math.round(selection.targetMs / 1000 - currentExpiry))
}

const newExpirySeconds = (
  selection: Selection,
  currentExpiry: number,
): number =>
  selection.kind === 'preset'
    ? currentExpiry + yearsToSeconds(selection.years)
    : Math.round(selection.targetMs / 1000)

export const BulkRenewDialog = ({
  open,
  onOpenChange,
  names,
}: BulkRenewDialogProps) => {
  const { t } = useLingui()
  const [selection, setSelection] = useState<Selection>({
    kind: 'preset',
    years: 1,
  })
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false)

  const count = names.length

  // The custom target must land after every selected name's expiry.
  const latestExpiry = useMemo(
    () => names.reduce((max, n) => Math.max(max, n.currentExpiry), 0),
    [names],
  )
  const minSelectableDate = useMemo(() => {
    const day = addDays(new Date(latestExpiry * 1000), 1)
    day.setHours(0, 0, 0, 0)
    return day
  }, [latestExpiry])

  // Base rates (per label length) drive the discount pills.
  const baseRates = useQuery({ ...getBaseRatesQueryOptions, enabled: open })
  const baseRateFor = (label: string): bigint => {
    const data = baseRates.data
    if (!data) return 0n
    const idx = Math.min(getLabelLength(label), data.length) - 1
    return data[idx] ?? 0n
  }

  // Preset prices for every (preset × name) combination → card totals + discounts.
  const presetQueries = useQueries({
    queries: PRESETS.flatMap((preset) =>
      names.map((n) => ({
        ...getRenewPriceQueryOptions(
          n.label,
          yearsToSeconds(preset.years),
          USDC.symbol,
        ),
        enabled: open,
        select: (data: { amount: bigint }) =>
          decimalBigintToNumber(data.amount, USDC.decimals),
      })),
    ),
  })

  const presetPriceAt = (
    presetIdx: number,
    nameIdx: number,
  ): number | undefined => presetQueries[presetIdx * count + nameIdx]?.data

  const presetSummary = (preset: Preset, presetIdx: number) => {
    let total = 0
    let discountAmount = 0
    let withoutDiscount = 0
    names.forEach((n, i) => {
      const price = presetPriceAt(presetIdx, i) ?? 0
      total += price
      const d = calculateDiscount(
        price,
        baseRateFor(n.label),
        BigInt(yearsToSeconds(preset.years)),
      )
      discountAmount += d.discountAmount
      withoutDiscount += d.basePriceWithoutDiscount
    })
    const discountPercentage =
      withoutDiscount > 0
        ? Math.round((discountAmount / withoutDiscount) * 100)
        : 0
    return { total, discountAmount, discountPercentage }
  }

  // Per-name prices for the ACTIVE selection → breakdown list + grand total.
  const activeQueries = useQueries({
    queries: names.map((n) => {
      const duration = durationForName(selection, n.currentExpiry)
      return {
        ...getRenewPriceQueryOptions(n.label, duration, USDC.symbol),
        enabled: open && duration > 0,
        placeholderData: keepPreviousData,
        select: (data: { amount: bigint }) =>
          decimalBigintToNumber(data.amount, USDC.decimals),
      }
    }),
  })

  const grandTotal = activeQueries.reduce((sum, q) => sum + (q.data ?? 0), 0)

  // Avatars for the breakdown rows.
  const profilePreviews = useQueries({
    queries: names.map((n) => ({
      ...profileRecordsQuery(n.name),
      enabled: open,
    })),
    combine: (results) =>
      results.map((r) => ({ records: r.data, isLoading: r.isLoading })),
  })

  const durationLabel =
    selection.kind === 'preset'
      ? selection.years === 1
        ? t`1 year`
        : t`${selection.years} years`
      : format(new Date(selection.targetMs), 'MMM d, yyyy')

  const handlePickDate = (date: Date | undefined) => {
    if (!date) return
    const target = new Date(date)
    target.setHours(0, 0, 0, 0)
    setSelection({ kind: 'custom', targetMs: target.getTime() })
    setIsDatePopoverOpen(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-5 overflow-hidden p-6 sm:max-w-[540px]"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="text-left font-sans text-ens-quartz-900 text-xl tracking-[-0.4px]">
            <Trans>Renew {count} names for </Trans>
            <span className="text-ens-lapis-core">{durationLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Duration presets */}
        <div className="flex flex-col gap-2">
          {PRESETS.map((preset, presetIdx) => {
            const { total, discountAmount, discountPercentage } = presetSummary(
              preset,
              presetIdx,
            )
            const isSelected =
              selection.kind === 'preset' && selection.years === preset.years
            const isLowest = presetIdx === 0

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border bg-ens-quartz-50 px-4 py-3 text-left transition-colors',
                  isSelected
                    ? 'border-ens-lapis-900'
                    : 'border-ens-quartz-200 hover:border-ens-lapis-900',
                )}
                key={preset.years}
                onClick={() =>
                  setSelection({ kind: 'preset', years: preset.years })
                }
                type="button"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="font-sans text-base text-ens-quartz-900">
                    {preset.years === 1 ? (
                      <Trans>1 year</Trans>
                    ) : (
                      <Trans>{preset.years} years</Trans>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-sans text-xs',
                        preset.pillClassName,
                      )}
                    >
                      {isLowest ? (
                        <Trans>Lowest upfront cost</Trans>
                      ) : (
                        <Trans>{discountPercentage}% discount</Trans>
                      )}
                    </span>
                    {!isLowest && discountAmount > 0 && (
                      <span className="font-sans text-ens-peridot-500 text-xs">
                        <Trans>Save {usd(discountAmount)}</Trans>
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-base text-ens-quartz-400">
                  {usd(total)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Renew to a specific date */}
        <div className="flex justify-end">
          <Popover onOpenChange={setIsDatePopoverOpen} open={isDatePopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1.5 font-sans text-xs',
                  selection.kind === 'custom'
                    ? 'text-ens-lapis-core'
                    : 'text-ens-lapis-core hover:opacity-80',
                )}
                type="button"
              >
                {selection.kind === 'custom' ? (
                  <Trans>
                    Register to{' '}
                    {format(new Date(selection.targetMs), 'MMM d, yyyy')}
                  </Trans>
                ) : (
                  <Trans>Register to date instead</Trans>
                )}
                <MSymbol
                  className="ms-opsz-18 text-lg leading-none"
                  symbol="calendar_month"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                captionLayout="dropdown"
                defaultMonth={
                  selection.kind === 'custom'
                    ? new Date(selection.targetMs)
                    : minSelectableDate
                }
                disabled={(date) => {
                  const d = new Date(date)
                  d.setHours(0, 0, 0, 0)
                  return d.getTime() < minSelectableDate.getTime()
                }}
                endMonth={addDays(minSelectableDate, 365 * 100)}
                minimumDate={minSelectableDate}
                onMinimum={() => handlePickDate(minSelectableDate)}
                onSelect={handlePickDate}
                selected={
                  selection.kind === 'custom'
                    ? new Date(selection.targetMs)
                    : undefined
                }
                showMinimumButton
                startMonth={minSelectableDate}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex max-h-[280px] flex-col gap-0 overflow-y-auto rounded-lg border border-ens-quartz-150">
          {names.map((n, i) => {
            const preview = getNameRowProfilePreview({
              label: n.label,
              name: n.name,
              records: profilePreviews[i]?.records,
              isLoading: profilePreviews[i]?.isLoading,
            })
            const subtotal = activeQueries[i]?.data
            const startDate = new Date(n.currentExpiry * 1000)
            const endDate = new Date(
              newExpirySeconds(selection, n.currentExpiry) * 1000,
            )

            return (
              <div
                className="flex flex-col gap-2 border-ens-quartz-150 border-b p-4 last:border-none"
                key={n.name}
              >
                <div className="flex items-center gap-2 font-sans text-ens-quartz-380 text-xs">
                  <span className="font-normal font-sans text-ens-quartz-400 text-xs">
                    {format(startDate, 'MMMM d, yyyy')}
                  </span>
                  <ArrowRight
                    className="size-3.5 text-ens-quartz-400"
                    strokeWidth={2}
                  />
                  <span className="font-normal font-sans text-ens-quartz-700 text-xs">
                    {format(endDate, 'MMMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="relative size-9 shrink-0 overflow-hidden rounded-sm bg-ens-quartz-50">
                      <ImageFallback.Root className="contents">
                        <ImageFallback.Image
                          alt=""
                          className="size-full object-cover"
                          src={preview.avatarUrl}
                        />
                        <ImageFallback.Fallback>
                          <PatternAvatar
                            className="size-full rounded-sm border-none bg-transparent p-0 shadow-none"
                            color={preview.themeColor}
                            name={n.label}
                          />
                        </ImageFallback.Fallback>
                      </ImageFallback.Root>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium font-semi-mono text-base text-ens-quartz-900">
                        {n.displayName}
                      </span>
                      <span className="font-sans text-ens-quartz-350 text-sm">
                        <Trans>Subtotal:</Trans>
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 font-sans text-ens-quartz-900 text-sm">
                    {subtotal === undefined ? '—' : usd(subtotal)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between font-medium font-sans text-ens-lapis-900 text-xl">
          <Trans>Total:</Trans>
          <span className="block">{usd(grandTotal)} USD</span>
        </div>

        <Button className="w-full" size="lg" type="button" variant="lightBlue">
          <Trans>Next</Trans>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
