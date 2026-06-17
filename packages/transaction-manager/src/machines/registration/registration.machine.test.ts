// biome-ignore-all lint/suspicious/noExplicitAny: synthetic xstate test events
import type { Address, PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { createActor, createMachine, fromPromise } from 'xstate'
import type { Signer } from '../../types/signer.types'
import {
  type RegistrationPostRegistrationSetup,
  registrationMachine,
} from './registration.machine'

const OWNER = '0x0000000000000000000000000000000000000001' as Address
const NAME = 'example.eth'

const signer: Signer = {
  type: 'eoa',
  walletClient: {} as never,
  account: { address: OWNER },
}

const neverSettling = fromPromise(() => new Promise<never>(() => {}))

const primaryNameStubMachine = createMachine({
  id: 'primaryNameStub',
  initial: 'idle',
  states: {
    idle: {
      on: {
        START_UPDATE: 'running',
      },
    },
    running: {
      on: {
        SUCCEED: 'success',
        FAIL: 'error',
      },
    },
    success: {},
    error: {},
  },
})

const stubbedActors = {
  ensureHcaDeployed: neverSettling,
  deployResolver: neverSettling,
  submitResolverAndCommitment: neverSettling,
  resolveResolverDeployment: neverSettling,
  generateCommitment: neverSettling,
  submitCommitment: neverSettling,
  submitApproval: neverSettling,
  submitRegistration: neverSettling,
  syncEthAddressRecord: neverSettling,
  primaryNameFlow: primaryNameStubMachine,
  signPermit: neverSettling,
  submitPermitAndRegistration: neverSettling,
  pollTransactionStatus: neverSettling,
  waitAfterCommitment: neverSettling,
  validateCommitment: neverSettling,
  readMinCommitmentAge: neverSettling,
  readPaymentTokenAllowance: neverSettling,
  verifyRegistration: neverSettling,
}

const createRegistrationActor = (
  postRegistrationSetup?: RegistrationPostRegistrationSetup,
) => {
  const actor = createActor(
    registrationMachine.provide({
      actors: stubbedActors as never,
    }),
    { input: { chainId: 11155111 } },
  )
  actor.start()
  actor.send({
    type: 'START_REGISTRATION',
    name: NAME,
    duration: 31_536_000n,
    token: 'USDC',
    price: 1_000_000n,
    signer,
    accountAddress: OWNER,
    ownerAddress: OWNER,
    publicClient: {} as PublicClient,
    postRegistrationSetup,
  })
  return actor
}

const advanceToPostRegistrationSetup = (
  actor: ReturnType<typeof createRegistrationActor>,
) => {
  actor.send({
    type: 'xstate.done.actor.0.registration.deployingResolver',
    output: { txId: 'tx-resolver', salt: 1n },
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.waitingForResolverDeployment',
    output: { resolverAddress: OWNER },
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.preparingCommitment',
    output: { commitment: '0x1234', secret: '0x5678' },
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.ensuringHcaDeployed',
    output: undefined,
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.committingTransaction',
    output: 'tx-commit',
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.waitingForCommitment',
    output: undefined,
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.fetchingCommitmentAge',
    output: 0n,
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.checkingAllowance',
    output: 1_000_000n,
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.commitmentCooldown',
    output: undefined,
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.registeringDomain',
    output: 'tx-register',
  } as never)
  actor.send({
    type: 'xstate.done.actor.0.registration.waitingForRegistration',
    output: undefined,
  } as never)
}

const getPrimaryNameChild = (
  actor: ReturnType<typeof createRegistrationActor>,
) => {
  const child = actor.getSnapshot().children.registrationPrimaryNameSetup
  if (!child) {
    throw new Error('registration primary-name child actor not found')
  }
  return child
}

describe('registrationMachine post-registration setup', () => {
  it('keeps the default path unchanged when no setup config is provided', () => {
    const actor = createRegistrationActor()
    advanceToPostRegistrationSetup(actor)

    expect(actor.getSnapshot().matches('success')).toBe(true)
    actor.stop()
  })

  it('runs ETH-record setup before primary-name setup when enabled', () => {
    const actor = createRegistrationActor({
      primaryName: { enabled: true, syncEthRecord: true },
    })
    advanceToPostRegistrationSetup(actor)

    expect(actor.getSnapshot().matches('syncingEthRecord')).toBe(true)
    actor.stop()
  })

  it('still runs ETH-record setup first when primary-name setup is enabled without explicit sync', () => {
    const actor = createRegistrationActor({
      primaryName: { enabled: true, syncEthRecord: false },
    })
    advanceToPostRegistrationSetup(actor)

    expect(actor.getSnapshot().matches('syncingEthRecord')).toBe(true)
    actor.stop()
  })

  it('supports ETH-record-only post-registration setup', () => {
    const actor = createRegistrationActor({
      primaryName: { enabled: false, syncEthRecord: true },
    })
    advanceToPostRegistrationSetup(actor)

    expect(actor.getSnapshot().matches('syncingEthRecord')).toBe(true)
    actor.send({
      type: 'xstate.done.actor.0.registration.syncingEthRecord',
      output: 'tx-eth-record',
    } as never)
    actor.send({
      type: 'xstate.done.actor.0.registration.waitingForEthRecordSync',
      output: undefined,
    } as never)
    expect(actor.getSnapshot().matches('success')).toBe(true)
    actor.stop()
  })

  it('retries ETH-record setup without re-entering registration', () => {
    const actor = createRegistrationActor({
      primaryName: { enabled: false, syncEthRecord: true },
    })
    advanceToPostRegistrationSetup(actor)

    expect(actor.getSnapshot().matches('syncingEthRecord')).toBe(true)
    expect(actor.getSnapshot().context.registrationTxId).toBe('tx-register')

    actor.send({
      type: 'xstate.error.actor.0.registration.syncingEthRecord',
      error: new Error('eth-record failed'),
    } as never)
    expect(actor.getSnapshot().matches('error')).toBe(true)

    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().matches('syncingEthRecord')).toBe(true)
    expect(actor.getSnapshot().context.registrationTxId).toBe('tx-register')
    actor.stop()
  })

  it('retries primary-name setup without re-entering registration', () => {
    const actor = createRegistrationActor({
      primaryName: { enabled: true, syncEthRecord: false },
    })
    advanceToPostRegistrationSetup(actor)

    // Future L2 support should branch from postRegistrationSetup without
    // weakening the ETH-before-primary invariant tested here.
    actor.send({
      type: 'xstate.done.actor.0.registration.syncingEthRecord',
      output: 'tx-eth-record',
    } as never)
    actor.send({
      type: 'xstate.done.actor.0.registration.waitingForEthRecordSync',
      output: undefined,
    } as never)

    expect(actor.getSnapshot().matches('settingPrimaryName')).toBe(true)
    expect(actor.getSnapshot().context.registrationTxId).toBe('tx-register')

    getPrimaryNameChild(actor).send({ type: 'FAIL' } as never)
    expect(actor.getSnapshot().matches('error')).toBe(true)

    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().matches('settingPrimaryName')).toBe(true)
    expect(actor.getSnapshot().context.registrationTxId).toBe('tx-register')
    actor.stop()
  })
})
