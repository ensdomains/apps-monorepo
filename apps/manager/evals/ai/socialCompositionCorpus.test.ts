import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildJevAiRequest } from '@/features/ai/intent'
import { NATIVE_REVIEW_CORPUS } from './nativeReviewCorpus'
import { SOCIAL_CLARIFICATION_CORPUS } from './socialClarificationCorpus'
import { SOCIAL_COMPOSITION_CORPUS } from './socialCompositionCorpus'
import frozen from './socialCompositionCorpus.freeze.json'
import { SOCIAL_INTENT_CORPUS } from './socialIntentCorpus'

describe('independent compositional social development corpus', () => {
  it('preserves all frozen labels and category counts before provider calls', () => {
    expect(SOCIAL_COMPOSITION_CORPUS).toHaveLength(frozen.caseCount)
    expect(
      createHash('sha256')
        .update(JSON.stringify(SOCIAL_COMPOSITION_CORPUS))
        .digest('hex'),
    ).toBe(frozen.corpusHash)
    expect(new Set(SOCIAL_COMPOSITION_CORPUS.map(({ id }) => id)).size).toBe(30)
    expect(
      SOCIAL_COMPOSITION_CORPUS.every(({ split }) => split === 'development'),
    ).toBe(true)
    for (const category of [
      'supported',
      'clarification',
      'unsupported',
    ] as const)
      expect(
        SOCIAL_COMPOSITION_CORPUS.filter((row) => row.category === category),
      ).toHaveLength(frozen[category])
  })

  it('uses distinct requests and exact supplied context for every clarification', () => {
    const priorQueries = new Set<string>(
      [
        ...SOCIAL_CLARIFICATION_CORPUS,
        ...SOCIAL_INTENT_CORPUS,
        ...NATIVE_REVIEW_CORPUS,
      ].map(({ query }) => query),
    )
    for (const row of SOCIAL_COMPOSITION_CORPUS) {
      expect(priorQueries.has(row.query), row.id).toBe(false)
      if (row.expected.status === 'needs_input') {
        expect(row.expected.interpretedAction, row.id).toBeDefined()
        if (row.expected.field === 'name')
          expect(row.expected.interpretedAction, row.id).not.toHaveProperty(
            'name',
          )
      }
    }
  })

  it('keeps exact ENS targets and quoted keyword values private', () => {
    for (const row of SOCIAL_COMPOSITION_CORPUS) {
      const state = buildJevAiRequest(row.query).state
      for (const name of row.query.match(/\b[a-z]+\.eth\b/g) ?? [])
        expect(state, row.id).not.toContain(name)
      for (const match of row.query.matchAll(/"([^"]+)"/g)) {
        expect(state, row.id).not.toContain(match[1])
        expect(state, row.id).toContain('[PROFILE_VALUE_')
      }
    }
  })
})
