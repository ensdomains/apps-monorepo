import { describe, expect, it } from 'vitest'
import { buildSuggestions, parseSearchInput } from './searchSuggestions.utils'
import type { SearchHistoryItem } from './useSearchHistory'

describe('parseSearchInput', () => {
  it('returns empty for blank input', () => {
    expect(parseSearchInput('')).toEqual({ type: 'empty' })
    expect(parseSearchInput('  ')).toEqual({ type: 'empty' })
  })

  it('parses a plain name and appends .eth', () => {
    expect(parseSearchInput('bigint')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
  })

  it('parses a name with TLD as-is', () => {
    expect(parseSearchInput('bigint.eth')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
  })

  it('parses subnames', () => {
    expect(parseSearchInput('sub.bigint.eth')).toEqual({
      type: 'name',
      value: 'sub.bigint.eth',
    })
  })

  it('lowercases names', () => {
    expect(parseSearchInput('BigInt')).toEqual({
      type: 'name',
      value: 'bigint.eth',
    })
  })

  it('parses a valid address', () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const result = parseSearchInput(address)
    expect(result.type).toBe('address')
  })
})

describe('buildSuggestions', () => {
  const emptyHistory: SearchHistoryItem[] = []

  it('returns history items when input is empty', () => {
    const history: SearchHistoryItem[] = [
      { kind: 'name', value: 'alice.eth', timestamp: 1 },
      {
        kind: 'address',
        value: '0x1234567890abcdef1234567890abcdef12345678',
        timestamp: 2,
      },
    ]

    const result = buildSuggestions({
      parsedInput: { type: 'empty' },
      history,
    })

    expect(result).toEqual([
      { type: 'name', value: 'alice.eth' },
      { type: 'address', value: '0x1234567890abcdef1234567890abcdef12345678' },
    ])
  })

  it('normalizes names from persisted history', () => {
    const history: SearchHistoryItem[] = [
      { kind: 'name', value: 'ＦＯＯ.eth', timestamp: 1 },
    ]

    const result = buildSuggestions({
      parsedInput: { type: 'empty' },
      history,
    })

    expect(result).toEqual([{ type: 'name', value: 'foo.eth' }])
  })

  it('returns only the typed name as the single suggestion', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'bigint.eth' },
      history: emptyHistory,
    })

    expect(result).toEqual([
      {
        type: 'name',
        value: 'bigint.eth',
      },
    ])
  })

  it('keeps invalid names visible so the UI can explain why they are unsupported', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'invalid', value: 'ab_c.eth' },
      history: emptyHistory,
    })

    expect(result).toEqual([{ type: 'name', value: 'ab_c.eth' }])
  })

  it('suggests the raw name and its .eth form for an unsupported TLD', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: '1.1.sugh004' },
      history: emptyHistory,
      tldStatus: 'unsupported',
    })

    expect(result).toEqual([
      { type: 'name', value: '1.1.sugh004' },
      { type: 'name', value: '1.1.sugh004.eth' },
    ])
  })

  it('does not append .eth to a name with a supported non-ETH TLD', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'vitalik.xyz' },
      history: emptyHistory,
      tldStatus: 'supported',
    })

    expect(result).toEqual([{ type: 'name', value: 'vitalik.xyz' }])
  })

  it('returns address suggestion with primary name', () => {
    const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
    const result = buildSuggestions({
      parsedInput: { type: 'address', value: address },
      primaryName: 'vitalik.eth',
      history: emptyHistory,
    })

    expect(result).toEqual([
      { type: 'address', value: address },
      { type: 'name', value: 'vitalik.eth' },
      { type: 'separator' },
    ])
  })

  it('limits results to 6', () => {
    const history: SearchHistoryItem[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'name' as const,
      value: `name${i}.eth`,
      timestamp: i,
    }))

    const result = buildSuggestions({
      parsedInput: { type: 'empty' },
      history,
    })

    expect(result).toHaveLength(6)
  })

  it('hides history when actively searching', () => {
    const history: SearchHistoryItem[] = [
      { kind: 'name', value: 'old.eth', timestamp: 1 },
    ]

    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'new.eth' },
      history,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ value: 'new.eth' })
  })
})
