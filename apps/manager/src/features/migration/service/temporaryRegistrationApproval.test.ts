import { describe, expect, it } from 'vitest'
import {
  isDefinitelyUnsubmittedMigrationApprovalError,
  isExpectedMigrationApprovalRequest,
  isTemporaryRegistrationRecoveryScopeValid,
  registrationApprovalRecoveryDecision,
} from './temporaryRegistrationApproval'

describe('isTemporaryRegistrationRecoveryScopeValid', () => {
  const review = {
    chainId: 1,
    owner: '0x0000000000000000000000000000000000000001',
    contractAddress: '0x0000000000000000000000000000000000000002',
    operatorAddress: '0x0000000000000000000000000000000000000003',
    names: ['alice.eth', 'bob.eth'],
  } as const
  it.each([
    [review, true],
    [{ ...review, names: ['bob.eth', 'alice.eth'] }, true],
    [{ ...review, names: ['alice.eth'] }, false],
    [{ ...review, chainId: 11155111 }, false],
    [{ ...review, operatorAddress: review.owner }, false],
    [undefined, false],
  ])('keeps recovery bound to its reviewed scope: %o', (reviewed, expected) => {
    expect(
      isTemporaryRegistrationRecoveryScopeValid({
        strategy: 'temporary-operator',
        required: review,
        reviewed,
      }),
    ).toBe(expected)
  })
})

describe('isDefinitelyUnsubmittedMigrationApprovalError', () => {
  it.each([
    [{ _tag: 'ChainIdMismatchError' }, true],
    [{ cause: { _tag: 'SignerAddressMismatchError' } }, true],
    [{ cause: { name: 'ChainMismatchError' } }, true],
    [
      { _tag: 'TransactionSubmissionError', cause: new Error('response lost') },
      false,
    ],
    [new Error('network disconnected'), false],
    [undefined, false],
  ])(
    'only releases confirmed pre-submission failures: %o',
    (error, expected) => {
      expect(isDefinitelyUnsubmittedMigrationApprovalError(error)).toBe(
        expected,
      )
    },
  )
})

describe('registrationApprovalRecoveryDecision', () => {
  it.each([
    ['grant-pending', false, undefined, 'unresolved'],
    ['grant-pending', true, undefined, 'unresolved'],
    ['grant-pending', false, 'success', 'complete'],
    ['grant-pending', true, 'success', 'granted'],
    ['grant-pending', false, 'reverted', 'complete'],
    ['grant-pending', true, 'reverted', 'complete'],
    ['granted', false, undefined, 'complete'],
    ['granted', true, undefined, 'granted'],
    ['revoke-pending', false, undefined, 'complete'],
    ['revoke-pending', true, undefined, 'unresolved'],
    ['revoke-pending', true, 'reverted', 'granted'],
    ['revoke-pending', true, 'success', 'unresolved'],
  ] as const)(
    'resolves %s with permission %s and receipt %s as %s',
    (status, isActive, receiptStatus, expected) => {
      expect(
        registrationApprovalRecoveryDecision({
          status,
          isActive,
          receiptStatus,
        }),
      ).toBe(expected)
    },
  )
})

describe('isExpectedMigrationApprovalRequest', () => {
  const expected = {
    owner: '0x0000000000000000000000000000000000000001',
    contractAddress: '0x0000000000000000000000000000000000000002',
    chainId: 1,
    data: '0x1234',
  } as const
  const request = {
    from: expected.owner,
    to: expected.contractAddress,
    chainId: expected.chainId,
    data: expected.data,
    value: 0n,
  }

  it('accepts the exact account, chain, target, calldata and zero-value request', () => {
    expect(isExpectedMigrationApprovalRequest({ ...expected, request })).toBe(
      true,
    )
  })

  it.each([
    { from: expected.contractAddress },
    { to: expected.owner },
    { chainId: 11155111 },
    { data: '0x5678' },
    { value: 1n },
  ])(
    'rejects a recovered request with a different scope or call: %o',
    (override) => {
      expect(
        isExpectedMigrationApprovalRequest({
          ...expected,
          request: { ...request, ...override },
        }),
      ).toBe(false)
    },
  )
})
