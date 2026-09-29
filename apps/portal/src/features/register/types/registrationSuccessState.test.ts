import { describe, expect, it } from 'vitest'
import { readRegistrationSuccessState } from './registrationSuccessState'

describe('readRegistrationSuccessState', () => {
  it('reads a well-formed entry', () => {
    expect(
      readRegistrationSuccessState({
        registrationSuccess: { durationSeconds: 31536000, paid: '$5.00' },
      }),
    ).toEqual({ durationSeconds: 31536000, paid: '$5.00' })
  })

  it.each([
    ['no state', undefined],
    ['null state', null],
    ['unrelated state', { somethingElse: true }],
    ['non-object entry', { registrationSuccess: 'true' }],
    ['missing paid', { registrationSuccess: { durationSeconds: 1 } }],
    ['missing duration', { registrationSuccess: { paid: '$5.00' } }],
    [
      'non-numeric duration',
      { registrationSuccess: { durationSeconds: '1', paid: '$5.00' } },
    ],
    [
      'non-finite duration',
      { registrationSuccess: { durationSeconds: Number.NaN, paid: '$5.00' } },
    ],
  ])('returns null for %s', (_label, state) => {
    expect(readRegistrationSuccessState(state)).toBeNull()
  })
})
