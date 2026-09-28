import { describe, expect, it } from 'vitest'
import { FAMILY_AI_EVAL_CORPUS } from './familyCorpus'
import { selectEvalCases } from './runner'

describe('independent focused family challenge', () => {
  it('adds 48 distinct queries without changing previous corpus expectations', () => {
    const prior = [
      'legacy',
      'fresh',
      'expansion',
      'robustness',
      'candidate',
    ].flatMap((corpus) => selectEvalCases({ corpus }))
    const key = ({ query, entryPoint }: (typeof prior)[number]) =>
      `${entryPoint}:${query.toLowerCase()}`
    const previous = new Set(prior.map(key))
    expect(prior).toHaveLength(670)
    expect(FAMILY_AI_EVAL_CORPUS).toHaveLength(48)
    expect(new Set(FAMILY_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(48)
    expect(new Set(FAMILY_AI_EVAL_CORPUS.map(key)).size).toBe(48)
    expect(FAMILY_AI_EVAL_CORPUS.some((row) => previous.has(key(row)))).toBe(
      false,
    )
  })

  it('keeps 16 cases per focused area with supported, missing and rejected outcomes', () => {
    for (const area of ['migration', 'profile', 'selection'])
      expect(
        FAMILY_AI_EVAL_CORPUS.filter(({ id }) =>
          id.startsWith(`family-${area}-`),
        ),
      ).toHaveLength(16)
    expect(
      FAMILY_AI_EVAL_CORPUS.filter(({ category }) => category === 'supported'),
    ).toHaveLength(31)
    expect(
      FAMILY_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(5)
    expect(
      FAMILY_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'unsupported',
      ),
    ).toHaveLength(12)
    expect(
      FAMILY_AI_EVAL_CORPUS.filter(({ language }) => language === 'typo'),
    ).toHaveLength(4)
  })

  it('reserves every fourth case and keeps the smoke set within development', () => {
    expect(
      selectEvalCases({ corpus: 'family', split: 'development' }),
    ).toHaveLength(36)
    expect(
      selectEvalCases({ corpus: 'family', split: 'heldout' }),
    ).toHaveLength(12)
    const smoke = selectEvalCases({ corpus: 'family', smoke: true })
    expect(smoke).toHaveLength(9)
    expect(smoke.every(({ split }) => split === 'development')).toBe(true)
    expect(selectEvalCases({})).toHaveLength(140)
  })
})
