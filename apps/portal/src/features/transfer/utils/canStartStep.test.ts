import { describe, expect, it } from 'vitest'
import { canStartStep } from './canStartStep'

const ID = 'transfer-example.eth-transfer-token--0xabc-1'

describe('canStartStep', () => {
  it('allows a step that has not been started', () => {
    expect(
      canStartStep({ startedSteps: new Set(), id: ID, hasActor: false }),
    ).toBe(true)
  })

  it('blocks a step whose actor is running or has finished', () => {
    expect(
      canStartStep({ startedSteps: new Set([ID]), id: ID, hasActor: true }),
    ).toBe(false)
  })

  it('allows a restart once the actor has been dropped', () => {
    // Nothing is left to wait on, so leaving it blocked would strand the modal
    // on a step whose button does nothing.
    expect(
      canStartStep({ startedSteps: new Set([ID]), id: ID, hasActor: false }),
    ).toBe(true)
  })

  it('does not confuse one step with another', () => {
    expect(
      canStartStep({
        startedSteps: new Set(['other-step']),
        id: ID,
        hasActor: true,
      }),
    ).toBe(true)
  })
})
