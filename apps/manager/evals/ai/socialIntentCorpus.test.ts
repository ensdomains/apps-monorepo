import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SOCIAL_CONTRAST_CORPUS } from './socialContrastCorpus'
import { SOCIAL_INTENT_CORPUS } from './socialIntentCorpus'
import frozen from './socialIntentCorpus.freeze.json'

describe('fresh social intent and resource development contrasts', () => {
  it('retains the independently frozen labels and all sixteen cases', () => {
    expect(SOCIAL_INTENT_CORPUS).toHaveLength(16)
    expect(new Set(SOCIAL_INTENT_CORPUS.map(({ id }) => id)).size).toBe(16)
    expect(
      SOCIAL_INTENT_CORPUS.every(({ split }) => split === 'development'),
    ).toBe(true)
    expect(
      createHash('sha256')
        .update(JSON.stringify(SOCIAL_INTENT_CORPUS))
        .digest('hex'),
    ).toBe(frozen.corpusHash)
  })

  it('keeps ready actions, targeted clarification and rejection distinct', () => {
    expect(
      SOCIAL_INTENT_CORPUS.filter(({ category }) => category === 'supported'),
    ).toHaveLength(8)
    expect(
      SOCIAL_INTENT_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(2)
    expect(
      SOCIAL_INTENT_CORPUS.filter(({ category }) => category === 'unsupported'),
    ).toHaveLength(6)
  })

  it('uses fresh prompts rather than repeating the previous social set', () => {
    const previous = new Set<string>(
      SOCIAL_CONTRAST_CORPUS.map(({ query }) => query),
    )
    expect(
      SOCIAL_INTENT_CORPUS.every(({ query }) => !previous.has(query)),
    ).toBe(true)
  })
})
