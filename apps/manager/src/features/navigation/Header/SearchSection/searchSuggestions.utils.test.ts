import { describe, expect, it } from 'vitest'
import { buildSuggestions, parseSearchInput } from './searchSuggestions.utils'
import type { SearchHistoryItem } from './useSearchHistory'

describe('parseSearchInput', () => {
  it('returns error for empty input', () => {
    expect(parseSearchInput('')).toEqual({ type: 'error' })
    expect(parseSearchInput('  ')).toEqual({ type: 'error' })
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
      parsedInput: { type: 'error' },
      indexerDomains: [],
      indexerFetched: false,
      indexerLoading: false,
      indexerError: false,
      history,
    })

    expect(result).toEqual([
      { type: 'name', value: 'alice.eth' },
      { type: 'address', value: '0x1234567890abcdef1234567890abcdef12345678' },
    ])
  })

  it('returns primary name suggestion for name input', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'bigint.eth' },
      indexerDomains: [],
      indexerFetched: true,
      indexerLoading: false,
      indexerError: false,
      history: emptyHistory,
    })

    expect(result).toEqual([
      {
        type: 'name',
        value: 'bigint.eth',
        isRegistered: false,
        isLoading: false,
        isError: false,
      },
    ])
  })

  it('shows loading state while indexer is fetching', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'bigint.eth' },
      indexerDomains: [],
      indexerFetched: false,
      indexerLoading: true,
      indexerError: false,
      history: emptyHistory,
    })

    expect(result[0]).toMatchObject({
      type: 'name',
      isRegistered: undefined,
      isLoading: true,
    })
  })

  it('marks name as registered when indexer has exact match', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'bigint.eth' },
      indexerDomains: [{ name: 'bigint.eth', normalizedName: 'bigint.eth' }],
      indexerFetched: true,
      indexerLoading: false,
      indexerError: false,
      history: emptyHistory,
    })

    expect(result[0]).toMatchObject({
      type: 'name',
      value: 'bigint.eth',
      isRegistered: true,
    })
  })

  it('adds indexer results as registered suggestions', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'big.eth' },
      indexerDomains: [
        { name: 'bigint.eth', normalizedName: 'bigint.eth' },
        { name: 'bigboss.eth', normalizedName: 'bigboss.eth' },
      ],
      indexerFetched: true,
      indexerLoading: false,
      indexerError: false,
      history: emptyHistory,
    })

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ value: 'big.eth', isRegistered: false })
    expect(result[1]).toMatchObject({ value: 'bigint.eth', isRegistered: true })
    expect(result[2]).toMatchObject({
      value: 'bigboss.eth',
      isRegistered: true,
    })
  })

  it('deduplicates exact match from indexer results', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'bigint.eth' },
      indexerDomains: [
        { name: 'bigint.eth', normalizedName: 'bigint.eth' },
        { name: 'bigboss.eth', normalizedName: 'bigboss.eth' },
      ],
      indexerFetched: true,
      indexerLoading: false,
      indexerError: false,
      history: emptyHistory,
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ value: 'bigint.eth', isRegistered: true })
    expect(result[1]).toMatchObject({
      value: 'bigboss.eth',
      isRegistered: true,
    })
  })

  it('returns address suggestion with primary name', () => {
    const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
    const result = buildSuggestions({
      parsedInput: { type: 'address', value: address },
      primaryName: 'vitalik.eth',
      indexerDomains: [],
      indexerFetched: false,
      indexerLoading: false,
      indexerError: false,
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
      parsedInput: { type: 'error' },
      indexerDomains: [],
      indexerFetched: false,
      indexerLoading: false,
      indexerError: false,
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
      indexerDomains: [],
      indexerFetched: true,
      indexerLoading: false,
      indexerError: false,
      history,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ value: 'new.eth' })
  })

  it('shows error state when indexer fails', () => {
    const result = buildSuggestions({
      parsedInput: { type: 'name', value: 'test.eth' },
      indexerDomains: [],
      indexerFetched: false,
      indexerLoading: false,
      indexerError: true,
      history: emptyHistory,
    })

    expect(result[0]).toMatchObject({
      isError: true,
      isRegistered: undefined,
    })
  })
})
