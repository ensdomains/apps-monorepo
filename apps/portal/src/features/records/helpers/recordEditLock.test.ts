import { describe, expect, it } from 'vitest'
import { getRecordEditLock } from './recordEditLock'

const FUSED = { cannotSetResolver: true, cannotUnwrap: true }

describe('getRecordEditLock', () => {
  it('locks a name whose resolver refuses the owner and whose fuses block recovery', () => {
    expect(getRecordEditLock({ fuses: FUSED, canWriteOnResolver: false })).toBe(
      'resolver-locked',
    )
  })

  // Unknown writability must not take the editor from someone who can use it.
  it.each([
    ['the resolver accepts the write', FUSED, true],
    ['writability is unknown', FUSED, undefined],
    [
      'the resolver can still be replaced',
      { ...FUSED, cannotSetResolver: false },
      false,
    ],
    [
      'the name can still be unwrapped',
      { ...FUSED, cannotUnwrap: false },
      false,
    ],
    ['the name is not wrapped', undefined, false],
  ] as const)('does not lock when %s', (_, fuses, canWriteOnResolver) => {
    expect(getRecordEditLock({ fuses, canWriteOnResolver })).toBeUndefined()
  })
})
