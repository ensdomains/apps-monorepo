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

const dnsName: SearchNameKind = {
  type: 'dns-name',
  name: 'vitalik.xyz',
  isSubname: false,
}

describe('classifyNameSearch', () => {
  it('returns invalid for invalid kinds', () => {
    expect(
      classifyNameSearch({
        kind: { type: 'invalid', name: 'ab.eth', reason: 'too-short' },
        existence: { status: 'pending' },
        availability: { status: 'pending' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'invalid', name: 'ab.eth', reason: 'too-short' })
  })

  it('treats an available 2LD as available', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'unowned' },
        availability: { status: 'available' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'available', name: 'alice.eth' })
  })

  it('uses the 2LD registrar shortcut: unavailable means taken', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'unowned' },
        availability: { status: 'unavailable' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'owned', name: 'alice.eth' })
  })

  it('surfaces a 2LD availability lookup failure as an error', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'unowned' },
        availability: { status: 'error' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'error', name: 'alice.eth' })
  })

  it('waits for 2LD availability', () => {
    expect(
      classifyNameSearch({
        kind: eth2ld,
        existence: { status: 'owned' },
        availability: { status: 'pending' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'loading', name: 'alice.eth' })
  })

  it('treats an owned subname as owned', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'owned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'owned', name: '1.1.sugh004.eth' })
  })

  it('treats an unowned subname as not found', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'not-found', name: '1.1.sugh004.eth' })
  })

  it('surfaces a subname existence lookup failure as an error', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'unknown' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'error', name: '1.1.sugh004.eth' })
  })

  it('waits for subname existence lookup', () => {
    expect(
      classifyNameSearch({
        kind: subname,
        existence: { status: 'pending' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'loading', name: '1.1.sugh004.eth' })
  })

  it('treats an unowned DNS 2LD under a supported TLD as not imported', () => {
    expect(
      classifyNameSearch({
        kind: dnsName,
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'supported' },
      }),
    ).toEqual({ type: 'not-imported', name: 'vitalik.xyz' })
  })

  it('treats an unowned DNS 2LD under an unsupported TLD as not found', () => {
    expect(
      classifyNameSearch({
        kind: { type: 'dns-name', name: 'vitalik.ethh', isSubname: false },
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'unsupported' },
      }),
    ).toEqual({ type: 'not-found', name: 'vitalik.ethh' })
  })

  it('does not treat a failed TLD support lookup as unsupported', () => {
    expect(
      classifyNameSearch({
        kind: dnsName,
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'error' },
      }),
    ).toEqual({ type: 'not-imported', name: 'vitalik.xyz' })
  })

  it('waits for TLD support before classifying an unowned DNS 2LD', () => {
    expect(
      classifyNameSearch({
        kind: dnsName,
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'pending' },
      }),
    ).toEqual({ type: 'loading', name: 'vitalik.xyz' })
  })

  it('treats an unowned DNS subname as not found', () => {
    expect(
      classifyNameSearch({
        kind: { type: 'dns-name', name: 'sub.vitalik.xyz', isSubname: true },
        existence: { status: 'unowned' },
        availability: { status: 'skipped' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type: 'not-found', name: 'sub.vitalik.xyz' })
  })

  it.each([
    [{ status: 'owned' }, 'owned'],
    [{ status: 'pending' }, 'loading'],
    [{ status: 'unknown' }, 'error'],
  ] as const)('keeps DNS 2LD existence %o as %s', (existence, type) => {
    expect(
      classifyNameSearch({
        kind: dnsName,
        existence,
        availability: { status: 'skipped' },
        tldSupport: { status: 'skipped' },
      }),
    ).toEqual({ type, name: 'vitalik.xyz' })
  })
})
