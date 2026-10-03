import type { Address, Hash, Hex, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise, waitFor } from 'xstate'
import { TransactionUserRejectedError } from '../../errors/transaction.errors'
import type { Signer } from '../../types/signer.types'
import type { TransactionRequest } from '../../types/transaction.types'
import type { RegistrationContext } from './registration.machine'
import { registrationMachine } from './registration.machine'
import {
  buildRegistrationRecord,
  getResumeTarget,
  type PersistedRegistrationContext,
  type PersistedRegistrationRecord,
  parseRegistrationRecord,
  REGISTRATION_PERSISTENCE_VERSION,
  type RegistrationPersistenceAdapter,
  serializeRegistrationContext,
  serializeRegistrationRecord,
  subscribeRegistrationPersistence,
} from './registration.persistence'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const RESOLVER = '0xbbbb000000000000000000000000000000000002' as Address
const COMMITMENT = `0x${'ab'.repeat(32)}` as Hash
const SECRET = `0x${'cd'.repeat(32)}` as Hex

const eoaSigner = { type: 'eoa' } as unknown as Signer
const rhinestoneSigner = { type: 'rhinestone' } as unknown as Signer

const baseContext = (
  overrides: Partial<RegistrationContext> = {},
): RegistrationContext => ({
  chainId: 11155111,
  name: 'leon.eth',
  duration: 31_536_000n,
  selectedToken: 'USDC',
  tokenPrice: 5_000_000n,
  signer: eoaSigner,
  accountAddress: OWNER,
  ownerAddress: OWNER,
  resolverOwnerAddress: OWNER,
  resolverAddress: RESOLVER,
  ...overrides,
})

const persisted = (
  overrides: Partial<PersistedRegistrationContext> = {},
): PersistedRegistrationContext => ({
  ...serializeRegistrationContext(baseContext()),
  ...overrides,
})

describe('getResumeTarget', () => {
  it('routes a submitted register to verification, never back to a submit', () => {
    expect(
      getResumeTarget({
        stage: 'waitingForRhinestoneBundle',
        context: persisted({
          commitment: { commitment: COMMITMENT, secret: SECRET },
          registrationTxId: 'tx-reg-register',
        }),
      }),
    ).toBe('verifyingRegistration')
  })

  it.each([
    'registeringDomain',
    'waitingForRegistration',
    'submittingRhinestoneBundle',
    'waitingForRhinestoneBundle',
    'verifyingRegistration',
  ])('routes stage %s to verification even without a registrationTxId', (stage) => {
    // The tab can close between the submit request going out and the txId
    // landing in context; the intent still fills server-side.
    expect(
      getResumeTarget({
        stage,
        context: persisted({
          commitment: { commitment: COMMITMENT, secret: SECRET },
        }),
      }),
    ).toBe('verifyingRegistration')
  })

  it('routes a stored commitment to on-chain validation', () => {
    expect(
      getResumeTarget({
        stage: 'commitmentCooldown',
        context: persisted({
          commitment: { commitment: COMMITMENT, secret: SECRET },
        }),
      }),
    ).toBe('validatingCommitment')
  })

  it('restarts a pre-commit run, including one interrupted mid-setup', () => {
    for (const stage of [
      'settingUpRegistration',
      'computingHcaBudget',
      'checkingHcaFunding',
      'signingFundingPermit',
      'submittingSetupBundle',
      'deployingResolver',
    ]) {
      expect(getResumeTarget({ stage, context: persisted() })).toBe(
        'settingUpRegistration',
      )
    }
  })

  it('ignores the error stage and routes by the flow fields', () => {
    expect(
      getResumeTarget({
        stage: 'error',
        context: persisted({
          commitment: { commitment: COMMITMENT, secret: SECRET },
        }),
      }),
    ).toBe('validatingCommitment')

    expect(
      getResumeTarget({
        stage: 'error',
        context: persisted({ registrationTxId: 'tx-reg-register' }),
      }),
    ).toBe('verifyingRegistration')

    expect(getResumeTarget({ stage: 'error', context: persisted() })).toBe(
      'settingUpRegistration',
    )
  })

  it('never resumes into a state that submits or prompts', () => {
    const unsafe = [
      'submittingSetupBundle',
      'submittingRhinestoneBundle',
      'signingFundingPermit',
      'committingTransaction',
      'approvingToken',
      'registeringDomain',
    ]

    const stages = [
      'idle',
      'settingUpRegistration',
      'computingHcaBudget',
      'checkingHcaFunding',
      'signingFundingPermit',
      'submittingSetupBundle',
      'waitingForCommitment',
      'commitmentCooldown',
      'submittingRhinestoneBundle',
      'waitingForRhinestoneBundle',
      'registeringDomain',
      'verifyingRegistration',
      'error',
    ]
    const contexts = [
      persisted(),
      persisted({ commitment: { commitment: COMMITMENT, secret: SECRET } }),
      persisted({ registrationTxId: 'tx-reg-register' }),
    ]

    for (const stage of stages) {
      for (const context of contexts) {
        expect(unsafe).not.toContain(getResumeTarget({ stage, context }))
      }
    }
  })
})

