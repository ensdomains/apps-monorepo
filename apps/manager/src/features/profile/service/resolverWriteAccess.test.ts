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
  client.multicall.mockResolvedValue([{ status: 'success', result: supported }])

const probedSelector = () =>
  (client.call.mock.calls[0]?.[0] as { data: string }).data.slice(0, 10)

beforeEach(() => {
  client.multicall.mockReset()
  client.call.mockReset()
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

  it('reports no access when the dry run reverts', async () => {
    supportsNameSetters(false)
    client.call.mockRejectedValue(
      new ContractFunctionExecutionError(new ExecutionRevertedError(), {
        abi: [],
        functionName: 'setAddr',
      }),
    )

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(false)
  })

  it('surfaces a non-revert failure instead of reporting no access', async () => {
    supportsNameSetters(true)
    client.call.mockRejectedValue(new Error('rpc down'))

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result.isErr()).toBe(true)
  })
})
it('reports no resolver as not writable with no address', async () => {
  vi.mocked(getProfileEthAddressSnapshot).mockReturnValueOnce(
    okAsync({ resolverAddress: undefined, ethAddress: undefined }),
  )

  const result = await getResolverWriteState('pookie.eth', OWNER)

  expect(result._unsafeUnwrap()).toEqual({
    resolverAddress: undefined,
    canWrite: false,
  })
  expect(client.call).not.toHaveBeenCalled()
})

it('reports the resolver address alongside a successful probe', async () => {
  client.multicall.mockResolvedValue([{ status: 'success', result: false }])
  client.call.mockResolvedValue({ data: '0x' })

  const result = await getResolverWriteState('pookie.eth', OWNER)

  expect(result._unsafeUnwrap()).toEqual({
    resolverAddress: RESOLVER,
    canWrite: true,
  })
})
