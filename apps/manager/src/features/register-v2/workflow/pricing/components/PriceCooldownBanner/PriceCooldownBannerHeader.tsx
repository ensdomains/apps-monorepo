import { Trans } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import { tw } from '@/utils/tailwind'

type PriceCooldownBannerHeaderProps = {
  periodDays: number
}

export const PriceCooldownBannerHeader = ({
  periodDays,
}: PriceCooldownBannerHeaderProps) => (
  <div className="flex gap-3 md:items-start md:gap-4">
    <div className="flex shrink-0 items-center">
      <div className="flex size-8 items-center justify-center rounded border-[#0082bb] border-[0.5px] bg-ens-lapis-500 p-1">
        <MSymbol
          className="ms-opsz-24 ms-wght-400 text-ens-lapis-tint"
          symbol="hourglass"
        />
      </div>
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:gap-3">
      <h2
        className={tw(
          'font-normal text-[#353535] leading-[1.1] tracking-tight',
          'text-base md:whitespace-nowrap md:text-xl',
        )}
      >
        <Trans>This name is in price cooldown</Trans>
      </h2>
      <p
        className={tw(
          'text-[#3f3f3e] text-sm leading-[1.2] tracking-wide',
          'pl-11 md:max-w-[600px] md:pl-0',
        )}
      >
        <Trans>
          Recently expired names have a temporary fee that decreases to $0 over{' '}
          {periodDays} days. It&apos;s added only once when you register —
          renewals are always at the base price.
        </Trans>
      </p>
    </div>
  </div>
)
