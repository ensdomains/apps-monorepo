import { describe, expect, it } from 'vitest'
import { splitBulkSelectionDuration } from './bulkSelectionIntent'

const choice = (value: string) => ({
  type: 'choice',
  choice: value,
  confidence: 0.99,
})

describe('bulk selection versus added duration', () => {
  it.each([
    [
      'Renew my favourite names for 69 days, sorted by expiry',
      'Renew my favourite names, sorted by expiry',
      { durationDays: 69 },
    ],
    [
      'Renew my favourite names 69 days',
      'Renew my favourite names',
      { durationDays: 69 },
    ],
    [
      'Extend those names another ten weeks',
      'Extend those names',
      { durationDays: 70 },
    ],
    [
      'Renew comet.eth and fern.eth for two years',
      'Renew comet.eth and fern.eth',
      { durationYears: 2 },
    ],
    [
      'Renew my V2 names for 69',
      'Renew my V2 names',
      { durationUnitRequested: true, durationAmount: 69 },
    ],
    [
      'Renew my V2 names for years',
      'Renew my V2 names',
      { durationUnitRequested: true },
    ],
    ['Renew my names for a year', 'Renew my names', { durationYears: 1 }],
    ['Renew my names fr 69 dys', 'Renew my names', { durationDays: 69 }],
    ['Renew my names for69days', 'Renew my names', { durationDays: 69 }],
    ['Renew my names 69d', 'Renew my names', { durationDays: 69 }],
    [
      'Renew for 69 days my names expiring within 45 days',
      'Renew my names expiring within 45 days',
      { durationDays: 69 },
    ],
    [
      'Renew my names expiring within 45 days for two years by expiry',
      'Renew my names expiring within 45 days by expiry',
      { durationYears: 2 },
    ],
  ])('preserves every duration in %s', (query, selection, duration) => {
    expect(splitBulkSelectionDuration(query as string)).toEqual({
      selection,
      duration,
    })
  })

  it.each([
    'Renew my names expiring within 45 days',
    'Renew names expiring in 45 days',
    'Renew names with 45 days left',
    'Renew those names within 14 days of expiring',
    'Renew names within fourteen days of expiry',
    'Renew those names except favourites',
    'Take my favorite names through renewal',
    'Renew first.eth and second.eth',
    'Renew my V2 names by expiry',
    'Renew 69days.eth and for69days.eth',
  ])('retains a selection without inventing extra time: %s', (query) => {
    expect(splitBulkSelectionDuration(query)).toEqual({
      selection: query,
      duration: {},
    })
  })

  it.each([
    'Renew my names for 3 months',
    'Renew my names for 10 hours',
    'Renew my names for - 69 days',
    'Renew my names for two three days',
    'Renew my names for 69.5 days',
    'Renew my names for half a year',
    'Renew my names for quarter of a year',
    'Renew my names for one and a half years',
    'Renew my names in 45 days',
    'Renew my names within 45 days',
    'Renew 5 names',
    'Renew names for 69 bananas',
    'Renew names for 69 days and 2 years',
    'Renew names expiring within 45 days for 69 days and 2 years',
    'Renew my names through',
    'Renew my names through next week',
    'Take my favorite names through renewal until',
  ])('rejects unsupported or unclassified quantities: %s', (query) => {
    expect(splitBulkSelectionDuration(query)).toBeNull()
    expect(
      splitBulkSelectionDuration(query, {
        duration_purpose: choice('added'),
        duration_unit: choice('years'),
      }),
    ).toBeNull()
  })

  it('does not let optimistic model facets change a literal search deadline into added time', () => {
    expect(
      splitBulkSelectionDuration('Renew names within 45 days', {
        duration_purpose: choice('added'),
        duration_unit: choice('days'),
      }),
    ).toBeNull()
  })

  it('can clarify a semantic added amount with no unit instead of dropping it', () => {
    expect(
      splitBulkSelectionDuration('Extend those names 69', {
        duration_purpose: choice('added'),
      }),
    ).toEqual({
      selection: 'Extend those names',
      duration: { durationUnitRequested: true, durationAmount: 69 },
    })
  })
})
