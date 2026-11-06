import { describe, expect, it } from 'vitest'
import { getProfileActionsPlacement } from './profileActionsPlacement'

describe('getProfileActionsPlacement', () => {
  const settledVisitor = {
    hasFloatingBar: false,
    isAccountPending: false,
    isCopySourcePending: false,
    isOwner: false,
    isWriteAccessPending: false,
  } as const

  it.each([
    { case: 'a visitor', change: {}, expected: 'header' },
    {
      case: 'a visitor while write access is read',
      change: { isWriteAccessPending: true },
      expected: 'header',
    },
    {
      case: 'an owner who cannot edit',
      change: { isOwner: true },
      expected: 'bar',
    },
    {
      case: 'an owner while write access is read',
      change: { isOwner: true, isWriteAccessPending: true },
      expected: 'none',
    },
    {
      case: 'an owner while the copy source is read',
      change: { isOwner: true, isCopySourcePending: true },
      expected: 'none',
    },
    {
      case: 'anyone with the editor bar',
      change: { hasFloatingBar: true },
      expected: 'bar',
    },
    {
      case: 'a wallet still reconnecting',
      change: { isAccountPending: true },
      expected: 'none',
    },
    {
      case: 'an owner still loading',
      change: { isOwner: undefined },
      expected: 'none',
    },
  ])('is $expected for $case', ({ change, expected }) => {
    expect(getProfileActionsPlacement({ ...settledVisitor, ...change })).toBe(
      expected,
    )
  })
})
