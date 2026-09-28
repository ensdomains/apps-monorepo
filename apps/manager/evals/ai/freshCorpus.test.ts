import { describe, expect, it } from 'vitest'
import { AI_EVAL_CORPUS } from './corpus'
import { FRESH_AI_EVAL_CORPUS } from './freshCorpus'
import { selectEvalCases } from './runner'

describe('fresh independent evaluation corpus', () => {
  it('freezes 250 distinct new requests independently of legacy outcomes', () => {
    expect(FRESH_AI_EVAL_CORPUS).toHaveLength(250)
    expect(new Set(FRESH_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(250)
    const signatures = (cases: typeof FRESH_AI_EVAL_CORPUS) =>
      cases.map(
        ({ entryPoint, query }) => `${entryPoint}:${query.toLowerCase()}`,
      )
    const legacy = new Set(signatures(AI_EVAL_CORPUS))
    const fresh = signatures(FRESH_AI_EVAL_CORPUS)
    expect(new Set(fresh).size).toBe(250)
    expect(fresh.some((signature) => legacy.has(signature))).toBe(false)
  })

  it('has 16 supported requests per existing family plus independent difficult cases', () => {
    const supported = FRESH_AI_EVAL_CORPUS.filter(
      ({ category, entryPoint }) =>
        category === 'supported' && entryPoint === 'ai',
    )
    expect(supported).toHaveLength(160)
    const families = new Set(supported.map(({ family }) => family))
    expect(families.size).toBe(10)
    for (const family of families)
      expect(
        supported.filter((testCase) => testCase.family === family),
      ).toHaveLength(16)
    expect(
      FRESH_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(30)
    expect(
      FRESH_AI_EVAL_CORPUS.filter(
        ({ entryPoint }) => entryPoint === 'dashboard',
      ),
    ).toHaveLength(30)
    expect(
      FRESH_AI_EVAL_CORPUS.filter(({ category }) => category === 'unsupported'),
    ).toHaveLength(36)
    expect(
      FRESH_AI_EVAL_CORPUS.filter(({ language }) => language === 'typo'),
    ).toHaveLength(23)
  })

  it('keeps 50 heldout cases and does not change the legacy default', () => {
    expect(selectEvalCases({ corpus: 'fresh', split: 'heldout' })).toHaveLength(
      50,
    )
    expect(
      selectEvalCases({ corpus: 'fresh', split: 'development' }),
    ).toHaveLength(200)
    expect(selectEvalCases({})).toHaveLength(140)
    expect(() => selectEvalCases({ corpus: 'typo' })).toThrow(
      'legacy, fresh, expansion, robustness, candidate, family, renewal or owner_question',
    )
  })

  it('includes all families and both entry points in its 20-case smoke set', () => {
    const smoke = selectEvalCases({ corpus: 'fresh', smoke: true })
    expect(smoke).toHaveLength(20)
    expect(new Set(smoke.map(({ entryPoint }) => entryPoint)).size).toBe(2)
    expect(
      new Set(
        smoke
          .filter(({ category }) => category === 'supported')
          .map(({ family }) => family),
      ).size,
    ).toBe(11)
  })
})
