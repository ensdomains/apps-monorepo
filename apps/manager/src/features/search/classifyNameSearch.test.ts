import { describe, expect, it } from 'vitest'
import { classifyNameSearch } from './classifyNameSearch'
import type { SearchNameKind } from './search.types'

const eth2ld: SearchNameKind = {
  type: 'eth-2ld',
  name: 'alice.eth',
  label: 'alice',
}

const subname: SearchNameKind = {
  type: 'eth-subname',
  name: '1.1.sugh004.eth',
}

describe('classifyNameSearch', () => {
  it('returns invalid for invalid kinds', () => {
    expect(
      classifyNameSearch({
        kind: { type: 'invalid', name: 'ab.eth', reason: 'too-short' },
        existence: { status: 'pending' },
        availability: { status: 'pending' },
      }),
    ).toEqual({ type: 'invalid', name: 'ab.eth', reason: 'too-short' })
  })

  it('treats an available 2LD as available', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'unowned' },
        availability: { status: 'available' },
      }),
    ).toEqual({ type: 'available', name: 'alice.eth' })
  })

  it('uses the 2LD registrar shortcut: unavailable means taken', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'unowned' },
        availability: { status: 'unavailable' },
      }),
    ).toEqual({ type: 'owned', name: 'alice.eth' })
  })

  it('lets a 2LD through when availability lookup fails', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
      }),
    ).toEqual({ type: 'unproven', name: 'alice.eth' })
  })

  it('waits for 2LD availability', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'owned' },
        availability: { status: 'pending' },
      }),
    ).toEqual({ type: 'loading', name: 'alice.eth' })
  })

  it('treats an owned subname as owned', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'owned' },
        availability: { status: 'skipped' },
      }),
    ).toEqual({ type: 'owned', name: '1.1.sugh004.eth' })
  })

  it('treats an unowned subname as not found', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
      }),
    ).toEqual({ type: 'not-found', name: '1.1.sugh004.eth' })
  })

  it('assumes a subname exists when existence lookup fails', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'unknown' },
        availability: { status: 'skipped' },
      }),
    ).toEqual({ type: 'unproven', name: '1.1.sugh004.eth' })
  })

  it('waits for subname existence lookup', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'pending' },
        availability: { status: 'skipped' },
      }),
    ).toEqual({ type: 'loading', name: '1.1.sugh004.eth' })
  })
})
