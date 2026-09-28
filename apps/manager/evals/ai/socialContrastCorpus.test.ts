import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SOCIAL_CONTRAST_CORPUS } from './socialContrastCorpus'
import frozen from './socialContrastCorpus.freeze.json'

describe('fresh social-operation development contrasts', () => {
  it('retains the independently frozen labels and full denominator', () => {
    expect(SOCIAL_CONTRAST_CORPUS).toHaveLength(12)
    expect(new Set(SOCIAL_CONTRAST_CORPUS.map(({ id }) => id)).size).toBe(12)
    expect(
      SOCIAL_CONTRAST_CORPUS.every(({ split }) => split === 'development'),
    ).toBe(true)
    expect(
      createHash('sha256')
        .update(JSON.stringify(SOCIAL_CONTRAST_CORPUS))
        .digest('hex'),
    ).toBe(frozen.corpusHash)
  })

  it('keeps supported, missing-target and unsupported expectations distinct', () => {
    expect(
      SOCIAL_CONTRAST_CORPUS.filter(({ category }) => category === 'supported'),
    ).toHaveLength(9)
    expect(
      SOCIAL_CONTRAST_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(1)
    expect(
      SOCIAL_CONTRAST_CORPUS.filter(
        ({ category }) => category === 'unsupported',
      ),
    ).toHaveLength(2)
  })
})
