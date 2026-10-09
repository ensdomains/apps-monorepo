import { Trans } from '@lingui/react/macro'
import type { ComponentProps } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'

export const PrimaryNameButton = ({
  className,
  ...props
}: ComponentProps<'button'>) => (
  <button
    className={cn(
      'group inline-flex cursor-pointer items-center gap-2 rounded-full bg-ens-lapis-tint px-2 py-1 text-ens-blue transition-colors hover:bg-ens-lapis-dust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2',
      className,
    )}
    type="button"
    {...props}
  >
    <span
      aria-hidden="true"
      className="grid size-4 shrink-0 place-items-center"
    >
      <MSymbol
        className="col-start-1 row-start-1 ms-opsz-20 text-base leading-none group-hover:invisible group-focus-visible:invisible"
        symbol="person_check"
      />
      <MSymbol
        className="invisible col-start-1 row-start-1 ms-opsz-20 text-base leading-none group-hover:visible group-focus-visible:visible"
        symbol="published_with_changes"
      />
    </span>
    <span className="font-sans text-[13px] leading-[1.15] tracking-[-0.24px] md:text-[16px]">
      <Trans>Primary Name</Trans>
    </span>
  </button>
)
