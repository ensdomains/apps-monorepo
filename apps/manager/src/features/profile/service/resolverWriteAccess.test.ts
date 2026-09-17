import type { Address } from 'viem'
import {
  ContractFunctionExecutionError,
  ExecutionRevertedError,
  toFunctionSelector,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { getResolverWriteAccess } = await import('./resolverWriteAccess')

const supportsNameSetters = (supported: boolean) =>
  client.multicall.mockResolvedValue([{ status: 'success', result: supported }])

const probedSelector = () =>
  (client.call.mock.calls[0]?.[0] as { data: string }).data.slice(0, 10)

beforeEach(() => {
  client.multicall.mockReset()
  client.call.mockReset()
})

describe('getResolverWriteAccess', () => {
  // The probe must dry-run the same calldata the write sends; otherwise a
  // resolver passes the check and the save reverts.
  it('probes a PermissionedResolver with the name-based setter', async () => {
    supportsNameSetters(true)
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteAccess('leon.eth', OWNER)

    expect(result._unsafeUnwrap()).toBe(true)
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

    const result = await getResolverWriteAccess('leon.eth', OWNER)

    expect(result._unsafeUnwrap()).toBe(true)
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

    const result = await getResolverWriteAccess('leon.eth', OWNER)

    expect(result._unsafeUnwrap()).toBe(false)
  })

  it('surfaces a non-revert failure instead of reporting no access', async () => {
    supportsNameSetters(true)
    client.call.mockRejectedValue(new Error('rpc down'))

    const result = await getResolverWriteAccess('leon.eth', OWNER)

    expect(result.isErr()).toBe(true)
  })
})
