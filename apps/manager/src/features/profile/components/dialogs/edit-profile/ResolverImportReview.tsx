import { Trans } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'

export const ResolverImportReview = ({
  warnings,
  isConfirmed,
  onConfirmedChange,
  blockedKeys = [],
  isPending = false,
  onRetry,
}: {
  readonly warnings: readonly string[]
  readonly isConfirmed: boolean
  readonly onConfirmedChange: (isConfirmed: boolean) => void
  readonly blockedKeys?: readonly string[]
  readonly isPending?: boolean
  readonly onRetry?: () => void
}) => (
  <div className="shrink-0 space-y-2 border-ens-quartz-200 border-b bg-ens-quartz-50 px-4 py-3 text-sm md:px-6">
    <p className="font-medium">
      <Trans>Review imported records</Trans>
    </p>
    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
    {blockedKeys.length > 0 ? (
      <div className="space-y-2" role="alert">
        <p>
          <Trans>
            Resolver replacement is blocked. These records could not be read or
            preserved:
          </Trans>{' '}
          <span className="break-words font-semi-mono">
            {blockedKeys.join(', ')}
          </span>
        </p>
        <Button
          disabled={isPending}
          onClick={onRetry}
          type="button"
          variant="outline"
        >
          <Trans>Retry import</Trans>
        </Button>
      </div>
    ) : null}
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        checked={isConfirmed && blockedKeys.length === 0}
        className="size-4 shrink-0 accent-ens-lapis-core"
        disabled={blockedKeys.length > 0 || isPending}
        onChange={(event) => onConfirmedChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        <Trans>
          I have reviewed the imported records and understand that missing
          records will not be copied.
        </Trans>
      </span>
    </label>
  </div>
)