describe('registration record serialization', () => {
  it('round-trips bigints and the commitment secret', () => {
    const context = baseContext({
      duration: 63_072_000n,
      tokenPrice: 12_345_678n,
      resolverSalt: 2n ** 200n,
      commitment: { commitment: COMMITMENT, secret: SECRET },
      commitmentTxId: 'tx-reg-commit',
      registerReadyTimestamp: 1_800_000_000_000,
      // Real orchestrator ids are ~250-bit uint256s — far past Number range.
      registrationIntentId: 2n ** 250n + 123n,
    })

    const record = buildRegistrationRecord('commitmentCooldown', context, 42)
    const result = parseRegistrationRecord(serializeRegistrationRecord(record))

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual(record)
    // Explicit: bigints must come back as bigints, not strings or numbers.
    expect(result._unsafeUnwrap().context.duration).toBe(63_072_000n)
    expect(result._unsafeUnwrap().context.resolverSalt).toBe(2n ** 200n)
    expect(result._unsafeUnwrap().context.commitment?.secret).toBe(SECRET)
    expect(result._unsafeUnwrap().context.registrationIntentId).toBe(
      2n ** 250n + 123n,
    )
  })

  it('round-trips bigints under an app-wide BigInt toJSON shim', () => {
    // The portal installs exactly this in main.tsx. `JSON.stringify` runs it
    // before any replacer, so a record written through it lost its envelopes,
    // failed validation on load, and every reload restarted the registration.
    const proto = BigInt.prototype as { toJSON?: () => unknown }
    const previous = Object.getOwnPropertyDescriptor(proto, 'toJSON')
    proto.toJSON = function (this: bigint) {
      return (
        JSON as unknown as { rawJSON: (text: string) => unknown }
      ).rawJSON(this.toString())
    }

    try {
      const record = buildRegistrationRecord(
        'commitmentCooldown',
        baseContext({
          resolverSalt: 2n ** 200n,
          commitment: { commitment: COMMITMENT, secret: SECRET },
        }),
        42,
      )

      const result = parseRegistrationRecord(
        serializeRegistrationRecord(record),
      )

      expect(result._unsafeUnwrap()).toEqual(record)
      expect(result._unsafeUnwrap().context.resolverSalt).toBe(2n ** 200n)
    } finally {
      if (previous) Object.defineProperty(proto, 'toJSON', previous)
      else delete proto.toJSON
    }
  })

  it('drops the non-serializable deps rather than trying to encode them', () => {
    const serialized = serializeRegistrationContext(
      baseContext({
        signer: rhinestoneSigner,
        publicClient: {} as PublicClient,
        approvalSigner: eoaSigner,
        permit: { deadline: 1n } as never,
        hcaBudget: 15_000_000n,
        hcaUsdcBalance: 1n,
        error: new Error('nope'),
        retryTarget: 'registeringDomain',
      }),
    )

    expect(serialized).not.toHaveProperty('signer')
    expect(serialized).not.toHaveProperty('publicClient')
    expect(serialized).not.toHaveProperty('approvalSigner')
    expect(serialized).not.toHaveProperty('permit')
    expect(serialized).not.toHaveProperty('hcaBudget')
    expect(serialized).not.toHaveProperty('error')
    expect(serialized).not.toHaveProperty('retryTarget')
    expect(serialized.signerType).toBe('rhinestone')
  })

  it('discards corrupt JSON', () => {
    expect(parseRegistrationRecord('{ not json').isErr()).toBe(true)
  })

  it('builds a record on a chain with no HCA deployment instead of throwing', () => {
    // `hcaRegistrarAddress` throws for an unconfigured chain. This runs on
    // every persisted snapshot, so a throw here would kill the registration
    // that persistence exists to protect.
    const record = buildRegistrationRecord(
      'commitmentCooldown',
      baseContext({ chainId: 1, signer: rhinestoneSigner }),
      0,
    )

    expect(record.fingerprint).toContain('unconfigured-chain-1')
    // Unresumable by construction, and distinct from a configured chain's.
    expect(
      parseRegistrationRecord(serializeRegistrationRecord(record)).isOk(),
    ).toBe(true)
    expect(record.fingerprint).not.toBe(
      buildRegistrationRecord(
        'commitmentCooldown',
        baseContext({ signer: rhinestoneSigner }),
        0,
      ).fingerprint,
    )
  })

  it('discards a record written by an older schema version', () => {
    const record = buildRegistrationRecord(
      'commitmentCooldown',
      baseContext(),
      0,
    )
    const stale = serializeRegistrationRecord({
      ...record,
      v: REGISTRATION_PERSISTENCE_VERSION - 1,
    })

    expect(parseRegistrationRecord(stale).isErr()).toBe(true)
  })

  it('discards a record whose protocol fingerprint drifted', () => {
    // Stands in for a REFERER_ADDRESS change or a new registrar deployment:
    // either invalidates the commitment hash, so `commitmentAt` would read 0
    // and the resume would look like a failed commit rather than stale data.
    const record = buildRegistrationRecord(
      'commitmentCooldown',
      baseContext(),
      0,
    )
    const drifted = serializeRegistrationRecord({
      ...record,
      fingerprint: '0xdeadbeef:0xdeadbeef',
    })

    expect(parseRegistrationRecord(drifted).isErr()).toBe(true)
  })

  it('accepts either signer path against the current deployment', () => {
    // The Sepolia HCA registrar and the EOA registrar are the SAME contract
    // today, so the fingerprint is identical across paths. Cross-path misuse is
    // not a serialization concern — the live signer on the RESUME event
    // supersedes the stored `signerType`, and the app's identity gate is what
    // refuses a resume for a different owner.
    for (const signerType of ['eoa', 'rhinestone'] as const) {
      const record = buildRegistrationRecord(
        'commitmentCooldown',
        baseContext({
          signer: signerType === 'eoa' ? eoaSigner : rhinestoneSigner,
        }),
        0,
      )
      const result = parseRegistrationRecord(
        serializeRegistrationRecord(record),
      )

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap().context.signerType).toBe(signerType)
    }
  })

  it('discards a record whose shape no longer validates', () => {
    const record = buildRegistrationRecord(
      'commitmentCooldown',
      baseContext(),
      0,
    )
    const broken = serializeRegistrationRecord({
      ...record,
      context: { ...record.context, ownerAddress: 'not-an-address' as Address },
    })

    expect(parseRegistrationRecord(broken).isErr()).toBe(true)
  })
})

