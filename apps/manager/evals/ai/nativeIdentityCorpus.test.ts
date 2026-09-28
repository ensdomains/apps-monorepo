import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildJevAiRequest } from '@/features/ai/intent'
import { NATIVE_IDENTITY_CORPUS } from './nativeIdentityCorpus'
import frozen from './nativeIdentityCorpus.freeze.json'

describe('independent primary-profile and ownership-address corpus', () => {
  it('preserves six labels and supplied clarification context', () => {
    expect(NATIVE_IDENTITY_CORPUS).toHaveLength(frozen.caseCount)
    expect(new Set(NATIVE_IDENTITY_CORPUS.map(({ id }) => id)).size).toBe(
      frozen.caseCount,
    )
    expect(
      createHash('sha256')
        .update(JSON.stringify(NATIVE_IDENTITY_CORPUS))
        .digest('hex'),
    ).toBe(frozen.corpusHash)
    for (const category of [
      'supported',
      'clarification',
      'unsupported',
    ] as const)
      expect(
        NATIVE_IDENTITY_CORPUS.filter((row) => row.category === category),
      ).toHaveLength(frozen[category])
    for (const row of NATIVE_IDENTITY_CORPUS) {
      expect(row.split).toBe('development')
      if (row.expected.status === 'needs_input') {
        expect(row.expected.interpretedAction).toEqual({
          intent: 'manager_action',
          kind: 'copy_profile_owner',
        })
        expect(row.expected.field).toBe('name')
      }
    }
  })

  it('keeps literal names outside provider state', () => {
    for (const row of NATIVE_IDENTITY_CORPUS) {
      const state = buildJevAiRequest(row.query).state
      for (const name of row.query.match(/\b[a-z]+\.eth\b/g) ?? [])
        expect(state, row.id).not.toContain(name)
    }
  })
})
