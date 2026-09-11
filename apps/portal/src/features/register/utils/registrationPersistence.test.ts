import {
  buildRegistrationRecord,
  type Signer,
} from '@ens-apps/transaction-manager'
import type { Address, Hash, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  clearStoredRegistration,
  createRegistrationPersistenceAdapter,
  loadStoredRegistration,
} from './registrationPersistence'

const OWNER = '0x1111111111111111111111111111111111111111' as Address

const record = () =>
  buildRegistrationRecord(
    'commitmentCooldown',
    {
      chainId: 11155111,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'eoa' } as unknown as Signer,
      accountAddress: OWNER,
      ownerAddress: OWNER,
      commitment: {
        commitment: `0x${'ab'.repeat(32)}` as Hash,
        secret: `0x${'cd'.repeat(32)}` as Hex,
      },
    },
    1,
  )

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
  }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('registration persistence', () => {
  it('round-trips a record, bigints and the commitment secret included', () => {
    const storage = memoryStorage()
    const saved = record()

    createRegistrationPersistenceAdapter(storage).save(saved)

    // The secret is unrecoverable: losing it means paying for a second commit.
    expect(loadStoredRegistration(storage)).toEqual(saved)
  })

  it('reads nothing from empty storage', () => {
    expect(loadStoredRegistration(memoryStorage())).toBeNull()
  })

  it('discards a record the package codec rejects', () => {
    const storage = memoryStorage()
    createRegistrationPersistenceAdapter(storage).save(record())
    const [key] = storage.items.keys()
    storage.items.set(key, '{"not":"a record"}')

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('clears the record', () => {
    const storage = memoryStorage()
    createRegistrationPersistenceAdapter(storage).save(record())

    clearStoredRegistration(storage)

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('never throws when storage does', () => {
    // A private-mode browser costs the user resume, not the registration.
    const adapter = createRegistrationPersistenceAdapter(throwingStorage)

    expect(() => adapter.save(record())).not.toThrow()
    expect(() => adapter.clear()).not.toThrow()
    expect(adapter.load()).toBeNull()
  })
})
