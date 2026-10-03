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

describe('readRegistrationSuccessState — edge cases', () => {
  it.each([
    [
      'infinite duration',
      { durationSeconds: Number.POSITIVE_INFINITY, paid: '$5.00' },
    ],
    [
      'negative-infinite duration',
      { durationSeconds: Number.NEGATIVE_INFINITY, paid: '$5.00' },
    ],
    ['numeric paid', { durationSeconds: 1, paid: 5 }],
    ['null paid', { durationSeconds: 1, paid: null }],
    ['null entry', { registrationSuccess: null }],
  ])('returns null for %s', (_label, entry) => {
    const state =
      entry && 'registrationSuccess' in entry
        ? entry
        : { registrationSuccess: entry }
    expect(readRegistrationSuccessState(state)).toBeNull()
  })

  it.each([
    ['a string', 'registrationSuccess'],
    ['a number', 1],
    ['a boolean', true],
  ])('returns null when the whole state is %s', (_label, state) => {
    expect(readRegistrationSuccessState(state)).toBeNull()
  })

  it('keeps only the two known fields, dropping anything else on the entry', () => {
    expect(
      readRegistrationSuccessState({
        registrationSuccess: {
          durationSeconds: 31557600,
          paid: '$5.00',
          name: 'someone-else.eth',
          owner: '0x0000000000000000000000000000000000000000',
        },
      }),
    ).toEqual({ durationSeconds: 31557600, paid: '$5.00' })
  })

  it('ignores router bookkeeping keys alongside the entry', () => {
    expect(
      readRegistrationSuccessState({
        __TSR_index: 3,
        __TSR_key: 'abc12',
        key: 'abc12',
        registrationSuccess: { durationSeconds: 1, paid: '$1.00' },
      }),
    ).toEqual({ durationSeconds: 1, paid: '$1.00' })
  })
})
