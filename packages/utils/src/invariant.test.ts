import { describe, expect, expectTypeOf, it } from 'vitest'
import { InvariantViolation, invariant } from './invariant'

const signerOrNothing = (isSet: boolean): string | undefined =>
  isSet ? '0xsigner' : undefined

describe('invariant', () => {
  it('returns when the condition holds', () => {
    expect(() => invariant(1, 'one is truthy')).not.toThrow()
  })

  it('throws an InvariantViolation that carries the message', () => {
    const broken = () => invariant(0, 'the count is never zero here')

    expect(broken).toThrow(InvariantViolation)
    expect(broken).toThrow(
      expect.objectContaining({
        _tag: 'InvariantViolation',
        name: 'InvariantViolation',
        message: 'the count is never zero here',
      }),
    )
  })

  it('narrows the condition after the call', () => {
    const signer = signerOrNothing(true)
    invariant(signer, 'the signer is set before this step')

    expectTypeOf(signer).toEqualTypeOf<string>()
  })
})