const createAdapter = () => {
  const saved: PersistedRegistrationRecord[] = []
  const adapter: RegistrationPersistenceAdapter & {
    saved: PersistedRegistrationRecord[]
    clears: number
  } = {
    saved,
    clears: 0,
    save: (record) => {
      saved.push(record)
    },
    load: () => saved.at(-1) ?? null,
    clear: () => {
      adapter.clears += 1
    },
  }
  return adapter
}

/**
 * Park the machine at its first invoke so the assertions are about the
 * subscriber, not the flow.
 */
const startParkedActor = () =>
  createActor(
    registrationMachine.provide({
      actors: {
        deployResolver: fromPromise(() => new Promise(() => {})) as never,
        estimateHcaBudget: fromPromise(() => new Promise(() => {})) as never,
        validateCommitment: fromPromise(() => new Promise(() => {})) as never,
        verifyRegistration: fromPromise(() => new Promise(() => {})) as never,
      },
    }),
    { input: { chainId: 11155111 } },
  )

/** Like {@link startParkedActor}, but the first resolver deploy fails with `error`. */
const startActorFailingDeploy = (error: Error) =>
  createActor(
    registrationMachine.provide({
      actors: {
        deployResolver: fromPromise(
          vi
            .fn()
            .mockRejectedValueOnce(error)
            .mockImplementation(() => new Promise(() => {})),
        ) as never,
      },
    }),
    { input: { chainId: 11155111 } },
  )

const declined = () =>
  new TransactionUserRejectedError({} as TransactionRequest)

const startRegistration = (actor: ReturnType<typeof startParkedActor>) => {
  actor.send({
    type: 'START_REGISTRATION',
    name: 'leon.eth',
    duration: 31_536_000n,
    token: 'USDC',
    price: 5_000_000n,
    signer: eoaSigner,
    accountAddress: OWNER,
    ownerAddress: OWNER,
    publicClient: {} as PublicClient,
  })
}

