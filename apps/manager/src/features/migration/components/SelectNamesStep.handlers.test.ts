import { describe, expect, it, vi } from 'vitest'
import { startSelectNamesAction } from './SelectNamesStep.handlers'

describe('startSelectNamesAction', () => {
  it('starts grace renewal instead of upgrade when selected grace names exist', async () => {
    const setIsStarting = vi.fn()
    const onRenewGrace = vi.fn(async () => true)
    const onUpgrade = vi.fn(async () => true)

    await startSelectNamesAction({
      isDisabled: false,
      onRenewGrace,
      onUpgrade,
      selectedGraceNames: ['grace.eth'],
      setIsStarting,
    })

    expect(onRenewGrace).toHaveBeenCalledWith(['grace.eth'])
    expect(onUpgrade).not.toHaveBeenCalled()
  })

  it('starts upgrade when no selected grace names exist', async () => {
    const setIsStarting = vi.fn()
    const onRenewGrace = vi.fn(async () => true)
    const onUpgrade = vi.fn(async () => true)

    await startSelectNamesAction({
      isDisabled: false,
      onRenewGrace,
      onUpgrade,
      selectedGraceNames: [],
      setIsStarting,
    })

    expect(onUpgrade).toHaveBeenCalled()
    expect(onRenewGrace).not.toHaveBeenCalled()
  })
})
