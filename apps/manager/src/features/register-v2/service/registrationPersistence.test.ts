import {
  buildRegistrationRecord,
  type PersistedRegistrationRecord,
  serializeRegistrationRecord,
} from '@ens-apps/transaction-manager'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RegistrationConfirmedData } from '../state/registrationUi.machine'
import {
  clearStoredRegistration,
  clearStoredRegistrationFor,
  createRegistrationPersistenceAdapter,
  loadStoredRegistration,
  REGISTRATION_RESUME_VERSION,
} from './registrationPersistence'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const HCA = '0xaaaa000000000000000000000000000000000001' as Address
const RESOLVER = '0xbbbb000000000000000000000000000000000002' as Address
const COMMITMENT = `0x${'ab'.repeat(32)}` as Hash
const SECRET = `0x${'cd'.repeat(32)}` as Hex

/** Minimal in-memory Storage, so tests never touch the real localStorage. */
const createStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    get size() {
      return map.size
    },
    raw: map,
  }
}

const confirmedData: RegistrationConfirmedData = {
  label: 'leon',
  duration: 31_536_000n,
  ownerAddress: OWNER,
  token: 'USDC',
  totalPrice: 5_000_000n,
  basePriceNumber: 5,
  premiumPriceNumber: 0,
}

const record = (): PersistedRegistrationRecord =>
  buildRegistrationRecord(
    'commitmentCooldown',
    {
      chainId: 11155111,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'rhinestone' } as never,
      accountAddress: HCA,
      ownerAddress: OWNER,
      resolverAddress: RESOLVER,
      commitment: { commitment: COMMITMENT, secret: SECRET },
      commitmentTxId: 'tx-reg-commit',
      registerReadyTimestamp: 1_800_000_000_000,
      publicClient: {} as PublicClient,
    },
    Date.now(),
  )

describe('registration persistence adapter', () => {
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
  })

  const adapterFor = (
    appState: {
      confirmedData?: RegistrationConfirmedData
      postRegistrationSetup?: { primaryName?: { enabled: boolean } }
    } = { confirmedData },
  ) =>
    createRegistrationPersistenceAdapter({
      label: 'leon',
      getAppState: () => appState,
      storage,
    })

  it('round-trips the record with its confirmed pricing', () => {
    adapterFor().save(record())

    const loaded = loadStoredRegistration(storage)

    expect(loaded).not.toBeNull()
    expect(loaded?.label).toBe('leon')
    // The secret is unguessable and unrecoverable — losing it means paying for
    // a second commitment.
    expect(loaded?.record.context.commitment).toEqual({
      commitment: COMMITMENT,
      secret: SECRET,
    })
    expect(loaded?.record.context.resolverAddress).toBe(RESOLVER)
    expect(loaded?.confirmedData.duration).toBe(31_536_000n)
    expect(loaded?.confirmedData.totalPrice).toBe(5_000_000n)
    expect(loaded?.confirmedData.basePriceNumber).toBe(5)
  })

  it('keeps the post-registration opt-in, which the EOA path needs', () => {
    adapterFor({
      confirmedData,
      postRegistrationSetup: { primaryName: { enabled: true } },
    }).save(record())

    expect(loadStoredRegistration(storage)?.postRegistrationSetup).toEqual({
      primaryName: { enabled: true },
    })
  })

  it('drops a save with no confirmed pricing instead of storing a half-record', () => {
    adapterFor({ confirmedData: undefined }).save(record())

    expect(storage.size).toBe(0)
    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('clears', () => {
    adapterFor().save(record())
    clearStoredRegistration(storage)

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it("clears a name's record only for that name", () => {
    // Another name's record belongs to that run, which may hold a paid
    // commitment.
    adapterFor().save(record())

    clearStoredRegistrationFor('bob', storage)
    expect(loadStoredRegistration(storage)?.label).toBe('leon')

    clearStoredRegistrationFor('leon', storage)
    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('overwrites rather than accumulating — one record, last writer wins', () => {
    adapterFor().save(record())
    createRegistrationPersistenceAdapter({
      label: 'bob',
      getAppState: () => ({
        confirmedData: { ...confirmedData, label: 'bob' },
      }),
      storage,
    }).save(
      buildRegistrationRecord(
        'deployingResolver',
        {
          chainId: 11155111,
          name: 'bob.eth',
          duration: 31_536_000n,
          selectedToken: 'USDC',
          tokenPrice: 1n,
          signer: { type: 'eoa' } as never,
          ownerAddress: OWNER,
        },
        Date.now(),
      ),
    )

    expect(storage.size).toBe(1)
    expect(loadStoredRegistration(storage)?.label).toBe('bob')
  })

  it('returns null for corrupt JSON', () => {
    storage.setItem('ens-apps:register-v2:resume:v1', '{ not json')

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('returns null for an older app schema version', () => {
    adapterFor().save(record())
    const key = [...storage.raw.keys()][0] as string
    const envelope = JSON.parse(storage.raw.get(key) as string)
    storage.setItem(
      key,
      JSON.stringify({ ...envelope, v: REGISTRATION_RESUME_VERSION - 1 }),
    )

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('returns null when the record the package rejects', () => {
    adapterFor().save(record())
    const key = [...storage.raw.keys()][0] as string
    const envelope = JSON.parse(storage.raw.get(key) as string)
    storage.setItem(
      key,
      JSON.stringify({ ...envelope, record: '{ not a record' }),
    )

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('refuses a record whose halves disagree about the label', () => {
    // The commitment binds the label. Resuming `leon`'s commitment while the
    // envelope claims `bob` would produce a reveal that can never succeed.
    const mismatched = record()
    const key = 'ens-apps:register-v2:resume:v1'
    storage.setItem(
      key,
      JSON.stringify({
        v: REGISTRATION_RESUME_VERSION,
        label: 'bob',
        record: serializeRegistrationRecord(mismatched),
        confirmedData: {
          label: 'bob',
          duration: '31536000',
          ownerAddress: OWNER,
          token: 'USDC',
          totalPrice: '5000000',
          basePriceNumber: 5,
          premiumPriceNumber: 0,
        },
      }),
    )

    expect(loadStoredRegistration(storage)).toBeNull()
  })

  it('degrades to no-op when storage is unavailable', () => {
    const adapter = createRegistrationPersistenceAdapter({
      label: 'leon',
      getAppState: () => ({ confirmedData }),
      storage: null,
    })

    // Private mode / disabled storage costs resume, never the registration.
    expect(() => {
      adapter.save(record())
      adapter.clear()
    }).not.toThrow()
    expect(adapter.load()).toBeNull()
  })
})
