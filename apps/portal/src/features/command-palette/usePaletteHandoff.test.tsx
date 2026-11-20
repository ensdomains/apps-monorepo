import { render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type PaletteHandoffReadiness, paletteHandoff } from './handoff'
import { usePaletteHandoff } from './usePaletteHandoff'

const Consumer = ({
  readiness,
  onOpen,
}: {
  readonly readiness: PaletteHandoffReadiness
  readonly onOpen: () => void
}) => {
  usePaletteHandoff({
    kind: 'renew',
    name: 'alice.eth',
    chainId: 1,
    readiness,
    onOpen,
  })
  return null
}

afterEach(() => paletteHandoff.cancel())

describe('usePaletteHandoff', () => {
  it('waits for the owning feature and accepts the intent once under Strict Mode', async () => {
    const onOpen = vi.fn()
    const requestId = paletteHandoff.prepare({
      kind: 'renew',
      name: 'alice.eth',
      chainId: 1,
    })
    const view = render(
      <StrictMode>
        <Consumer readiness="checking" onOpen={onOpen} />
      </StrictMode>,
    )

    expect(onOpen).not.toHaveBeenCalled()
    expect(paletteHandoff.getSnapshot().pending?.requestId).toBe(requestId)
    view.rerender(
      <StrictMode>
        <Consumer readiness="ready" onOpen={onOpen} />
      </StrictMode>,
    )

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    view.rerender(
      <StrictMode>
        <Consumer readiness="ready" onOpen={onOpen} />
      </StrictMode>,
    )
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(paletteHandoff.getSnapshot().pending).toBeNull()
  })

  it('reports a failed eligibility check without opening a workflow or retaining stale intent', async () => {
    const onOpen = vi.fn()
    const requestId = paletteHandoff.prepare({
      kind: 'renew',
      name: 'alice.eth',
      chainId: 1,
    })
    render(
      <Consumer
        readiness={{ reason: 'Could not check renewal. Retry.' }}
        onOpen={onOpen}
      />,
    )

    await waitFor(() =>
      expect(paletteHandoff.getSnapshot().outcome).toEqual({
        requestId,
        status: 'blocked',
        reason: 'Could not check renewal. Retry.',
      }),
    )
    expect(onOpen).not.toHaveBeenCalled()
    expect(paletteHandoff.getSnapshot().pending).toBeNull()
  })
})
