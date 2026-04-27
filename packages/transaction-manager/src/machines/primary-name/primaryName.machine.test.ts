import type { Address, PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { createActor, fromPromise } from 'xstate'
import type { Signer } from '../../types/signer.types'
import { primaryNameMachine } from './primaryName.machine'

const EOA = '0x0000000000000000000000000000000000000001' as Address
const NAME = 'example.eth'

const makeEOASigner = (): Signer => ({
  type: 'eoa',
  walletClient: {} as never,
  account: { address: EOA },
})

const makeRhinestoneSigner = (): Signer =>
  ({ type: 'rhinestone' }) as unknown as Signer

// Stub actors: promises that never resolve, so the machine parks in each
// invoking state and we can drive transitions with manual done/error events.
const neverSettling = fromPromise(() => new Promise<never>(() => {}))

const stubbedActors = {
  submitPrimaryNameUpdate: neverSettling,
  requestEOASignature: neverSettling,
  submitWithSignature: neverSettling,
  submitReverseUpdate: neverSettling,
  pollTransactionStatus: neverSettling,
}

const baseStartPayload = (signer: Signer) => ({
  type: 'START_UPDATE' as const,
  name: NAME,
  signer,
  accountAddress: EOA,
  publicClient: {} as PublicClient,
})

describe('primaryNameMachine RETRY routing', () => {
  it('after a primary-tx failure, RETRY goes back to submittingUpdate', () => {
    const machine = primaryNameMachine.provide({
      actors: stubbedActors as never,
    })

    const actor = createActor(machine, { input: { chainId: 11155111 } })
    actor.start()
    actor.send(baseStartPayload(makeEOASigner()))
    // settingUpUpdate always-transitions → submittingUpdate (actor hangs)
    expect(actor.getSnapshot().matches('submittingUpdate')).toBe(true)

    // Simulate the actor failing
    actor.send({
      type: 'xstate.error.actor.0.primary-name.submittingUpdate',
      error: new Error('primary failed'),
    } as never)
    expect(actor.getSnapshot().matches('error')).toBe(true)
    expect(actor.getSnapshot().context.updateTxId).toBeUndefined()

    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().matches('submittingUpdate')).toBe(true)
    actor.stop()
  })

  it('after a reverse-tx failure on EOA, RETRY resumes at submittingReverse (does not redo step 1)', () => {
    const machine = primaryNameMachine.provide({
      actors: stubbedActors as never,
    })

    const actor = createActor(machine, { input: { chainId: 11155111 } })
    actor.start()
    actor.send(baseStartPayload(makeEOASigner()))
    expect(actor.getSnapshot().matches('submittingUpdate')).toBe(true)

    // Fake success of the primary tx → lands updateTxId + goes to waitingForUpdate
    actor.send({
      type: 'xstate.done.actor.0.primary-name.submittingUpdate',
      output: 'tx-primary-1',
    } as never)
    expect(actor.getSnapshot().matches('waitingForUpdate')).toBe(true)
    expect(actor.getSnapshot().context.updateTxId).toBe('tx-primary-1')

    // Fake poll done → EOA branch routes to submittingReverse
    actor.send({
      type: 'xstate.done.actor.0.primary-name.waitingForUpdate',
      output: '0xdeadbeef',
    } as never)
    expect(actor.getSnapshot().matches('submittingReverse')).toBe(true)

    // Fail the reverse tx
    actor.send({
      type: 'xstate.error.actor.0.primary-name.submittingReverse',
      error: new Error('reverse failed'),
    } as never)
    expect(actor.getSnapshot().matches('error')).toBe(true)
    expect(actor.getSnapshot().context.updateTxId).toBe('tx-primary-1')

    // RETRY: because updateTxId is set AND signer is EOA, skip back to submittingReverse
    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().matches('submittingReverse')).toBe(true)
    // Critically, updateTxId is preserved — we don't redo step 1
    expect(actor.getSnapshot().context.updateTxId).toBe('tx-primary-1')
    actor.stop()
  })

  it('smart-account signature flow never enters submittingReverse', () => {
    const machine = primaryNameMachine.provide({
      actors: stubbedActors as never,
    })

    const actor = createActor(machine, { input: { chainId: 11155111 } })
    actor.start()
    actor.send({
      ...baseStartPayload(makeRhinestoneSigner()),
      walletClient: {} as never,
      eoaAddress: EOA,
    })
    // needsSignatureFlow → requestingSignature
    expect(actor.getSnapshot().matches('requestingSignature')).toBe(true)

    actor.send({
      type: 'xstate.done.actor.0.primary-name.requestingSignature',
      output: { signature: '0x00', signatureExpiry: 1n },
    } as never)
    expect(actor.getSnapshot().matches('submittingWithSignature')).toBe(true)

    actor.send({
      type: 'xstate.done.actor.0.primary-name.submittingWithSignature',
      output: 'tx-sig-1',
    } as never)
    expect(actor.getSnapshot().matches('waitingForUpdate')).toBe(true)

    actor.send({
      type: 'xstate.done.actor.0.primary-name.waitingForUpdate',
      output: '0xhash',
    } as never)
    // Non-EOA signer → bypass submittingReverse → success
    expect(actor.getSnapshot().matches('success')).toBe(true)
    actor.stop()
  })
})
