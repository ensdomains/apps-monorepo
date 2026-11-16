import { UserRejectedRequestError } from 'viem'
import { expect, it } from 'vitest'
import { shouldVerifyRegistrationOutcome } from './shouldVerifyRegistrationOutcome'

const rejection = new UserRejectedRequestError(new Error('Declined'))

it.each([
  { stage: 'reverted', context: { hash: '0x1234' }, expected: false },
  { stage: 'preparation', context: {}, expected: false },
  { stage: 'validation', context: {}, expected: false },
  { stage: 'cancelled', context: {}, expected: false },
  { stage: 'cancelled', context: { hash: '0x1234' }, expected: true },
  { stage: 'submission', context: { error: rejection }, expected: false },
  {
    stage: 'submission',
    context: { error: rejection, callsId: 'accepted-bundle' },
    expected: true,
  },
  {
    stage: 'submission',
    context: { error: new Error('Connection lost while submitting') },
    expected: true,
  },
  { stage: 'timeout', context: { hash: '0x1234' }, expected: true },
  { stage: 'unknown', context: {}, expected: true },
])(
  'verifies $stage with $context: $expected',
  ({ stage, context, expected }) => {
    expect(
      shouldVerifyRegistrationOutcome({ value: { error: stage }, context }),
    ).toBe(expected)
  },
)
