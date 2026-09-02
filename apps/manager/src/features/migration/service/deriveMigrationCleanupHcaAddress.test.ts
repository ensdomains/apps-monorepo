import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { deriveMigrationCleanupHcaAddress } from './deriveMigrationCleanupHcaAddress'

const OWNER = '0x2222222222222222222222222222222222222222' as Address

describe('deriveMigrationCleanupHcaAddress', () => {
  it('uses the deterministic migration HCA even when only the owner is available', () => {
    const hca = deriveMigrationCleanupHcaAddress({
      chainId: sepolia.id,
      ownerAddress: OWNER,
    })

    expect(hca).toBe('0x29fBA8EAfc3a898B48a314182Ea5c93ce5734DBd')
    expect(hca?.toLowerCase()).not.toBe(OWNER.toLowerCase())
  })

  it('does not invent a cleanup target without a supported chain and owner', () => {
    expect(
      deriveMigrationCleanupHcaAddress({
        chainId: undefined,
        ownerAddress: OWNER,
      }),
    ).toBeUndefined()
    expect(
      deriveMigrationCleanupHcaAddress({
        chainId: sepolia.id,
        ownerAddress: undefined,
      }),
    ).toBeUndefined()
    expect(
      deriveMigrationCleanupHcaAddress({
        chainId: 1,
        ownerAddress: OWNER,
      }),
    ).toBeUndefined()
  })
})
