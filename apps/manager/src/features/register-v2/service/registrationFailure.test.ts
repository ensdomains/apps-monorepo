import { TransactionSubmissionError } from '@ens-apps/transaction-manager'
import {
  type Abi,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getRegistrationFailureMessage,
  isInvalidSignatureError,
  isNameNotAvailableError,
  isSessionRevokedFailure,
} from './registrationFailure'

const REGISTRAR = '0xa88553F454b77203B0D036A05c894d555EAAa2Cc'
const USDC = '0x768F42455A2D082E23ceeF7d51e5787C82d67a39'

const priceAbi = parseAbi([
  'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
])
const errorAbi = parseAbi(['error NameNotAvailable(string label)'])

const nameNotAvailableData = encodeErrorResult({
  abi: errorAbi,
  errorName: 'NameNotAvailable',
  args: ['pers4'],
})

// The shape viem throws for the price read in the reported failure: the
// registrar's error is missing from our ABI, so only the selector survives.
const priceReadRevert = (abi: Abi = priceAbi) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi,
      data: nameNotAvailableData,
      functionName: 'getRegisterPrice',
    }),
    {
      abi,
      contractAddress: REGISTRAR,
      args: ['pers4', 30758400n, USDC],
      functionName: 'getRegisterPrice',
    },
  )

describe('isNameNotAvailableError', () => {
  it('spots the revert when viem can only report its selector', () => {
    expect(isNameNotAvailableError(priceReadRevert())).toBe(true)
  })

  it('spots the revert when viem decoded it', () => {
    expect(
      isNameNotAvailableError(priceReadRevert([...priceAbi, ...errorAbi])),
    ).toBe(true)
  })

  it('spots the revert inside a wrapper that only kept the text', () => {
    const wrapped = new Error('Intent simulation failed', {
      cause: new Error(`execution reverted: ${nameNotAvailableData}`),
    })

    expect(isNameNotAvailableError(wrapped)).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isNameNotAvailableError(new Error('rpc down'))).toBe(false)
    expect(isNameNotAvailableError(undefined)).toBe(false)
    // The selector's digits inside an address are not the revert.
    expect(
      isNameNotAvailableError(new Error('sent from 0x12477707e8aa5b0c')),
    ).toBe(false)
  })
})

// The SDK error from the reported failure, trimmed to the fields we read.
const orchestratorRejection = (context: Record<string, unknown>) =>
  Object.assign(new Error('Simulation failed'), {
    errorType: 'Bad Request',
    statusCode: 400,
    context,
  })

describe('isInvalidSignatureError', () => {
  it.each([
    [
      'the orchestrator error by its category',
      orchestratorRejection({ category: 'INVALID_SIGNATURE' }),
    ],
    [
      'the orchestrator error by its selector',
      orchestratorRejection({ errorSelector: '0x8baa579f' }),
    ],
    [
      'the submission error the transport wraps it in',
      new TransactionSubmissionError(
        { type: 'eoa', from: REGISTRAR, chainId: 11155111, to: REGISTRAR },
        orchestratorRejection({ category: 'INVALID_SIGNATURE' }),
      ),
    ],
    [
      'a wrapper that only kept the text',
      new Error('Registration failed', {
        cause: new Error(
          'Failed to submit transaction: Simulation failed: InvalidSignature()',
        ),
      }),
    ],
  ])('spots %s', (_, error) => {
    expect(isInvalidSignatureError(error)).toBe(true)
  })

  it.each([
    [
      'another orchestrator category',
      orchestratorRejection({ category: 'INSUFFICIENT_BALANCE' }),
    ],
    ['a plain failure', new Error('rpc down')],
    [
      'an address that starts with the selector digits',
      new Error('sent from 0x8baa579f2c4e6a8b'),
    ],
    ['no error', undefined],
  ])('ignores %s', (_, error) => {
    expect(isInvalidSignatureError(error)).toBe(false)
  })
})

describe('isSessionRevokedFailure', () => {
  it.each([
    [true, true, true],
    // A refused signature without a reset here is some other policy failure.
    [false, true, false],
    // A reset here, but the run failed for another reason.
    [true, false, false],
    [false, false, false],
  ])(
    'reset %s, signature rejected %s → %s',
    (isSessionAccessReset, isSignatureRejected, expected) => {
      expect(
        isSessionRevokedFailure({ isSessionAccessReset, isSignatureRejected }),
      ).toBe(expected)
    },
  )
})

describe('getRegistrationFailureMessage', () => {
  it('drops the contract call, docs link and version viem appends', () => {
    const error = priceReadRevert()
    const message = getRegistrationFailureMessage(error)

    expect(error.message).toMatch(/Docs: https:\/\/viem\.sh/)
    expect(message).toMatch(/getRegisterPrice/)
    expect(message).not.toMatch(/Contract Call|Docs:|Version:|args:/)
  })

  it('keeps a plain error message as it is', () => {
    expect(getRegistrationFailureMessage(new Error('Account not ready'))).toBe(
      'Account not ready',
    )
  })

  it('has nothing to say without an error', () => {
    expect(getRegistrationFailureMessage(undefined)).toBeUndefined()
  })
})
