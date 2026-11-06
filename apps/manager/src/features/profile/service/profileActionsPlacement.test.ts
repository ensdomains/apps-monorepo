import { describe, expect, it } from 'vitest'
import { shouldShowHeaderActions } from './profileActionsPlacement'

describe('shouldShowHeaderActions', () => {
  const settledVisitor = {
    hasFloatingBar: false,
    isAccountPending: false,
    isCopySourcePending: false,
    isOwner: false,
    isWriteAccessPending: false,
  } as const

  it.each([
    { case: 'a visitor', change: {}, expected: true },
    {
      case: 'a visitor while write access is read',
      change: { isWriteAccessPending: true },
      expected: true,
    },
    {
      case: 'an owner who cannot edit',
      change: { isOwner: true },
      expected: true,
    },
    {
      case: 'an owner while write access is read',
      change: { isOwner: true, isWriteAccessPending: true },
      expected: false,
    },
    {
      case: 'an owner while the copy source is read',
      change: { isOwner: true, isCopySourcePending: true },
      expected: false,
    },
    {
      case: 'anyone with the profile bar',
      change: { hasFloatingBar: true },
      expected: false,
    },
    {
      case: 'a wallet still reconnecting',
      change: { isAccountPending: true },
      expected: false,
    },
    {
      case: 'an owner still loading',
      change: { isOwner: undefined },
      expected: false,
    },
  ])('is $expected for $case', ({ change, expected }) => {
    expect(shouldShowHeaderActions({ ...settledVisitor, ...change })).toBe(
      expected,
    )
  })
})
