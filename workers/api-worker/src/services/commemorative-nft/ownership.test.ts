import {
  BaseError,
  ContractFunctionRevertedError,
  type PublicClient,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { readCommemorativeNftOwnership } from './ownership.js'

const CONTRACT = '0xe49A9D706FCD82AA575496352B5633F80fBBC449'

const makeClient = (readContract: PublicClient['readContract']): PublicClient =>
  ({ readContract }) as unknown as PublicClient

describe('commemorative NFT ownership', () => {
  it('reads ownerOf from the configured contract', async () => {
    const readContract = vi.fn(
      async () => '0x1111111111111111111111111111111111111111' as const,
    ) as unknown as PublicClient['readContract']

    await expect(
      readCommemorativeNftOwnership(makeClient(readContract), CONTRACT, '42'),
    ).resolves.toBe('minted')
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: CONTRACT,
        args: [42n],
        functionName: 'ownerOf',
      }),
    )
  })

  it('maps a contract revert to unminted and transport errors to unavailable', async () => {
    const reverted = new ContractFunctionRevertedError({
      abi: [],
      functionName: 'ownerOf',
      message: 'ERC721NonexistentToken',
    })
    const revertedClient = makeClient(
      vi.fn(async () => {
        throw new BaseError('ownerOf reverted', { cause: reverted })
      }) as unknown as PublicClient['readContract'],
    )
    await expect(
      readCommemorativeNftOwnership(revertedClient, CONTRACT, '42'),
    ).resolves.toBe('unminted')

    const unavailableClient = makeClient(
      vi.fn(async () => {
        throw new Error('RPC unavailable')
      }) as unknown as PublicClient['readContract'],
    )
    await expect(
      readCommemorativeNftOwnership(unavailableClient, CONTRACT, '42'),
    ).resolves.toBe('unavailable')
  })
})
