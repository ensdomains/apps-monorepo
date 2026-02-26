import { describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'

vi.mock('@ens-apps/transaction-manager', () => ({}))

import { RegistrationStep, registrationMachine } from './registrationMachine'

describe('registrationMachine', () => {
  it('starts in PRICING step', () => {
    const actor = createActor(registrationMachine)
    actor.start()
    expect(actor.getSnapshot().context.step).toBe(RegistrationStep.PRICING)
    actor.stop()
  })

  it('updates name when SET_NAME is sent', () => {
    const actor = createActor(registrationMachine)
    actor.start()
    actor.send({ type: 'SET_NAME', name: 'test.eth' })
    expect(actor.getSnapshot().context.name).toBe('test.eth')
    actor.stop()
  })

  it('updates duration when SET_DURATION is sent', () => {
    const actor = createActor(registrationMachine)
    actor.start()
    actor.send({ type: 'SET_DURATION', duration: 5 })
    expect(actor.getSnapshot().context.duration).toBe(5)
    actor.stop()
  })
})
