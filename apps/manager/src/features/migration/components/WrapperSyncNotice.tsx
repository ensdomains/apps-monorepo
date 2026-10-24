import { Trans } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import type { ClassifiedName } from '../service/classifyNames'

export const WrapperSyncNotice = ({
  names,
  isPending,
  error,
  onSync,
}: {
  readonly names: readonly ClassifiedName[]
  readonly isPending: boolean
  readonly error: Error | null
  readonly onSync: () => void
}) => {
  if (names.length === 0) return null
  return (
    <section
      aria-busy={isPending}
      className="flex w-full max-w-189 flex-col gap-3 rounded-md border border-ens-lapis-core/20 p-4 text-sm leading-5"
    >
      <div>
        <h2 className="font-medium">
          <Trans>Sync names before upgrading</Trans>
        </h2>
        <p className="mt-1">
          <Trans>
            Update these names&apos; wrapped expiry to make them available for
            upgrade. A network fee applies.
          </Trans>
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {names.map(({ domain }) => (
          <li className="break-all font-medium" key={domain.id}>
            {domain.name}
          </li>
        ))}
      </ul>
      {error && (
        <p className="text-ens-garnet-900" role="alert">
          {error.message}
        </p>
      )}
      <Button
        className="min-h-11 self-start"
        disabled={isPending}
        onClick={onSync}
        type="button"
        variant="outline"
      >
        {isPending ? <Trans>Syncing names…</Trans> : <Trans>Sync names</Trans>}
      </Button>
    </section>
  )
}
