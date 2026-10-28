import { describe, expect, it } from 'vitest'
import { canEditProfileHere } from './profileEditability'

describe('canEditProfileHere', () => {
  const editable = {
    canEditRecords: true,
    hasRecords: true,
    isInGrace: false,
    isUpgradeRequired: false,
    name: 'alice.eth',
    protocol: 'v2',
  } as const

  it.each([
    { change: {}, expected: true },
    // Unknown records must not seed an editor that would overwrite them.
    { change: { hasRecords: false }, expected: false },
  ])('is $expected with $change', ({ change, expected }) => {
    expect(canEditProfileHere({ ...editable, ...change })).toBe(expected)
  })
})
