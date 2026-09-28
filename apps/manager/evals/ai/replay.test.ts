import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AI_EVAL_CORPUS } from './corpus'
import { buildEvalRequest, providerFailure } from './evaluate'
import { prepareInitialReplay } from './replay'

const testCase = AI_EVAL_CORPUS[0]
if (!testCase) throw new Error('Missing synthetic test case')
const requestHash = createHash('sha256')
  .update(JSON.stringify(buildEvalRequest(testCase)))
  .digest('hex')
const first = {
  ...providerFailure(testCase, 'synthetic', 12),
  calls: [
    {
      phase: 'initial' as const,
      source: 'stored' as const,
      sourceReport: 'original.json',
      capturedSourceHash: 'original-source',
      requestHash,
      latencyMs: 0,
      response: { answers: {} },
    },
  ],
}
const report = {
  file: 'later-replay.json',
  sourceHash: 'later-source',
  results: [first],
}

describe('first-response replay provenance', () => {
  it('preserves the original response and original capture provenance for unchanged requests', () => {
    const replay = prepareInitialReplay([testCase], [report])
    expect(replay.freshInitialIds).toEqual([])
    expect(replay.storedInitials[testCase.id]).toEqual({
      body: first.calls[0]?.response,
      sourceReport: 'original.json',
      sourceHash: 'original-source',
      requestHash,
    })
    expect(replay.decisions[0]?.reason).toBe('unchanged')
  })
  it('requests exactly one new first response when the request hash changes', () => {
    const changed = {
      ...first,
      calls: [
        {
          ...first.calls[0],
          phase: 'initial' as const,
          requestHash: 'old-payload',
          latencyMs: 12,
        },
      ],
    }
    const replay = prepareInitialReplay(
      [testCase],
      [{ ...report, results: [changed] }],
    )
    expect(replay.freshInitialIds).toEqual([testCase.id])
    expect(replay.storedInitials).toEqual({})
    expect(replay.decisions[0]?.reason).toBe('request_changed')
    expect(changed.calls[0]?.requestHash).toBe('old-payload')
  })
  it('never reuses an infrastructure failure as an interpretation response', () => {
    const replay = prepareInitialReplay(
      [testCase],
      [{ ...report, results: [providerFailure(testCase, 'timeout', 8000)] }],
    )
    expect(replay.freshInitialIds).toEqual([testCase.id])
    expect(replay.decisions[0]?.reason).toBe('initial_unavailable')
  })
  it('rejects missing and ambiguous captured evidence instead of guessing', () => {
    expect(() => prepareInitialReplay([testCase], [])).toThrow(
      'Missing captured case',
    )
    expect(() => prepareInitialReplay([testCase], [report, report])).toThrow(
      'Duplicate captured case',
    )
  })
})
