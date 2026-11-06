import { describe, expect, it } from 'vitest'
import { getRegistrationAnalyticsStep } from './registrationAnalyticsStep'

describe('getRegistrationAnalyticsStep', () => {
  it.each([
    ['deployingResolver', 'setup'],
    ['signingFundingPermit', 'approval'],
    ['submittingSetupBundle', 'commit'],
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
