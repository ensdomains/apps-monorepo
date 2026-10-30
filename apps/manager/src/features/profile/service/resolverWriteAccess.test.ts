import { getResolver } from '@ensdomains/ensjs/public'
import { okAsync } from 'neverthrow'
import type { Address } from 'viem'
import {
  ContractFunctionExecutionError,
  ExecutionRevertedError,
  toFunctionSelector,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProfileEthAddressSnapshot } from './profileEthAddress'

const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const OWNER = '0x1111111111111111111111111111111111111111' as Address

const client = vi.hoisted(() => ({
  multicall: vi.fn(),
  call: vi.fn(),
}))

vi.mock('@/lib/wagmi', () => ({ publicClient: client }))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok(client) }
})

vi.mock('@ensdomains/ensjs/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ensdomains/ensjs/public')>()),
  getResolver: vi.fn(),
}))

vi.mock('./profileEthAddress', async () => {
  const { okAsync } = await import('neverthrow')
  return {
    getProfileEthAddressSnapshot: vi.fn(() =>
      okAsync({ resolverAddress: RESOLVER, ethAddress: null }),
    ),
  }
})

const { getResolverWriteState } = await import('./resolverWriteAccess')

const supportsNameSetters = (supported: boolean) =>
  client.multicall.mockResolvedValueOnce([
    { status: 'success', result: supported },
  ])

const probedSelector = () => {
  const call = client.call.mock.calls[0]
  if (!call) throw new Error('expected the resolver to be probed via call')
  return (call[0] as { data: string }).data.slice(0, 10)
}

const revert = () =>
  new ContractFunctionExecutionError(new ExecutionRevertedError(), {
    abi: [],
    functionName: 'setAddr',
  })

/** The ERC-165 answers of the resolver-validity probe. */
const answersAsResolver = (isResolver: boolean) =>
  client.multicall.mockResolvedValueOnce([
    { status: 'failure', error: revert() },
    { status: 'success', result: false },
    { status: 'success', result: false },
    { status: 'success', result: false },
    { status: 'success', result: isResolver },
  ])

beforeEach(() => {
  client.multicall.mockReset()
  client.call.mockReset()
  vi.mocked(getResolver).mockReset()
})

describe('getResolverWriteState', () => {
  // The probe must dry-run the same calldata the write sends; otherwise a
  // resolver passes the check and the save reverts.
  it('probes a PermissionedResolver with the name-based setter', async () => {
    supportsNameSetters(true)
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(true)
    expect(client.call).toHaveBeenCalledWith(
      expect.objectContaining({ account: OWNER, to: RESOLVER }),
    )
    expect(probedSelector()).toBe(
      toFunctionSelector('setAddress(bytes,uint256,bytes)'),
    )
  })

  it('probes a public or legacy resolver with the node-based setter', async () => {
    supportsNameSetters(false)
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(true)
    expect(probedSelector()).toBe(
      toFunctionSelector('setAddr(bytes32,uint256,bytes)'),
    )
  })

  // A resolver the wallet cannot write is either someone else's working
  // resolver or not a resolver at all; only the second is invalid.
  it.each([
    { isResolver: true, isResolverInvalid: false },
    { isResolver: false, isResolverInvalid: true },
  ])(
    'reports no access when the dry run reverts (resolver: $isResolver)',
    async ({ isResolver, isResolverInvalid }) => {
      supportsNameSetters(false)
      client.call.mockRejectedValue(revert())
      answersAsResolver(isResolver)

      const result = await getResolverWriteState('leon.eth', OWNER)

      expect(result._unsafeUnwrap()).toEqual({
        resolverAddress: RESOLVER,
        canWrite: false,
        isResolverInvalid,
      })
    },
  )

  it('surfaces a non-revert failure instead of reporting no access', async () => {
    supportsNameSetters(true)
    client.call.mockRejectedValue(new Error('rpc down'))

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result.isErr()).toBe(true)
  })
  it('reports no resolver as not writable with no address', async () => {
    vi.mocked(getProfileEthAddressSnapshot).mockReturnValueOnce(
      okAsync({ resolverAddress: undefined, ethAddress: undefined }),
    )
    vi.mocked(getResolver).mockResolvedValueOnce(null)

    const result = await getResolverWriteState('pookie.eth', OWNER)

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: undefined,
      canWrite: false,
      isResolverInvalid: false,
    })
    expect(client.call).not.toHaveBeenCalled()
  })

  // The UniversalResolver reports no resolver for a pointer that is not a
  // contract, so the name would otherwise read as having none.
  it('flags a resolver pointer that is a wallet address as invalid', async () => {
    vi.mocked(getProfileEthAddressSnapshot).mockReturnValueOnce(
      okAsync({ resolverAddress: undefined, ethAddress: undefined }),
    )
    vi.mocked(getResolver).mockResolvedValueOnce(OWNER)
    answersAsResolver(false)

    const result = await getResolverWriteState('pookie.eth', OWNER)

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: OWNER,
      canWrite: false,
      isResolverInvalid: true,
    })
    expect(client.call).not.toHaveBeenCalled()
  })

  it('surfaces a failed resolver-validity read instead of guessing', async () => {
    supportsNameSetters(false)
    client.call.mockRejectedValue(revert())
    client.multicall.mockRejectedValueOnce(new Error('rpc down'))

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result.isErr()).toBe(true)
  })

  it('reports the resolver address alongside a successful probe', async () => {
    supportsNameSetters(false)
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteState('pookie.eth', OWNER)

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: RESOLVER,
      canWrite: true,
      isResolverInvalid: false,
    })
    // A writable resolver is working; it is not probed again.
    expect(client.multicall).toHaveBeenCalledTimes(1)
  })
})
