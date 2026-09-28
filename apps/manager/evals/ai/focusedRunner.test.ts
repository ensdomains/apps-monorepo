import { describe, expect, it, vi } from 'vitest'
import type { AiEvalCase } from './corpus'
import { buildEvalRequest } from './evaluate'
import {
  buildFocusedAiRequest,
  focusedEvidenceKeys,
  interpretFocusedAi,
} from './focusedInterpreter'
import {
  hashFocusedHarness,
  inspectFocusedRequest,
  runFocusedCases,
  runFocusedPair,
  summarizeFocusedPairs,
} from './focusedRunner'

const testCase: AiEvalCase = {
  id: 'focused-harness-only',
  entryPoint: 'ai',
  family: 'set_primary',
  category: 'supported',
  language: 'canonical',
  split: 'development',
  smoke: false,
  query: 'Set terracotta.eth as primary',
  expected: {
    status: 'ready',
    action: { intent: 'set_primary', name: 'terracotta.eth' },
  },
}
const choice = (value: string) => ({
  type: 'choice',
  choice: value,
  confidence: 0.95,
})
const noul = (value: number) => ({ type: 'noul', noul: value })
const body = () => {
  const keys = focusedEvidenceKeys('primary')
  return {
    answers: {
      intent: choice('set_primary'),
      request_mode: choice('requested'),
      action_count: choice('one'),
      next_intent: choice('none'),
      multi_action: noul(0.05),
      fully_supported: noul(0.4),
      unsupported_requirement: noul(0.6),
      [keys.supportKey]: noul(0.95),
      [keys.unsupportedKey]: noul(0.05),
      ...Object.fromEntries(
        [
          'expiry',
          'role',
          'version',
          'upgrade',
          'favorite',
          'primary',
          'sort',
        ].map((key) => [key, choice('any')]),
      ),
    },
  }
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('focused same-capture evaluation', () => {
  it('derives baseline from the raw body even if the candidate returns a false baseline', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(body()))
    const interpreter: typeof interpretFocusedAi = async (query, provider) => {
      const parsed = await interpretFocusedAi(query, provider)
      return {
        ...parsed,
        baselineResult: parsed.result,
        originalResponse: parsed.response,
      }
    }
    const pair = await runFocusedPair({
      testCase,
      key: 'private-key',
      fetcher,
      interpreter,
    })
    expect(pair.baseline.actual.status).toBe('unsupported')
    expect(pair.candidate.actual).toEqual(testCase.expected)
  })

  it('fingerprints the actual interpreter, harness, scoring and frozen corpus sources', async () => {
    const source = await hashFocusedHarness()
    expect(source.hash).toHaveLength(64)
    expect(Object.keys(source.files)).toEqual(
      expect.arrayContaining([
        'focusedRunner.ts',
        'focusedInterpreter.ts',
        'focused.eval.ts',
        'evaluate.ts',
        'focusedCorpus.ts',
        'focusedCorpus.freeze.json',
      ]),
    )
    expect(
      Object.values(source.files).every((value) => value.length === 64),
    ).toBe(true)
  })

  it('keeps earlier captures and marks the remaining denominator when preflight fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(body()))
    const interpreter: typeof interpretFocusedAi = (query, provider) => {
      if (query === 'preflight failure') throw new Error('private diagnostic')
      return interpretFocusedAi(query, provider)
    }
    const pairs = await runFocusedCases({
      cases: [
        testCase,
        { ...testCase, id: 'preflight', query: 'preflight failure' },
        { ...testCase, id: 'unattempted' },
      ],
      key: 'private-key',
      fetcher,
      interpreter,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(pairs).toHaveLength(3)
    expect(pairs[0]?.calls[0]?.response).toEqual(body())
    expect(pairs[1]?.harnessError).toBe('candidate_interpreter_error')
    expect(pairs[2]?.candidate.actual).toEqual({
      status: 'not_run',
      reason: 'aborted_after_interpreter_error',
    })
    expect(summarizeFocusedPairs(pairs)).toMatchObject({
      totalProviderCalls: 1,
      harnessFailures: 1,
      candidate: { notRun: 2 },
    })
    expect(JSON.stringify(pairs)).not.toContain('private diagnostic')
  })

  it('scores original versus real family evidence and counts one shared request', async () => {
    const response = body()
    const before = structuredClone(response)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(response))
    const pair = await runFocusedPair({
      testCase,
      key: 'synthetic-private-key',
      fetcher,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(pair.baseline.actual.status).toBe('unsupported')
    expect(pair.candidate.actual).toEqual(testCase.expected)
    expect(pair.calls[0]).toMatchObject({
      phase: 'fanout',
      stateMatchesBaseline: true,
      originalQuestionsUnchanged: true,
      response: before,
    })
    expect(response).toEqual(before)
    expect(JSON.stringify(pair)).not.toContain('synthetic-private-key')
    expect(summarizeFocusedPairs([pair])).toMatchObject({
      totalProviderCalls: 1,
      providerFailures: 0,
      recoveredExact: 1,
      lostExact: 0,
      privacyStateVerifiedCalls: 1,
    })
  })

  it('records unchanged question hashes and the augmented request size', () => {
    const original = buildEvalRequest(testCase)
    const metadata = inspectFocusedRequest(
      buildFocusedAiRequest(testCase.query),
      original,
    )
    expect(metadata.candidateQuestionCount).toBeGreaterThan(
      metadata.originalQuestionCount,
    )
    expect(metadata.candidateRequestBytes).toBeGreaterThan(
      metadata.originalRequestBytes,
    )
    expect(metadata.questionHashes.intent).toHaveLength(64)
    expect(metadata.originalRequestHash).not.toBe(metadata.requestHash)
  })

  it.each([
    'state',
    'question',
    'private-addition',
  ])('rejects changed %s before any network work', (change) => {
    const request = buildFocusedAiRequest(testCase.query)
    const tampered =
      change === 'state'
        ? { ...request, state: testCase.query }
        : {
            ...request,
            questions: {
              ...request.questions,
              ...(change === 'question'
                ? { intent: {} }
                : {
                    focused_private: {
                      type: 'noul',
                      instructions: testCase.query,
                    },
                  }),
            },
          }
    expect(() =>
      inspectFocusedRequest(tampered, buildEvalRequest(testCase)),
    ).toThrow(/focused_/)
  })

  it('never sends names, supplied values or credentials in the provider body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ answers: {} }))
    await runFocusedPair({
      testCase: {
        ...testCase,
        query: 'Set terracotta.eth email to private@example.com',
      },
      key: 'synthetic-private-key',
      fetcher,
    })
    const payload = String(fetcher.mock.calls[0]?.[1]?.body)
    expect(payload).not.toContain('terracotta.eth')
    expect(payload).not.toContain('private@example.com')
    expect(payload).not.toContain('synthetic-private-key')
  })

  it('counts a failed shared request once and aborts later cases on denial', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('private diagnostic', { status: 403 }),
      )
    const pairs = await runFocusedCases({
      cases: [testCase, { ...testCase, id: 'not-attempted' }],
      key: 'private-key',
      fetcher,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(summarizeFocusedPairs(pairs)).toMatchObject({
      totalProviderCalls: 1,
      providerFailures: 1,
      baseline: { providerErrors: 1, notRun: 1 },
      candidate: { providerErrors: 1, notRun: 1 },
    })
    expect(JSON.stringify(pairs)).not.toContain('private diagnostic')
    expect(JSON.stringify(pairs)).not.toContain('private-key')
  })

  it('does not retry timeouts or count provider failure as semantic improvement', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('private error', 'TimeoutError'))
    const pair = await runFocusedPair({ testCase, key: 'private-key', fetcher })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(pair.calls[0]?.error).toBe('timeout')
    expect(summarizeFocusedPairs([pair])).toMatchObject({
      completedPairs: 0,
      recoveredExact: 0,
      providerFailures: 1,
    })
  })

  it('stops later cases when either interpretation proposes a wrong action', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(body()))
    const pairs = await runFocusedCases({
      cases: [
        { ...testCase, expected: { status: 'unsupported' } },
        { ...testCase, id: 'not-attempted' },
      ],
      key: 'private-key',
      fetcher,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(pairs[1]?.candidate.actual).toEqual({
      status: 'not_run',
      reason: 'aborted_after_incorrect_proposal',
    })
    expect(summarizeFocusedPairs(pairs).candidate.incorrectProposals).toBe(1)
  })

  it('preserves the raw capture when candidate code throws afterward', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(body()))
    const interpreter: typeof interpretFocusedAi = async (query, provider) => {
      await provider(buildFocusedAiRequest(query), 'fanout')
      throw new Error('private implementation diagnostic')
    }
    const pair = await runFocusedPair({
      testCase,
      key: 'private-key',
      fetcher,
      interpreter,
    })
    expect(pair.harnessError).toBe('candidate_interpreter_error')
    expect(pair.calls[0]?.response).toEqual(body())
    expect(JSON.stringify(pair)).not.toContain(
      'private implementation diagnostic',
    )
    expect(summarizeFocusedPairs([pair])).toMatchObject({
      providerFailures: 0,
      harnessFailures: 1,
      totalProviderCalls: 1,
    })
  })
})
