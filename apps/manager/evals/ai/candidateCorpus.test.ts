import { describe, expect, it } from 'vitest'
import { CANDIDATE_AI_EVAL_CORPUS } from './candidateCorpus'
import { AI_EVAL_CORPUS } from './corpus'
import { EXPANSION_AI_EVAL_CORPUS } from './expansionCorpus'
import { FRESH_AI_EVAL_CORPUS } from './freshCorpus'
import { ROBUSTNESS_AI_EVAL_CORPUS } from './robustnessCorpus'
import { selectEvalCases } from './runner'

describe('independent candidate-verification challenge', () => {
  it('adds40 unique requests without changing the earlier630 expectations', () => {
    const prior = [
      ...AI_EVAL_CORPUS,
      ...FRESH_AI_EVAL_CORPUS,
      ...EXPANSION_AI_EVAL_CORPUS,
      ...ROBUSTNESS_AI_EVAL_CORPUS,
    ]
    const key = ({ query, entryPoint }: (typeof prior)[number]) =>
      `${entryPoint}:${query.toLowerCase()}`
    const previous = new Set(prior.map(key))
    expect(prior).toHaveLength(630)
    expect(CANDIDATE_AI_EVAL_CORPUS).toHaveLength(40)
    expect(new Set(CANDIDATE_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(40)
    expect(new Set(CANDIDATE_AI_EVAL_CORPUS.map(key)).size).toBe(40)
    expect(CANDIDATE_AI_EVAL_CORPUS.some((row) => previous.has(key(row)))).toBe(
      false,
    )
  })
  it('covers every action family plus dashboard controls, missing details and safety', () => {
    const supported = CANDIDATE_AI_EVAL_CORPUS.filter(
      ({ category }) => category === 'supported',
    )
    expect(supported).toHaveLength(24)
    expect(new Set(supported.map(({ family }) => family)).size).toBe(12)
    for (const family of new Set(supported.map(({ family }) => family)))
      expect(supported.filter((row) => row.family === family)).toHaveLength(2)
    expect(
      CANDIDATE_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(6)
    expect(
      CANDIDATE_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'unsupported',
      ),
    ).toHaveLength(10)
    expect(
      CANDIDATE_AI_EVAL_CORPUS.filter(({ language }) => language === 'typo'),
    ).toHaveLength(13)
  })
  it('reserves every fifth case before evaluating outputs and keeps smoke in development', () => {
    expect(
      selectEvalCases({ corpus: 'candidate', split: 'development' }),
    ).toHaveLength(32)
    expect(
      selectEvalCases({ corpus: 'candidate', split: 'heldout' }),
    ).toHaveLength(8)
    expect(selectEvalCases({ corpus: 'candidate', smoke: true })).toHaveLength(
      8,
    )
    expect(
      selectEvalCases({ corpus: 'candidate', smoke: true }).every(
        ({ split }) => split === 'development',
      ),
    ).toBe(true)
    expect(selectEvalCases({})).toHaveLength(140)
  })
})
