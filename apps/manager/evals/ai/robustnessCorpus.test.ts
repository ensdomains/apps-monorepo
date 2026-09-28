import { describe, expect, it } from 'vitest'
import { AI_EVAL_CORPUS } from './corpus'
import { EXPANSION_AI_EVAL_CORPUS } from './expansionCorpus'
import { FRESH_AI_EVAL_CORPUS } from './freshCorpus'
import { ROBUSTNESS_AI_EVAL_CORPUS } from './robustnessCorpus'
import { selectEvalCases } from './runner'

describe('independent collection and clarification robustness corpus', () => {
  it('freezes 80 new unique requests without replacing earlier labels', () => {
    const earlier = [
      ...AI_EVAL_CORPUS,
      ...FRESH_AI_EVAL_CORPUS,
      ...EXPANSION_AI_EVAL_CORPUS,
    ]
    const signature = ({ query, entryPoint }: (typeof earlier)[number]) =>
      `${entryPoint}:${query.toLowerCase()}`
    const previous = new Set(earlier.map(signature))
    expect(earlier).toHaveLength(550)
    expect(ROBUSTNESS_AI_EVAL_CORPUS).toHaveLength(80)
    expect(new Set(ROBUSTNESS_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(80)
    expect(new Set(ROBUSTNESS_AI_EVAL_CORPUS.map(signature)).size).toBe(80)
    expect(
      ROBUSTNESS_AI_EVAL_CORPUS.some((row) => previous.has(signature(row))),
    ).toBe(false)
  })

  it('reserves a fixed fifth of the cases and keeps smoke development-only', () => {
    const development = selectEvalCases({
      corpus: 'robustness',
      split: 'development',
    })
    const heldout = selectEvalCases({ corpus: 'robustness', split: 'heldout' })
    const smoke = selectEvalCases({ corpus: 'robustness', smoke: true })
    expect(development).toHaveLength(64)
    expect(heldout).toHaveLength(16)
    expect(smoke).toHaveLength(16)
    expect(smoke.every(({ split }) => split === 'development')).toBe(true)
    expect(heldout.map(({ id }) => id)).toEqual(
      ROBUSTNESS_AI_EVAL_CORPUS.filter((_, index) => (index + 1) % 5 === 0).map(
        ({ id }) => id,
      ),
    )
    expect(selectEvalCases({})).toHaveLength(140)
  })

  it('retains positive, clarification and safety expectations independently', () => {
    const count = (category: string) =>
      ROBUSTNESS_AI_EVAL_CORPUS.filter((row) => row.category === category)
        .length
    expect(count('supported')).toBe(48)
    expect(count('clarification')).toBe(8)
    expect(count('unsupported')).toBe(24)
    expect(
      ROBUSTNESS_AI_EVAL_CORPUS.filter(
        ({ entryPoint }) => entryPoint === 'dashboard',
      ),
    ).toHaveLength(4)
    expect(
      ROBUSTNESS_AI_EVAL_CORPUS.filter(({ language }) => language === 'typo'),
    ).toHaveLength(7)
  })

  it('preserves exact collection context, duration and replacement constraints', () => {
    const get = (id: string) =>
      ROBUSTNESS_AI_EVAL_CORPUS.find((row) => row.id === id)
    expect(get('robustness-bulk-7')?.expected).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        names: ['cedar.eth', 'birch.eth'],
        filters: { version: 'v2', favorite: 'no' },
        durationDays: 84,
      },
    })
    expect(get('robustness-profile-2')?.expected).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'birch.eth',
        section: 'contact',
        proposal: {
          field: 'github',
          value: 'birch-new',
          expectedValue: 'birch-old',
        },
      },
    })
    expect(get('robustness-inbox-1')?.expected).toEqual({
      status: 'ready',
      action: {
        intent: 'manager_action',
        kind: 'mark_notifications_read',
        notificationTag: 'expiry',
        unreadOnly: true,
      },
    })
  })
})
