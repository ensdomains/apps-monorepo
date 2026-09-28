import { describe, expect, it, vi } from 'vitest'
import { summarizeVerification } from './candidateMetrics'
import type { AiEvalCase } from './corpus'
import {
  evaluateInterpretation,
  providerFailure,
  summarizeEval,
} from './evaluate'
import { runLiveCase as runCase, runEvalCases as runCases } from './runner'

const runLiveCase = (...args: Parameters<typeof runCase>) =>
  runCase(args[0], args[1], args[2], args[3], true)
const runEvalCases = (options: Parameters<typeof runCases>[0]) =>
  runCases({ ...options, candidateVerification: true })

const testCase: AiEvalCase = {
  id: 'synthetic-verification-contract',
  entryPoint: 'ai',
  category: 'supported',
  family: 'set_primary',
  language: 'canonical',
  split: 'development',
  smoke: false,
  query: 'Use orchard.eth as my primary name',
  expected: {
    status: 'ready',
    action: { intent: 'set_primary', name: 'orchard.eth' },
  },
}
const choice = (value: string, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const initial = (confidence = 0.4) => ({
  answers: {
    intent: choice('set_primary', confidence),
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    multi_action: { type: 'noul', noul: 0.05 },
    request_mode: choice('requested'),
    action_count: choice('one'),
    next_intent: choice('none'),
    expiry: choice('any'),
    role: choice('any'),
    version: choice('any'),
    upgrade: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    sort: choice('any'),
  },
})
const verified = (operation = 'matches') => ({
  answers: {
    operation: {
      type: 'noul',
      noul:
        operation === 'matches' ? 0.95 : operation === 'unclear' ? 0.6 : 0.05,
    },
    details: { type: 'noul', noul: 0.95 },
    coverage: { type: 'noul', noul: 0.95 },
  },
})
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('conditional verification evaluation accounting', () => {
  it('stops later batches on an incorrect proposal and retains unattempted cases', async () => {
    const wrongExpectation: AiEvalCase = {
      ...testCase,
      expected: { status: 'unsupported' },
    }
    const cases = Array.from({ length: 8 }, (_, index) => ({
      ...wrongExpectation,
      id: `stop-incorrect-${index}`,
    }))
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(initial(0.95)))
    const results = await runCases({
      cases,
      key: 'synthetic-secret',
      fetcher,
      stopOnIncorrectProposal: true,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(results[0]?.actual.status).toBe('ready')
    expect(
      results
        .slice(1)
        .every(
          ({ actual }) =>
            actual.status === 'not_run' &&
            actual.reason === 'aborted_after_incorrect_proposal',
        ),
    ).toBe(true)
    expect(summarizeEval(results)).toMatchObject({
      total: 8,
      evaluated: 1,
      incorrectProposals: 1,
      notRun: 7,
    })
  })
  it('defaults to the live single-call parser without experimental verification', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(initial()))
    const result = await runCase(testCase, 'synthetic-secret', fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.actual.status).toBe('unsupported')
    expect(summarizeVerification([result]).verificationCalls).toBe(0)
  })
  it('replays a stored initial response and counts only the conditional call as provider work', async () => {
    const first = initial()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(verified()))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher, {
      body: first,
      sourceReport: 'immutable-initial-report.json',
      sourceHash: 'captured-source',
      requestHash: 'captured-request',
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.pass).toBe(true)
    expect(result.calls?.[0]).toMatchObject({
      source: 'stored',
      response: first,
      sourceReport: 'immutable-initial-report.json',
      capturedSourceHash: 'captured-source',
      latencyMs: 0,
    })
    expect(summarizeVerification([result])).toMatchObject({
      totalProviderCalls: 1,
      storedInitialResponses: 1,
      initialCalls: 0,
      verificationCalls: 1,
      initialLatency: { count: 0, meanMs: null },
    })
  })

  it('never silently turns an incomplete stored-response set into fresh initial calls', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      runEvalCases({
        cases: [testCase],
        key: 'synthetic-secret',
        fetcher,
        storedInitials: {},
      }),
    ).rejects.toThrow('every selected case')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('recaptures only explicitly selected changed initial requests in hybrid replay', async () => {
    const second = { ...testCase, id: 'changed-initial-request' }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(initial(0.95)))
    const results = await runEvalCases({
      cases: [testCase, second],
      key: 'synthetic-secret',
      fetcher,
      storedInitials: {
        [testCase.id]: {
          body: initial(0.95),
          sourceReport: 'old.json',
          sourceHash: 'old-source',
          requestHash: 'old-request',
        },
      },
      freshInitialIds: [second.id],
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(results.every(({ pass }) => pass)).toBe(true)
    expect(summarizeVerification(results)).toMatchObject({
      totalProviderCalls: 1,
      storedInitialResponses: 1,
      initialCalls: 1,
      verificationCalls: 0,
    })
  })
  it('measures the additional provider call separately from total case latency', () => {
    const baseline = providerFailure(testCase, 'synthetic', 120)
    const result = {
      ...baseline,
      baseline,
      latencyMs: 205,
      calls: [
        {
          phase: 'initial' as const,
          requestHash: 'initial',
          latencyMs: 120,
          response: {},
        },
        {
          phase: 'candidate_verification' as const,
          requestHash: 'verification',
          latencyMs: 75,
          response: {},
        },
      ],
    }
    expect(summarizeVerification([result])).toMatchObject({
      totalProviderCalls: 2,
      initialLatency: { count: 1, meanMs: 120, p50Ms: 120, p95Ms: 120 },
      verificationLatency: { count: 1, meanMs: 75, p50Ms: 75, p95Ms: 75 },
      totalCaseLatency: { count: 1, meanMs: 205, p50Ms: 205, p95Ms: 205 },
    })
  })

  it('keeps dashboard evaluation single-pass even when its first response is uncertain', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}))
    const result = await runLiveCase(
      {
        ...testCase,
        entryPoint: 'dashboard',
        family: 'dashboard',
        query: 'names in grace',
      },
      'synthetic-secret',
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.actual.status).toBe('unsupported')
    expect(summarizeVerification([result])).toMatchObject({
      initialCalls: 1,
      verificationCalls: 0,
    })
  })
  it('records a paired baseline and both raw responses without repeating the first call', async () => {
    const first = initial()
    const second = verified()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(first))
      .mockResolvedValueOnce(json(second))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.baseline).toMatchObject({
      pass: false,
      actual: { status: 'unsupported' },
    })
    expect(result).toMatchObject({ pass: true, actual: testCase.expected })
    expect(
      result.calls?.map(({ phase, response }) => ({ phase, response })),
    ).toEqual([
      { phase: 'initial', response: first },
      { phase: 'candidate_verification', response: second },
    ])
    expect(
      result.calls?.every(
        ({ requestHash, latencyMs }) =>
          requestHash.length === 64 && latencyMs >= 0,
      ),
    ).toBe(true)
    expect(summarizeVerification([result])).toMatchObject({
      initialCalls: 1,
      verificationCalls: 1,
      totalProviderCalls: 2,
      recoveredExactOutcomes: 1,
      lostExactOutcomes: 0,
    })
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
    expect(fetcher.mock.calls[1]?.[1]?.body).not.toContain('orchard.eth')
  })
  it('does not call a verifier when the original interpretation already succeeds', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(initial(0.95)))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(result.baseline?.pass).toBe(true)
    expect(result.pass).toBe(true)
    expect(summarizeVerification([result]).verificationCalls).toBe(0)
  })
  it('keeps a confirmation separate from success even when its full proposal matches', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(initial()))
      .mockResolvedValueOnce(json(verified('unclear')))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(result).toMatchObject({
      pass: false,
      stage: 'confirmation',
      actual: {
        status: 'needs_confirmation',
        proposedOutcome: testCase.expected,
      },
    })
    expect(summarizeEval([result])).toMatchObject({
      passed: 0,
      confirmationRequired: 1,
      incorrectConfirmationProposals: 0,
    })
    expect(summarizeVerification([result])).toMatchObject({
      confirmationsAfterVerification: 1,
      matchingConfirmationOutcomes: 1,
      recoveredExactOutcomes: 0,
    })
  })
  it('counts a wrong target hidden behind confirmation as an incorrect confirmation proposal', () => {
    const result = evaluateInterpretation(
      testCase,
      {
        status: 'needs_confirmation',
        action: { intent: 'set_primary', name: 'sumac.eth' },
      },
      initial(),
    )
    expect(result.pass).toBe(false)
    expect(summarizeEval([result])).toMatchObject({
      confirmationRequired: 1,
      incorrectConfirmationProposals: 1,
    })
  })
  it('records a verification denial as infrastructure failure and aborts remaining cases', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(initial()))
      .mockResolvedValueOnce(
        new Response('private diagnostics', { status: 403 }),
      )
    const results = await runEvalCases({
      cases: [testCase, { ...testCase, id: 'later' }],
      key: 'synthetic-secret',
      fetcher,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(results[0]).toMatchObject({
      actual: { status: 'provider_error', reason: 'http_403' },
      baseline: { actual: { status: 'unsupported' } },
    })
    expect(results[1]?.stage).toBe('not_run')
    expect(summarizeVerification(results)).toMatchObject({
      verificationProviderErrors: 1,
      totalProviderCalls: 2,
    })
    expect(JSON.stringify(results)).not.toContain('private diagnostics')
  })
  it('does not count a rejected candidate as a recovered supported request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(initial()))
      .mockResolvedValueOnce(json(verified('different')))
    const result = await runLiveCase(testCase, 'synthetic-secret', fetcher)
    expect(result.actual.status).toBe('unsupported')
    expect(summarizeVerification([result])).toMatchObject({
      rejectedAfterVerification: 1,
      recoveredExactOutcomes: 0,
    })
  })
})
