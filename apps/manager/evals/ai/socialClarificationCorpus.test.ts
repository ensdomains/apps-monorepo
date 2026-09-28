import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildJevAiRequest } from '@/features/ai/intent'
import { NATIVE_REVIEW_CORPUS } from './nativeReviewCorpus'
import nativeFrozen from './nativeReviewCorpus.freeze.json'
import { SOCIAL_CLARIFICATION_CORPUS } from './socialClarificationCorpus'
import socialFrozen from './socialClarificationCorpus.freeze.json'

describe('independently frozen social clarification and native review corpora', () => {
  it.each([
    ['social', SOCIAL_CLARIFICATION_CORPUS, socialFrozen],
    ['native', NATIVE_REVIEW_CORPUS, nativeFrozen],
  ] as const)('keeps the complete %s corpus and exact labels unchanged', (_, cases, frozen) => {
    expect(cases).toHaveLength(frozen.caseCount)
    expect(new Set(cases.map(({ id }) => id)).size).toBe(frozen.caseCount)
    expect(cases.every(({ split }) => split === 'development')).toBe(true)
    expect(
      createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
    ).toBe(frozen.corpusHash)
    expect(
      cases.filter(({ category }) => category === 'supported'),
    ).toHaveLength(frozen.supported)
    expect(
      cases.filter(({ category }) => category === 'clarification'),
    ).toHaveLength(frozen.clarification)
    expect(
      cases.filter(({ category }) => category === 'unsupported'),
    ).toHaveLength(frozen.unsupported)
    for (const testCase of cases) {
      if (testCase.expected.status === 'needs_input')
        expect(testCase.expected.interpretedAction).toBeDefined()
    }
  })

  it('keeps names and quoted keyword values private in the outgoing state', () => {
    for (const testCase of [
      ...SOCIAL_CLARIFICATION_CORPUS,
      ...NATIVE_REVIEW_CORPUS,
    ]) {
      const state = buildJevAiRequest(testCase.query).state
      for (const name of testCase.query.match(/\b[a-z]+\.eth\b/gi) ?? [])
        expect(state, testCase.id).not.toContain(name)
    }
    for (const [id, literal] of [
      ['social-detail-keyword-github-value', 'featured'],
      ['social-detail-keyword-twitter-value', 'primary'],
    ] as const) {
      const testCase = SOCIAL_CLARIFICATION_CORPUS.find((row) => row.id === id)
      if (!testCase) throw new Error('Missing independently labelled case')
      const state = buildJevAiRequest(testCase.query).state
      expect(state, id).not.toContain(literal)
      expect(state, id).toContain('[PROFILE_VALUE_')
    }
  })
})
