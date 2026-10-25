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
  isNameNotAvailableError,
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
