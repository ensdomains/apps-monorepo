import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MSymbol } from '@/components/ui/material-symbol'
import type { useNftVideoDownload } from './useNftVideoDownload'

export const NftVideoDownloadAction = ({
  video: { state, isAvailable, download, cancel },
}: {
  readonly video: ReturnType<typeof useNftVideoDownload>
}) => {
  const isPending = state.status !== 'idle'

  return (
    <DropdownMenuItem
      aria-busy={isPending}
      disabled={!isAvailable}
      onSelect={(event) => {
        event.preventDefault()
        if (isPending) cancel()
        else void download()
      }}
    >
      <MSymbol
        aria-hidden
        className="text-lg"
        symbol={isPending ? 'close' : 'movie'}
      />
      <span aria-live="polite" className="tabular-nums">
        {match(state)
          .with({ status: 'idle' }, () => <Trans>Download video</Trans>)
          .with({ status: 'preparing' }, () => (
            <Trans>Cancel video export</Trans>
          ))
          .with({ status: 'rendering' }, (state) => (
            <Trans>Cancel video export ({state.progress}%)</Trans>
          ))
          .exhaustive()}
      </span>
    </DropdownMenuItem>
  )
}