describe('subscribeRegistrationPersistence', () => {
  it('does not clear on the initial idle snapshot', () => {
    // The subscriber is attached on mount, before the app has had a chance to
    // read the record it means to resume from. Clearing here would delete it.
    const adapter = createAdapter()
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()

    expect(adapter.clears).toBe(0)
    expect(adapter.saved).toHaveLength(0)
    actor.stop()
  })

  it('saves a resumable record once the flow starts', () => {
    const adapter = createAdapter()
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)

    const record = adapter.saved.at(-1)
    expect(record).toBeDefined()
    expect(record?.v).toBe(REGISTRATION_PERSISTENCE_VERSION)
    expect(record?.stage).toBe('deployingResolver')
    expect(record?.context.name).toBe('leon.eth')
    expect(record?.context.duration).toBe(31_536_000n)
    expect(record?.updatedAt).toBeGreaterThan(0)
    actor.stop()
  })

  it('clears once the flow is cancelled back to idle', () => {
    const adapter = createAdapter()
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)
    expect(adapter.saved.length).toBeGreaterThan(0)

    actor.send({ type: 'CANCEL' })

    expect(adapter.clears).toBe(1)
    actor.stop()
  })

  it('clears when the run fails because the user declined', async () => {
    // Resuming a declined run on reload would re-open the very prompt the user
    // just refused; they belong back on pricing.
    const adapter = createAdapter()
    const actor = startActorFailingDeploy(declined())

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)
    await waitFor(actor, (s) => s.matches('error'))

    expect(adapter.clears).toBe(1)
    actor.stop()
  })

  it('keeps the record when the run fails for any other reason', async () => {
    // An interrupted run is still worth resuming, e.g. to find a reveal that
    // landed after verification gave up.
    const adapter = createAdapter()
    const actor = startActorFailingDeploy(new Error('rpc down'))

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)
    await waitFor(actor, (s) => s.matches('error'))

    expect(adapter.clears).toBe(0)
    expect(adapter.saved.at(-1)?.stage).toBe('error')
    actor.stop()
  })

  it('writes again once a declined run is retried', async () => {
    const adapter = createAdapter()
    const actor = startActorFailingDeploy(declined())

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)
    await waitFor(actor, (s) => s.matches('error'))
    const writes = adapter.saved.length

    actor.send({ type: 'RETRY' })

    expect(adapter.saved).toHaveLength(writes + 1)
    expect(adapter.saved.at(-1)?.stage).toBe('deployingResolver')
    actor.stop()
  })

  it('keeps the record when the run is suspended', () => {
    // The owning wallet went away mid-run. Clearing here, as a cancel does,
    // would throw away a commitment that wallet may already have paid for.
    const adapter = createAdapter()
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)
    const saved = adapter.saved.at(-1)

    actor.send({ type: 'SUSPEND' })

    expect(actor.getSnapshot().value).toBe('idle')
    expect(adapter.clears).toBe(0)
    expect(adapter.saved.at(-1)).toBe(saved)
    actor.stop()
  })

  it('writes again when a new run starts after a suspend', () => {
    const adapter = createAdapter()
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)
    actor.send({ type: 'SUSPEND' })
    const writes = adapter.saved.length

    startRegistration(actor)

    expect(adapter.saved).toHaveLength(writes + 1)
    actor.stop()
  })

  it('does not write the same payload twice', () => {
    const adapter = createAdapter()
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    startRegistration(actor)

    const writes = adapter.saved.length
    // A snapshot that changes nothing persisted must not hit storage again.
    actor.send({ type: 'RETRY' })

    expect(adapter.saved.length).toBe(writes)
    actor.stop()
  })

  it('keeps the flow alive when storage throws', () => {
    const onError = vi.fn()
    const adapter: RegistrationPersistenceAdapter = {
      save: () => {
        throw new Error('QuotaExceededError')
      },
      load: () => null,
      clear: () => {},
    }
    const actor = startParkedActor()

    subscribeRegistrationPersistence(actor, adapter, { onError })
    actor.start()

    expect(() => {
      startRegistration(actor)
    }).not.toThrow()
    expect(onError).toHaveBeenCalled()
    expect(actor.getSnapshot().value).toBe('deployingResolver')
    actor.stop()
  })

  it('stops writing after unsubscribe', () => {
    const adapter = createAdapter()
    const actor = startParkedActor()

    const unsubscribe = subscribeRegistrationPersistence(actor, adapter)
    actor.start()
    unsubscribe()
    startRegistration(actor)

    expect(adapter.saved).toHaveLength(0)
    actor.stop()
  })
})
