import { Trans } from '@lingui/react/macro'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MSymbol } from '@/components/ui/material-symbol'
import type { useNftVideoDownload } from './useNftVideoDownload'

export const NftVideoDownloadAction = ({
  video: { state, available, download, cancel },
}: {
  readonly video: ReturnType<typeof useNftVideoDownload>
}) => {
  const pending = state.status !== 'idle'

  return (
    <DropdownMenuItem
      aria-busy={pending}
      disabled={!available}
      onSelect={(event) => {
        event.preventDefault()
        if (pending) cancel()
        else void download()
      }}
    >
      <MSymbol
        aria-hidden
        className="text-lg"
        symbol={pending ? 'close' : 'movie'}
      />
      <span aria-live="polite" className="tabular-nums">
        {state.status === 'idle' ? (
          <Trans>Download video</Trans>
        ) : state.status === 'preparing' ? (
          <Trans>Cancel video export</Trans>
        ) : (
          <Trans>Cancel video export ({state.progress}%)</Trans>
        )}
      </span>
    </DropdownMenuItem>
  )
}
