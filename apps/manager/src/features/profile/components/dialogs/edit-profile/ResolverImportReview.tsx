import { Trans } from '@lingui/react/macro'

export const ResolverImportReview = ({
  warnings,
  confirmed,
  onConfirmedChange,
}: {
  readonly warnings: readonly string[]
  readonly confirmed: boolean
  readonly onConfirmedChange: (confirmed: boolean) => void
}) => (
  <div className="shrink-0 space-y-2 border-ens-quartz-200 border-b bg-ens-quartz-50 px-4 py-3 text-sm md:px-6">
    <p className="font-medium">
      <Trans>Review imported records</Trans>
    </p>
    <details>
      <summary className="cursor-pointer">
        <Trans>Some records may be missing</Trans>
      </summary>
      <ul className="max-h-32 list-disc space-y-1 overflow-y-auto py-2 pl-5 text-muted-foreground">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </details>
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        checked={confirmed}
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
