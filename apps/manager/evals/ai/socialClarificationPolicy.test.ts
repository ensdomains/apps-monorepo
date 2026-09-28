import { describe, expect, it, vi } from 'vitest'
import type { AiAction } from '@/features/ai/intent'
import { prepareAiDetail } from '@/features/ai/prepareAiDetail'
import { prepareAiHandoff } from '@/features/ai/prepareAiHandoff'
import type { AiEvalCase } from './corpus'
import {
  evaluateInterpretation,
  matchesExpected,
  summarizeEval,
} from './evaluate'
import { runEvalCases } from './runner'

const understood = {
  intent: 'edit_profile',
  section: 'contact',
  field: 'twitch',
  operation: 'feature',
} as const
const missingName: AiEvalCase = {
  id: 'policy-clarification-context',
  query: 'Please star my Twitch contact',
  entryPoint: 'ai',
  family: 'edit_profile',
  category: 'clarification',
  language: 'canonical',
  split: 'development',
  smoke: false,
  expected: {
    status: 'needs_input',
    field: 'name',
    interpretedAction: understood,
  },
}
const evaluate = (action: AiAction, testCase = missingName) =>
  evaluateInterpretation(testCase, { status: 'ok', action }, {})

describe('clarification retains the understood remainder', () => {
  it('records the actual parsed action for an opted-in expectation', () => {
    const result = evaluate(understood)
    expect(result.pass).toBe(true)
    expect(result.actual).toEqual(missingName.expected)
  })

  it.each([
    { ...understood, field: 'github' },
    { ...understood, operation: 'unfeature' },
    { ...understood, value: 'invented-handle' },
    { ...understood, expectedValue: 'unrequested-old-handle' },
  ] as const)('fails a right question with a contradictory remainder: %j', (action) => {
    const result = evaluate(action)
    expect(result.actual.status).toBe('needs_input')
    expect(result.pass).toBe(false)
  })

  it('counts an invented target as a wrong ready proposal', () => {
    const result = evaluate({ ...understood, name: 'invented.eth' })
    expect(result.pass).toBe(false)
    expect(result.unsafeProposal).toBe(true)
  })

  it('does not hide an extra next action behind a correct question', () => {
    const result = evaluateInterpretation(
      missingName,
      {
        status: 'ok',
        action: understood,
        multiAction: { nextIntent: 'renew' },
      },
      {},
    )
    expect(result.pass).toBe(false)
    expect(result.actual).toMatchObject({ nextIntent: 'renew' })
  })

  it('keeps legacy expected shapes and historical scoring unchanged', () => {
    const result = evaluate(understood, {
      ...missingName,
      expected: { status: 'needs_input', field: 'name' },
    })
    expect(result.pass).toBe(true)
    expect(result.actual).toEqual({ status: 'needs_input', field: 'name' })
  })

  it('never counts clarification of an unsupported remainder as rejection', () => {
    const result = evaluate(understood, {
      ...missingName,
      category: 'unsupported',
      expected: { status: 'unsupported' },
    })
    expect(result.pass).toBe(false)
  })

  it('reports an incorrect clarification separately from safe rejection', () => {
    const wrong = evaluate({ ...understood, operation: 'unfeature' })
    const rejected = evaluateInterpretation(
      missingName,
      { status: 'unsupported' },
      {},
    )
    expect(summarizeEval([wrong, rejected])).toMatchObject({
      total: 2,
      passed: 0,
      incorrectProposals: 0,
      incorrectClarificationProposals: 1,
    })
  })

  it('stops subsequent calls when a clarification carries contradictory supplied details', async () => {
    const choice = (value: string) => ({
      type: 'choice',
      choice: value,
      confidence: 0.99,
    })
    const body = {
      answers: {
        intent: choice('edit_profile'),
        fully_supported: { type: 'noul', noul: 1 },
        unsupported_requirement: { type: 'noul', noul: 0 },
        multi_action: { type: 'noul', noul: 0 },
        next_intent: choice('none'),
        request_mode: choice('requested'),
        action_count: choice('one'),
        profile_field: choice('twitch'),
        profile_operation: choice('feature'),
        profile_value: choice('none'),
        profile_previous_value: choice('none'),
        profile_network: choice('none'),
      },
    }
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const deliberatelyMismatchedOracle: AiEvalCase = {
      ...missingName,
      expected: {
        status: 'needs_input',
        field: 'name',
        interpretedAction: { ...understood, operation: 'unfeature' },
      },
    }
    const results = await runEvalCases({
      cases: [deliberatelyMismatchedOracle, { ...missingName, id: 'later' }],
      key: 'synthetic-test-key',
      fetcher,
      stopOnIncorrectProposal: true,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(summarizeEval(results)).toMatchObject({
      incorrectClarificationProposals: 1,
      notRun: 1,
    })
    expect(results[1]?.actual).toEqual({
      status: 'not_run',
      reason: 'aborted_after_incorrect_proposal',
    })
  })
})

describe('full action outcome policy', () => {
  const expected = {
    status: 'ready',
    action: {
      intent: 'edit_profile',
      name: 'kingfisher.eth',
      section: 'contact',
      proposal: { field: 'github', operation: 'feature', value: '' },
    },
  } as const

  it.each([
    { ...expected.action, name: 'meadowlark.eth' },
    {
      ...expected.action,
      proposal: { field: 'github', operation: 'unfeature', value: '' },
    },
    { ...expected.action, proposal: { field: 'github', value: 'featured' } },
  ])('rejects a contradictory name, operation or substituted value: %j', (action) => {
    expect(matchesExpected(expected, { status: 'ready', action })).toBe(false)
  })
})

describe('native detail completion preserves the requested operation', () => {
  it('binds only the submitted name and keeps the feature proposal', () => {
    expect(prepareAiHandoff(understood).status).toBe('needs_input')
    expect(prepareAiDetail(understood, {}, 'name', 'kingfisher.eth')).toEqual({
      status: 'accepted',
      inputs: { name: 'kingfisher.eth' },
      preparation: {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'kingfisher.eth',
          section: 'contact',
          proposal: { field: 'twitch', operation: 'feature', value: '' },
        },
      },
    })
    expect(understood).not.toHaveProperty('name')
  })

  it('retains the exact supplied target and unfeature operation after field selection', () => {
    const action = Object.freeze({
      intent: 'edit_profile',
      name: 'meadowlark.eth',
      section: 'contact',
      operation: 'unfeature',
      fieldRequested: true,
    } as const)
    expect(prepareAiDetail(action, {}, 'profileField', 'instagram')).toEqual({
      status: 'accepted',
      inputs: { profileField: 'instagram' },
      preparation: {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'meadowlark.eth',
          section: 'contact',
          proposal: { field: 'instagram', operation: 'unfeature', value: '' },
        },
      },
    })
    expect(
      prepareAiDetail(action, {}, 'profileField', 'eth_address').status,
    ).toBe('invalid')
  })

  it('does not invent a name while a field is also missing', () => {
    const action = {
      intent: 'edit_profile',
      section: 'contact',
      operation: 'unfeature',
      fieldRequested: true,
    } as const
    expect(
      prepareAiDetail(action, {}, 'profileField', 'instagram').status,
    ).toBe('invalid')
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })
})
