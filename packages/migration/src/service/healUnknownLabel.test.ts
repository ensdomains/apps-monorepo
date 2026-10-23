import type { LookupRecord } from '@ens-apps/indexer/bigname'
import { describe, expect, it } from 'vitest'
import { healUnknownLabel } from './healUnknownLabel'

const record = (name: string): LookupRecord =>
  ({ name, namehash: '0x00', read_status: 'ok' }) as unknown as LookupRecord

describe('healUnknownLabel', () => {
  it('fills an encoded labelhash with the requested label that hashes to it', () => {
    const stored =
      '[ac0fdfc7eec4a82d6493c6dabe0e07d60eac9af7a3d1a54e431d79d4d9e2520a].quiet-raven.eth'
    expect(
      healUnknownLabel(record(stored), 'anotherwallet.quiet-raven.eth').name,
    ).toBe('anotherwallet.quiet-raven.eth')
  })

  it('leaves the record alone when nothing matches', () => {
    const stored =
      '[ac0fdfc7eec4a82d6493c6dabe0e07d60eac9af7a3d1a54e431d79d4d9e2520a].quiet-raven.eth'
    expect(healUnknownLabel(record(stored), 'other.quiet-raven.eth').name).toBe(
      stored,
    )
    expect(healUnknownLabel(record(stored), 'a.b.quiet-raven.eth').name).toBe(
      stored,
    )
    expect(
      healUnknownLabel(record('red.quiet-raven.eth'), 'red.quiet-raven.eth')
        .name,
    ).toBe('red.quiet-raven.eth')
  })
})
