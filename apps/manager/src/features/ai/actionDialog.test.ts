import { describe, expect, it } from 'vitest'
import { resolveAiDialog } from './actionDialog'

const ready = {
  requested: 'auto' as const,
  isOriginalActionReady: true,
  hasMultipleActions: false,
  canOpenProfile: true,
}

describe('AI action dialogs', () => {
  it('opens the existing primary and profile dialogs for complete requests', () => {
    expect(resolveAiDialog({ ...ready, intent: 'set_primary' })).toBe('primary')
    expect(resolveAiDialog({ ...ready, intent: 'edit_profile' })).toBe(
      'profile',
    )
  })

  it('keeps loading, missing details, and multiple actions in review', () => {
    expect(
      resolveAiDialog({
        ...ready,
        intent: 'edit_profile',
        canOpenProfile: false,
      }),
    ).toBe('review')
    expect(
      resolveAiDialog({
        ...ready,
        intent: 'edit_profile',
        isOriginalActionReady: false,
      }),
    ).toBe('review')
    expect(
      resolveAiDialog({
        ...ready,
        intent: 'set_primary',
        hasMultipleActions: true,
      }),
    ).toBe('review')
    expect(resolveAiDialog({ ...ready, intent: 'find_names' })).toBe('review')
  })

  it('does not reopen a dismissed request when data or interpretation arrives', () => {
    expect(
      resolveAiDialog({ ...ready, intent: 'edit_profile', requested: null }),
    ).toBeNull()
    expect(
      resolveAiDialog({ ...ready, intent: 'set_primary', requested: null }),
    ).toBeNull()
  })

  it.each([
    'auto',
    'primary',
    'profile',
    'bulk',
  ] as const)('keeps an uncertain candidate in review even when %s was requested', (requested) => {
    expect(
      resolveAiDialog({
        ...ready,
        requested,
        intent: 'set_primary',
        requiresConfirmation: true,
      }),
    ).toBe('review')
  })

  it('does not reopen a dismissed confirmation', () => {
    expect(
      resolveAiDialog({
        ...ready,
        requested: null,
        requiresConfirmation: true,
      }),
    ).toBeNull()
  })

  it('stays in review after confirming an interpretation', () => {
    expect(
      resolveAiDialog({
        ...ready,
        requested: 'review',
        intent: 'edit_profile',
        requiresConfirmation: false,
      }),
    ).toBe('review')
  })

  it('preserves the explicitly chosen dialog', () => {
    expect(
      resolveAiDialog({
        ...ready,
        intent: 'edit_profile',
        requested: 'review',
      }),
    ).toBe('review')
    expect(
      resolveAiDialog({ ...ready, intent: 'bulk_renew', requested: 'bulk' }),
    ).toBe('bulk')
  })
})
