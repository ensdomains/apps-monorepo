import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { Signer } from '../../types/signer.types'
import { submitReverseUpdateActor } from './primaryName.actors'

describe('submitReverseUpdateActor', () => {
  it('rejects non-EOA signers', async () => {
    const signer = { type: 'rhinestone' } as unknown as Signer

    const result = await submitReverseUpdateActor({
      name: 'example.eth',
      signer,
      accountAddress: '0x0000000000000000000000000000000000000001' as Address,
      publicClient: {} as never,
      chainId: 11155111,
    })

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toMatch(/only supported for EOA/i)
  })
})
