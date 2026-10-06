import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Hex,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import { getEnsAddress } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertPrimaryNameForwardResolution,
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'

vi.mock('viem/actions', () => ({ getEnsAddress: vi.fn() }))

const owner = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const

describe('hasPrimaryNameForwardAddress', () => {
  it('accepts matching addresses regardless of casing', () => {
    expect(
      hasPrimaryNameForwardAddress(
        '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
        owner,
      ),
    ).toBe(true)
  })

  it.each([
    undefined,
    null,
    zeroAddress,
    '0x1111111111111111111111111111111111111111' as const,
  ])('does not authorize a primary claim for unverified address %s', (resolvedAddress) => {
    expect(hasPrimaryNameForwardAddress(resolvedAddress, owner)).toBe(false)
  })

  it('does not authorize a primary claim before the wallet is known', () => {
    expect(hasPrimaryNameForwardAddress(owner, undefined)).toBe(false)
  })
})

const resolverAbi = parseAbi([
  'error ResolverError(bytes errorData)',
  'error ResolverNotFound()',
  'error ResolverNotContract()',
  'error UnsupportedResolverProfile()',
  'error HttpError()',
])
const publicClient = {} as PublicClient
const wrappedRevert = (data: Hex) =>
  new BaseError('Resolution failed', {
    cause: new ContractFunctionRevertedError({
      abi: resolverAbi,
      functionName: 'resolveWithGateways',
      data,
    }),
  })

describe('getPrimaryNameForwardAddress', () => {
  beforeEach(() => {
    vi.mocked(getEnsAddress).mockReset()
  })

  it('reads the exact canonical name and coin type', async () => {
    vi.mocked(getEnsAddress).mockResolvedValue(owner)
    await expect(
      getPrimaryNameForwardAddress(publicClient, 'alice.eth'),
    ).resolves.toBe(owner)
    expect(getEnsAddress).toHaveBeenCalledWith(publicClient, {
      name: 'alice.eth',
      coinType: 60n,
      strict: true,
    })
  })

  it('treats an empty resolver revert as an unset record, but never authorizes a primary claim', async () => {
    vi.mocked(getEnsAddress).mockRejectedValue(
      wrappedRevert(
        encodeErrorResult({
          abi: resolverAbi,
          errorName: 'ResolverError',
          args: ['0x'],
        }),
      ),
    )
    await expect(
      getPrimaryNameForwardAddress(publicClient, 'alice.eth'),
    ).resolves.toBeNull()
    await expect(
      assertPrimaryNameForwardResolution(publicClient, 'alice.eth', owner),
    ).rejects.toThrow(/does not resolve to the owner/)
  })

  it.each([
    'ResolverNotFound',
    'ResolverNotContract',
    'UnsupportedResolverProfile',
  ] as const)('allows resolver setup after %s', async (errorName) => {
    vi.mocked(getEnsAddress).mockRejectedValue(
      wrappedRevert(encodeErrorResult({ abi: resolverAbi, errorName })),
    )
    await expect(
      getPrimaryNameForwardAddress(publicClient, 'alice.eth'),
    ).resolves.toBeNull()
  })

  it.each([
    new Error('RPC unavailable'),
    wrappedRevert(
      encodeErrorResult({ abi: resolverAbi, errorName: 'HttpError' }),
    ),
    wrappedRevert(
      encodeErrorResult({
        abi: resolverAbi,
        errorName: 'ResolverError',
        args: ['0x1234'],
      }),
    ),
  ])('propagates transport, gateway, and nonempty resolver errors', async (error) => {
    vi.mocked(getEnsAddress).mockRejectedValue(error)
    await expect(
      getPrimaryNameForwardAddress(publicClient, 'alice.eth'),
    ).rejects.toBe(error)
  })
})
