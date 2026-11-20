import { describe, expect, it } from 'vitest'
import { getRegistrationStageMessages } from './txStageMessages'

describe('getRegistrationStageMessages', () => {
  it.each(['waitingForCommitment', 'waitingForRhinestoneBundle'] as const)(
    'shows the required session signature after reaching %s',
    (highestProgressStage) => {
      const message = getRegistrationStageMessages(
        { value: 'reauthorizingSession' },
        undefined,
        highestProgressStage,
      )

      expect(message.stageLabel.message).toBe('Confirm updated network fees')
      expect(message.stageDescription?.message).toBe(
        'Network fees changed since you authorized this registration. Sign once more in your wallet to continue.',
      )
    },
  )

  it('keeps the highest progress message for ordinary submission states', () => {
    const message = getRegistrationStageMessages(
      { value: 'submittingSetupBundle' },
      undefined,
      'waitingForCommitment',
    )

    expect(message.stageLabel.message).toBe(
      'Waiting for commitment confirmation',
    )
  })

  it('maps waiting for commitment pending stage', () => {
    const message = getRegistrationStageMessages(
      { value: 'waitingForCommitment' },
      'pending',
    )

    expect(message.stageLabel.message).toBe('Waiting for commitment receipt')
  })

  it('maps success stage', () => {
    const message = getRegistrationStageMessages(
      { value: 'success' },
      undefined,
    )

    expect(message.stageLabel.message).toBe('Registration complete')
  })

  it('maps the gasless permit-signing stage', () => {
    const message = getRegistrationStageMessages(
      { value: 'signingFundingPermit' },
      undefined,
    )

    expect(message.stageLabel.message).toBe('Approve payment')
    expect(message.stageDescription?.message).toBe(
      'Sign the gasless payment approval in your wallet',
    )
  })

  it('maps Rhinestone bundle stages', () => {
    const submitting = getRegistrationStageMessages(
      { value: 'submittingRhinestoneBundle' },
      undefined,
    )
    expect(submitting.stageLabel.message).toBe(
      'Submitting approval and registration',
    )

    const waiting = getRegistrationStageMessages(
      { value: 'waitingForRhinestoneBundle' },
      'pending',
    )
    expect(waiting.stageLabel.message).toBe(
      'Waiting for registration confirmation',
    )
  })
})
