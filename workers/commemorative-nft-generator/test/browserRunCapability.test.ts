import { describe, expect, it } from 'vitest'
import { evaluateCapabilityRuns } from '../src/browserRunCapability.js'

const media = (png: readonly number[], mp4: readonly number[]) => ({
  png: Uint8Array.from(png),
  mp4: Uint8Array.from(mp4),
})

describe('Browser Run capability selection', () => {
  it('selects Browser Run only for repeatable outputs', () => {
    expect(
      evaluateCapabilityRuns(media([1], [2]), media([1], [2])),
    ).toMatchObject({
      selectedAdapter: 'browser-run',
      status: 'passed',
    })
  })

  it('falls back to the container when either media hash differs', () => {
    expect(evaluateCapabilityRuns(media([1], [2]), media([1], [3]))).toEqual({
      reason: 'Browser Run outputs were not byte-identical across two runs',
      selectedAdapter: 'container',
      status: 'failed',
    })
  })
})
