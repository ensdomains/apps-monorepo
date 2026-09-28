import { describe, expect, it } from 'vitest'
import { hasCompleteProfileOwnerViewRequest } from '@/features/ai/profileNativeRead'
import { OWNER_QUESTION_CORPUS } from './ownerQuestionCorpus'
import { selectEvalCases } from './runner'

describe('current-owner question evaluation', () => {
  it('preserves seven independent fixed labels for live interpretation', () => {
    expect(OWNER_QUESTION_CORPUS).toHaveLength(7)
    expect(new Set(OWNER_QUESTION_CORPUS.map(({ id }) => id)).size).toBe(7)
    expect(selectEvalCases({ corpus: 'owner_question' })).toEqual(
      OWNER_QUESTION_CORPUS,
    )
  })

  it('checks the complete local meaning without changing expected outcomes', () => {
    for (const { query, expected } of OWNER_QUESTION_CORPUS)
      expect(hasCompleteProfileOwnerViewRequest(query)).toBe(
        expected.status !== 'unsupported',
      )
  })
})
