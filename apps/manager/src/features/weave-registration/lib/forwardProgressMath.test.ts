import { describe, expect, it } from 'vitest'
import { REGISTRATION_STAGE_PROGRESS } from '@/features/register-v2/state/registration.stages'
import {
  advanceForwardProgress,
  type ForwardProgressInputs,
} from './forwardProgressMath'

const makeInputs = (
  overrides: Partial<ForwardProgressInputs> = {},
): ForwardProgressInputs => ({
  stageProgress: REGISTRATION_STAGE_PROGRESS.commitmentCooldown,
  isComplete: false,
  nameLength: 8,
  cooldownRemainingSeconds: null,
  ...overrides,
})

describe('advanceForwardProgress', () => {
  it('fills a cooldown hidden in another tab as far as visible frames would have', () => {
    const start = 20
    const frameSeconds = 0.1
    const frameCount = 300
    const visible = Array.from(
      { length: frameCount },
      (_, i) => 60 - (i + 1) * frameSeconds,
    ).reduce(
      (current, remaining) =>
        advanceForwardProgress(
          makeInputs({ cooldownRemainingSeconds: remaining }),
          current,
          frameSeconds,
        ),
      start,
    )

    const hidden = advanceForwardProgress(
      makeInputs({ cooldownRemainingSeconds: 30 }),
      start,
      frameCount * frameSeconds,
    )

    // Half the cooldown has passed, so the fill is halfway from 20 to 80.
    expect(hidden).toBeCloseTo(50, 6)
    expect(visible).toBeCloseTo(hidden, 6)
  })

  it('plays the completion sweep after a hidden tab instead of jumping to full', () => {
    const progress = advanceForwardProgress(
      makeInputs({ isComplete: true }),
      40,
      30,
    )

    // 120%/s over one capped 0.1s frame.
    expect(progress).toBeCloseTo(52, 6)
  })
})
