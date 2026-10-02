import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/base-ui/popover'
import { MSymbol } from '@/components/ui/material-symbol'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { cn } from '@/lib/utils'

export const ProfileUpgradePopover = ({
  className,
}: {
  readonly className: string
}) => {
  const isMigrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )

  return (
    <Popover>
      {/* Editing is unavailable, but the explanation must stay interactive. */}
      <PopoverTrigger
        aria-disabled="true"
        className={cn(
          className,
          'cursor-default bg-ens-quartz-100 text-ens-quartz-380 hover:bg-ens-quartz-100 focus-visible:outline-2 focus-visible:outline-ens-lapis-500 focus-visible:outline-offset-2',
        )}
        delay={200}
        openOnHover
      >
        <Trans>Edit Profile</Trans>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // The portaled popup needs a viewport-relative cap with 2rem of total
        // gutter space; fixed max-width tokens and max-w-full cannot express it.
        className="w-max max-w-[calc(100vw-2rem)] items-end gap-0 rounded-xl px-4 py-2 motion-reduce:data-closed:animate-none motion-reduce:data-open:animate-none"
        side="top"
        sideOffset={8}
      >
        <div className="flex items-center gap-2 py-1">
          <MSymbol
            aria-hidden="true"
            className="ms-opsz-20 ms-wght-300 shrink-0 text-ens-quartz-900 text-xl leading-none"
            symbol="info"
          />
          <PopoverTitle className="font-normal text-ens-lapis-900 text-sm">
            <Trans>Upgrade name to edit profile</Trans>
          </PopoverTitle>
        </div>
        {isMigrationEnabled ? (
          <Link
            className="flex h-8.5 pointer-coarse:h-11 items-center gap-1.5 rounded font-semi-mono text-ens-lapis-500 text-sm uppercase tracking-tight hover:text-ens-lapis-900 focus-visible:outline-2 focus-visible:outline-ens-lapis-500 focus-visible:outline-offset-2"
            to="/upgrade"
          >
            <Trans>Upgrade Name</Trans>
            <MSymbol
              aria-hidden="true"
              className="ms-opsz-20 ms-wght-400 text-base leading-none"
              symbol="double_arrow"
            />
          </Link>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
