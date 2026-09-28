import { describe, expect, it } from 'vitest'
import { AI_EVAL_CORPUS } from './corpus'
import { selectEvalCases } from './runner'

describe('independently labelled Manager AI evaluation corpus', () => {
  it('keeps all 140 distinct cases and their independent target outcomes', () => {
    expect(AI_EVAL_CORPUS).toHaveLength(140)
    expect(new Set(AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(140)
    expect(
      new Set(
        AI_EVAL_CORPUS.map(({ entryPoint, query }) => `${entryPoint}:${query}`),
      ).size,
    ).toBe(140)
    expect(
      AI_EVAL_CORPUS.filter(({ entryPoint }) => entryPoint === 'ai'),
    ).toHaveLength(120)
    expect(
      AI_EVAL_CORPUS.filter(({ entryPoint }) => entryPoint === 'dashboard'),
    ).toHaveLength(20)
  })

  it('balances supported requests across all ten existing action families', () => {
    const cases = AI_EVAL_CORPUS.filter(
      ({ category, entryPoint }) =>
        category === 'supported' && entryPoint === 'ai',
    )
    expect(cases).toHaveLength(80)
    const families = [...new Set(cases.map(({ family }) => family))]
    expect(families).toHaveLength(10)
    for (const family of families)
      expect(
        cases.filter((testCase) => testCase.family === family),
      ).toHaveLength(8)
  })

  it('reserves 20 clarifications and 20 explicit rejections for the action launcher', () => {
    expect(
      AI_EVAL_CORPUS.filter(
        ({ category, entryPoint }) =>
          category === 'clarification' && entryPoint === 'ai',
      ),
    ).toHaveLength(20)
    expect(
      AI_EVAL_CORPUS.filter(
        ({ category, entryPoint }) =>
          category === 'unsupported' && entryPoint === 'ai',
      ),
    ).toHaveLength(20)
  })

  it('marks an immutable fifth of the corpus for held-out evaluation', () => {
    expect(selectEvalCases({ split: 'heldout' })).toHaveLength(28)
    expect(selectEvalCases({ split: 'development' })).toHaveLength(112)
    expect(
      selectEvalCases({ split: 'heldout' }).filter(
        ({ entryPoint }) => entryPoint === 'ai',
      ),
    ).toHaveLength(24)
  })

  it('selects a 20-case smoke set covering actions, difficult language and refusal', () => {
    const cases = selectEvalCases({ smoke: true })
    expect(cases).toHaveLength(20)
    expect(
      new Set(
        cases
          .filter(({ category }) => category === 'supported')
          .map(({ family }) => family),
      ).size,
    ).toBe(10)
    expect(
      cases.filter(({ category }) => category === 'clarification'),
    ).toHaveLength(3)
    expect(
      cases.filter(({ category }) => category === 'unsupported'),
    ).toHaveLength(3)
  })

  it('includes all six current profile fields with exact literal expected values', () => {
    const fields = AI_EVAL_CORPUS.flatMap(({ expected }) => {
      if (expected.status !== 'ready') return []
      const proposal = expected.action.proposal
      return typeof proposal === 'object' &&
        proposal !== null &&
        'field' in proposal
        ? [proposal.field]
        : []
    })
    expect(new Set(fields)).toEqual(
      new Set([
        'description',
        'avatar',
        'email',
        'github',
        'eth_address',
        'theme',
      ]),
    )
  })

  it.each([
    [
      'renew-3',
      {
        status: 'ready',
        action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
      },
    ],
    [
      'renew-4',
      {
        status: 'ready',
        action: { intent: 'renew', name: 'pookie.eth', durationDays: 10 },
      },
    ],
    [
      'edit_profile-5',
      {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'pookie.eth',
          section: 'contact',
          proposal: { field: 'github', value: 'yoginth' },
        },
      },
    ],
    [
      'notification-2',
      {
        status: 'ready',
        action: {
          intent: 'notification',
          preference: 'favouritedNameExpiry',
          enabled: false,
        },
      },
    ],
    ['clarification-14', { status: 'needs_input', field: 'name' }],
    ['unsupported-1', { status: 'unsupported' }],
  ])('retains the desired outcome for reported regression %s', (id, expected) => {
    expect(selectEvalCases({ ids: [id] })[0]?.expected).toEqual(expected)
  })
})
