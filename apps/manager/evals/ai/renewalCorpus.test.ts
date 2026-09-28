import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { RENEWAL_AI_EVAL_CORPUS } from './renewalCorpus'
import { selectEvalCases } from './runner'

describe('independent renewal and profile-role challenge', () => {
  it('adds 60 distinct requests without replacing prior labels', () => {
    const prior = [
      'legacy',
      'fresh',
      'expansion',
      'robustness',
      'candidate',
      'family',
    ].flatMap((corpus) => selectEvalCases({ corpus }))
    const signature = ({ query, entryPoint }: (typeof prior)[number]) =>
      `${entryPoint}:${query.toLowerCase()}`
    const oldQueries = new Set(prior.map(signature))
    expect(prior).toHaveLength(718)
    expect(RENEWAL_AI_EVAL_CORPUS).toHaveLength(60)
    expect(
      createHash('sha256')
        .update(JSON.stringify(RENEWAL_AI_EVAL_CORPUS))
        .digest('hex'),
    ).toBe('42b20e4512443e4c5013fdacbcb1bad267eb98aec6a9901d2c530ec36514d3a6')
    expect(new Set(RENEWAL_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(60)
    expect(new Set(RENEWAL_AI_EVAL_CORPUS.map(signature)).size).toBe(60)
    expect(
      RENEWAL_AI_EVAL_CORPUS.some((row) => oldQueries.has(signature(row))),
    ).toBe(false)
  })

  it('balances explicit time roles, shared dates and profile roles', () => {
    for (const area of ['time', 'date', 'profile'])
      expect(
        RENEWAL_AI_EVAL_CORPUS.filter(({ id }) =>
          id.startsWith(`renewal-${area}-`),
        ),
      ).toHaveLength(20)
    const categoryCount = (
      category: (typeof RENEWAL_AI_EVAL_CORPUS)[number]['category'],
    ) =>
      RENEWAL_AI_EVAL_CORPUS.filter((row) => row.category === category).length
    expect(categoryCount('supported')).toBe(35)
    expect(categoryCount('clarification')).toBe(8)
    expect(categoryCount('unsupported')).toBe(17)
    expect(
      RENEWAL_AI_EVAL_CORPUS.filter(({ language }) => language === 'typo'),
    ).toHaveLength(8)
  })

  it('keeps the fixed 45/15 split and development-only smoke cases', () => {
    expect(
      selectEvalCases({ corpus: 'renewal', split: 'development' }),
    ).toHaveLength(45)
    expect(
      selectEvalCases({ corpus: 'renewal', split: 'heldout' }),
    ).toHaveLength(15)
    for (const row of RENEWAL_AI_EVAL_CORPUS) {
      const ordinal = Number(row.id.split('-').at(-1))
      expect(row.split).toBe(ordinal % 4 === 0 ? 'heldout' : 'development')
    }
    const smoke = selectEvalCases({ corpus: 'renewal', smoke: true })
    expect(smoke).toHaveLength(9)
    expect(smoke.every(({ split }) => split === 'development')).toBe(true)
    expect(selectEvalCases({})).toHaveLength(140)
  })
})
