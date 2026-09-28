import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRequestedProfileDialogOpen } from './useRequestedProfileDialogOpen'

type DialogState = {
  requestedOpen: boolean | undefined
  open: boolean
}

describe('profile dialog launcher requests', () => {
  it('notifies the launcher when saving closes the actor without reopening', () => {
    const handleOpenChange = vi.fn()
    const onOpenChange = vi.fn()
    const { rerender } = renderHook(
      (state: DialogState) =>
        useRequestedProfileDialogOpen({
          ...state,
          handleOpenChange,
          onOpenChange,
        }),
      { initialProps: { requestedOpen: true, open: false } },
    )

    expect(handleOpenChange).toHaveBeenCalledExactlyOnceWith(true)
    rerender({ requestedOpen: true, open: true })
    // Save completion is an internal actor transition, before the parent
    // learns that the dialog has closed.
    rerender({ requestedOpen: true, open: false })
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
    expect(handleOpenChange).toHaveBeenCalledTimes(1)

    rerender({ requestedOpen: false, open: false })
    rerender({ requestedOpen: true, open: false })
    expect(handleOpenChange).toHaveBeenCalledTimes(2)
    expect(handleOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('keeps a cancelled dialog closed until a new launch request', () => {
    const handleOpenChange = vi.fn()
    const onOpenChange = vi.fn()
    const { rerender } = renderHook(
      (state: DialogState) =>
        useRequestedProfileDialogOpen({
          ...state,
          handleOpenChange,
          onOpenChange,
        }),
      { initialProps: { requestedOpen: true, open: true } },
    )

    rerender({ requestedOpen: false, open: true })
    expect(handleOpenChange).toHaveBeenCalledExactlyOnceWith(false)
    rerender({ requestedOpen: false, open: false })
    rerender({ requestedOpen: false, open: false })
    expect(handleOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('leaves an editor without a launcher under actor control', () => {
    const handleOpenChange = vi.fn()
    const onOpenChange = vi.fn()
    const { rerender } = renderHook(
      (state: DialogState) =>
        useRequestedProfileDialogOpen({
          ...state,
          handleOpenChange,
          onOpenChange,
        }),
      { initialProps: { requestedOpen: undefined, open: false } },
    )

    rerender({ requestedOpen: undefined, open: true })
    rerender({ requestedOpen: undefined, open: false })
    expect(handleOpenChange).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
