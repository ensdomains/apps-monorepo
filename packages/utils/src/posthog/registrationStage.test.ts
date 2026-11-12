import { describe, expect, it } from 'vitest'
import { getRegistrationAnalyticsStep } from './registrationStage'

describe('getRegistrationAnalyticsStep', () => {
  it.each([
    ['deployingResolver', 'setup'],
    ['signingFundingPermit', 'approval'],
    ['submittingSetupBundle', 'commit'],
    ['submittingEoaSetupBundle', 'commit'],
    ['commitmentCooldown', 'cooldown'],
    ['submittingRhinestoneBundle', 'registration'],
    ['verifyingRegistration', 'verification'],
    ['computingHcaBudget', undefined],
    ['idle', undefined],
    ['success', undefined],
  ])('maps %s to its product milestone', (state, step) => {
    expect(getRegistrationAnalyticsStep(state)).toBe(step)
  })
})
