import { describe, expect, it } from 'vitest'
import {
  buildJevActionDetailQuestions,
  getQuantityCandidates,
  parseSemanticDuration,
} from './actionDetails'

const optimistic = (unit: 'days' | 'weeks' | 'years' = 'days') => ({
  duration_purpose: { type: 'choice', choice: 'added', confidence: 1 },
  duration_unit: { type: 'choice', choice: unit, confidence: 1 },
  duration_amount: { type: 'choice', choice: 'amount_1', confidence: 1 },
})

describe('literal action quantities', () => {
  it.each([
    '- 10',
    '−10',
    '− 10',
    '﹣10',
    '－10',
    'minus ten',
    'negative ten',
  ])('does not turn a negative quantity into positive renewal time: %s', (quantity) => {
    expect(
      parseSemanticDuration(
        `renew pookie.eth for ${quantity} days`,
        optimistic(),
      ),
    ).toBeNull()
  })

  it.each([
    'two three',
    'twenty forty',
    'one and two',
    'one hundred hundred',
    'one thousand thousand',
    'one hundred and',
    'one thousand and',
  ])('rejects malformed number words rather than summing them: %s', (quantity) => {
    expect(
      parseSemanticDuration(
        `renew pookie.eth for ${quantity} days`,
        optimistic(),
      ),
    ).toBeNull()
    expect(
      Object.values(
        buildJevActionDetailQuestions(`renew pookie.eth for ${quantity} days`, [
          'pookie.eth',
        ]).duration_amount.criteria,
      ),
    ).not.toContain('The supplied quantity NaN.')
  })

  it.each([
    ['twenty-one', 21],
    ['forty five', 45],
    ['one hundred', 100],
    ['one hundred and twenty', 120],
    ['nine hundred ninety nine', 999],
    ['one thousand', 1000],
    ['one thousand and twenty five', 1025],
    ['two thousand one hundred and five', 2105],
    ['1,000', 1000],
  ] as const)('preserves a valid written quantity: %s', (quantity, durationDays) => {
    expect(
      parseSemanticDuration(
        `renew pookie.eth for ${quantity} days`,
        optimistic(),
      ),
    ).toEqual({ durationDays })
  })

  it.each([
    ['for a day', 'days', { durationDays: 1 }],
    ['for a week', 'weeks', { durationDays: 7 }],
    ['for a year', 'years', { durationYears: 1 }],
    ['for an additional year', 'years', { durationYears: 1 }],
    ['by an extra week', 'weeks', { durationDays: 7 }],
  ] as const)('treats an unambiguous article plus unit as one: %s', (phrase, unit, duration) => {
    expect(
      parseSemanticDuration(`renew pookie.eth ${phrase}`, optimistic(unit)),
    ).toEqual(duration)
    expect(parseSemanticDuration(`renew pookie.eth ${phrase}`)).toEqual(
      duration,
    )
  })

  it.each([
    'a year and a half',
    'a half year',
    'one and a half days',
    'a quarter year',
    'two point five days',
    'one million days',
  ])('rejects unsupported fractional or expanded quantities: %s', (phrase) => {
    expect(
      parseSemanticDuration(
        `renew pookie.eth for ${phrase}`,
        optimistic('years'),
      ),
    ).toBeNull()
  })

  it('does not treat an arbitrary article or a name token as a quantity', () => {
    expect(getQuantityCandidates('renew a name')).toEqual([])
    expect(
      getQuantityCandidates('renew twenty-one.eth for a year'),
    ).toMatchObject([{ value: 1, text: 'a' }])
    expect(
      parseSemanticDuration('renew half.eth for a year', optimistic('years')),
    ).toEqual({ durationYears: 1 })
  })

  it('rejects scheduled and unsupported compound durations without discarding their quantities', () => {
    expect(
      parseSemanticDuration('renew pookie.eth in a year', optimistic('years')),
    ).toBeNull()
    expect(
      parseSemanticDuration(
        'renew pookie.eth for a week and a day',
        optimistic(),
      ),
    ).toBeNull()
  })
})
