import { describe, expect, it } from 'vitest'
import { getRegistrationStageMessages } from './txStageMessages'

describe('getRegistrationStageMessages', () => {
  it('maps waiting for commitment pending stage', () => {
    const message = getRegistrationStageMessages(
      { value: 'waitingForCommitment' },
      'pending',
    )

    expect(message.stageLabel.message).toBe('Waiting for commitment receipt')
    expect(message.progress).toBe(35)
  })

  it('maps success stage', () => {
    const message = getRegistrationStageMessages(
      { value: 'success' },
      undefined,
    )

    expect(message.stageLabel.message).toBe('Registration complete')
    expect(message.progress).toBe(100)
  })

  it('maps Rhinestone bundle stages (not otherwise / progress 0)', () => {
    const submitting = getRegistrationStageMessages(
      { value: 'submittingRhinestoneBundle' },
      undefined,
    )
    expect(submitting.stageLabel.message).toBe(
      'Submitting approval and registration',
    )
    expect(submitting.progress).toBe(55)

    const waiting = getRegistrationStageMessages(
      { value: 'waitingForRhinestoneBundle' },
      'pending',
    )
    expect(waiting.progress).toBe(90)
  })
})
