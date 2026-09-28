import * as v from 'valibot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBulkRenewDurationPrefill } from '@/features/bulk-renew/utils/durationPrefill'
import {
  durationForName,
  newExpiryDateForName,
} from '@/features/bulk-renew/utils/pricing'
import {
  getDurationPrefillSeconds,
  renewalDurationSearchSchema,
} from '@/features/register-v2/utils/durationSearch'
import {
  getTargetDateRenewalDuration,
  isFutureTargetDate,
  isPotentialFutureTargetDate,
  parseTargetCalendarDate,
} from '@/features/renew/utils/targetDate'
import { getAiConfirmationSummary } from './actionConfirmation'
import { parseSemanticDuration } from './actionDetails'
import { splitBulkSelectionDuration } from './bulkSelectionIntent'
import { buildJevAiRequest, parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { splitRenewalTargetDate } from './renewalTargetDateIntent'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    intent: choice('renew'),
    renewal_target: choice('wallet_set'),
    next_intent: choice('none'),
    request_mode: choice('requested'),
    action_count: choice('one'),
    fully_supported: { type: 'noul', noul: 0.99 },
    unsupported_requirement: { type: 'noul', noul: 0.01 },
    multi_action: { type: 'noul', noul: 0.01 },
    selection_constraints: choice('represented'),
    search_shape: choice('conjunction'),
    expiry_window: choice('none'),
    expiry: choice('any'),
    role: choice('any'),
    version: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    upgrade: choice('any'),
    sort: choice('any'),
    ...overrides,
  },
})
const expiry = (year: number, month: number, day: number) =>
  BigInt(new Date(year, month - 1, day, 12).getTime() / 1000)

describe('renewal target dates and duration roles', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2028, 0, 1, 12))
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    ['Renew my V2 names until 2030-07-04', '2030-07-04'],
    ['Renew my V2 names through July 4, 2030', '2030-07-04'],
    ['Renew my V2 names to date 4 July 2030', '2030-07-04'],
    ['Renew my V2 names to the date July 4th 2030', '2030-07-04'],
    ['Make my V2 names expire on 4th July 2030', '2030-07-04'],
    ['Renew my V2 names to the same expiry of 2030-07-04', '2030-07-04'],
    ['renwe my V2 nmaes until 2030-07-04', '2030-07-04'],
  ])('preserves the supplied target through interpretation, preparation and native prefill: %s', (query, targetDate) => {
    const interpreted = parseJevAiResponse(
      response({
        version: choice('v2'),
        expiry_window: choice('unsupported', 0.4),
      }),
      query,
    )
    expect(interpreted?.action).toEqual({
      intent: 'bulk_renew',
      filters: { version: 'v2' },
      targetDate,
    })
    if (!interpreted) throw new Error('Expected interpretation')
    const prepared = prepareAiHandoff(interpreted.action)
    expect(prepared).toEqual({
      status: 'ready',
      action: { intent: 'bulk_renew', filters: { version: 'v2' }, targetDate },
    })
    const names = [
      { name: 'cedar.eth', currentExpiry: expiry(2030, 5, 1) },
      { name: 'birch.eth', currentExpiry: expiry(2030, 6, 1) },
    ]
    const prefill = getBulkRenewDurationPrefill(
      { initialTargetDate: targetDate },
      names,
    )
    expect(prefill.status).toBe('ready')
    if (prefill.status !== 'ready') throw new Error('Expected prefill')
    expect(prefill.selection.kind).toBe('custom')
    for (const name of names) {
      expect(
        durationForName(prefill.selection, name.currentExpiry),
      ).toBeGreaterThanOrEqual(28n * 86_400n)
      const displayed = newExpiryDateForName(
        prefill.selection,
        name.currentExpiry,
      )
      expect([
        displayed.getFullYear(),
        displayed.getMonth() + 1,
        displayed.getDate(),
      ]).toEqual([2030, 7, 4])
    }
    expect(getAiConfirmationSummary(interpreted.action).rows).toContainEqual({
      label: 'Target expiry date (end of local day)',
      value: targetDate,
    })
  })

  it('keeps the existing single-name V1/V2 renewal route contract', () => {
    const interpreted = parseJevAiResponse(
      response({ renewal_target: choice('one') }),
      'Renew cedar.eth until 2030-07-04',
    )
    expect(interpreted?.action).toEqual({
      intent: 'renew',
      name: 'cedar.eth',
      targetDate: '2030-07-04',
    })
    expect(interpreted && prepareAiHandoff(interpreted.action)).toEqual({
      status: 'ready',
      action: { intent: 'renew', name: 'cedar.eth', targetDate: '2030-07-04' },
    })
    const search = v.parse(renewalDurationSearchSchema, {
      targetDate: '2030-07-04',
    })
    const reference = new Date(2030, 6, 3, 15)
    expect(getDurationPrefillSeconds(search, reference)).toBe(
      (new Date(2030, 6, 4, 23, 59, 59).getTime() - reference.getTime()) / 1000,
    )
    expect(() =>
      getDurationPrefillSeconds(search, new Date(2030, 6, 4, 15)),
    ).toThrow('at least 1')
  })

  it('keeps exact names and referenced selections distinct with a target date', () => {
    const exact = parseJevAiResponse(
      response({ renewal_target: choice('exact_list') }),
      'Renew selected.eth and july.eth until 2030-07-04',
    )
    expect(exact?.action).toEqual({
      intent: 'bulk_renew',
      filters: {},
      names: ['selected.eth', 'july.eth'],
      targetDate: '2030-07-04',
    })
    const selected = parseJevAiResponse(
      response(),
      'Make those names expire on July 4 2030',
    )
    expect(selected?.action).toMatchObject({
      intent: 'bulk_renew',
      referencedSelection: true,
      targetDate: '2030-07-04',
    })
    expect(
      selected &&
        prepareAiHandoff(selected.action, {
          lastNames: ['cedar.eth'],
          lastFilters: {},
        }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: {},
        names: ['cedar.eth'],
        targetDate: '2030-07-04',
      },
    })
  })

  it.each([
    [
      'Renew cedar.eth and birch.eth to the same expiry of 2032-02-29',
      '2032-02-29',
    ],
    ['extnd cedar.eth and birch.eth to 19 July 2030', '2030-07-19'],
  ])('accounts for the whole exact-name target-date request: %s', (query, targetDate) => {
    expect(
      parseJevAiResponse(
        response({
          renewal_target: choice('exact_list'),
          expiry_window: choice('unsupported'),
        }),
        query,
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: {},
      names: ['cedar.eth', 'birch.eth'],
      targetDate,
    })
  })

  it('retains a previous matching selection and its exact added duration', () => {
    const interpreted = parseJevAiResponse(
      response({ expiry_window: choice('positive_days', 0.6) }),
      'Renew those matching names for 38 days',
    )
    expect(interpreted?.action).toEqual({
      intent: 'bulk_renew',
      filters: {},
      referencedSelection: true,
      durationDays: 38,
    })
    expect(
      interpreted &&
        prepareAiHandoff(interpreted.action, {
          lastNames: ['cedar.eth', 'birch.eth'],
          lastFilters: { version: 'v2', primary: 'no' },
        }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { version: 'v2', primary: 'no' },
        names: ['cedar.eth', 'birch.eth'],
        durationDays: 38,
      },
    })
  })

  it('settles weak coverage only with a complete literal expiry clause', () => {
    expect(
      parseJevAiResponse(
        response({
          intent: choice('find_names'),
          version: choice('v2'),
          expiry: choice('expiring'),
          expiry_window: choice('positive_days'),
          selection_constraints: choice('represented', 0.57),
        }),
        'Find V2 names with expiry within twenty-nine days',
      )?.action,
    ).toEqual({
      intent: 'find_names',
      filters: { version: 'v2', expiry: 'expiring', withinDays: 29 },
    })
  })

  it('retains strict window validation when the target date accompanies an actual expiry condition', () => {
    const query = 'Renew managed names expiring within 24 days until 2031-09-08'
    const facets = { role: choice('manager'), expiry: choice('expiring') }
    expect(
      parseJevAiResponse(
        response({ ...facets, expiry_window: choice('unsupported', 0.51) }),
        query,
      ),
    ).toBeNull()
    expect(
      parseJevAiResponse(
        response({ ...facets, expiry_window: choice('positive_days') }),
        query,
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { role: 'manager', expiry: 'expiring', withinDays: 24 },
      targetDate: '2031-09-08',
    })
    expect(
      buildJevAiRequest(query).questions.expiry_window.instructions,
    ).toContain('CURRENT expiry condition')
  })

  it('preserves expiry cutoff independently of a shared target date', () => {
    expect(
      parseJevAiResponse(
        response({
          expiry: choice('expiring'),
          expiry_window: choice('positive_days'),
        }),
        'Renew names expiring within 37 days until 2030-07-04',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { expiry: 'expiring', withinDays: 37 },
      targetDate: '2030-07-04',
    })
  })

  it('asks for the missing unit while retaining the exact quantity and targets', () => {
    const interpreted = parseJevAiResponse(
      response({
        expiry_window: choice('positive_days', 0.4),
        renewal_target: choice('exact_list'),
      }),
      'Renew cedar.eth and birch.eth for 31',
    )
    expect(interpreted?.action).toEqual({
      intent: 'bulk_renew',
      filters: {},
      names: ['cedar.eth', 'birch.eth'],
      durationUnitRequested: true,
      durationAmount: 31,
    })
    expect(interpreted && prepareAiHandoff(interpreted.action)).toMatchObject({
      status: 'needs_input',
      field: 'durationUnit',
      message: 'Is 31 in days, weeks, or years?',
    })
    expect(
      interpreted &&
        prepareAiHandoff(interpreted.action, { durationUnit: 'days' }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: {},
        names: ['cedar.eth', 'birch.eth'],
        durationDays: 31,
      },
    })
  })

  it('keeps a grace selection distinct from added renewal years', () => {
    expect(
      parseJevAiResponse(
        response({
          expiry: choice('in-grace'),
          expiry_window: choice('unsupported', 0.4),
        }),
        'Renew names in grace for two years',
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { expiry: 'in-grace' },
      durationYears: 2,
    })
  })

  it.each([
    'Renew names for 31 days and two years',
    'Renew cedar.eth for 31 days or 45 days',
    'Renew cedar.eth for 31 days and 45 days',
  ])('never turns conflicting explicit durations into an empty default: %s', (query) => {
    expect(parseSemanticDuration(query)).toBeNull()
    expect(splitBulkSelectionDuration(query)).toBeNull()
  })

  it.each([
    'Renew names until 2030-02-30',
    'Renew names until 2029-02-29',
    'Renew names until 2027-12-31',
    'Renew names until 03/04/2030',
    'Renew names until July 2030',
    'Renew names until 2030-07-04 and 2031-07-04',
    'Renew names until 2030-07-04 for two years',
    'Renew names for two years until 2030-07-04',
    'Renew names on 2030-07-04',
    'Renew names in grace on July 4 2030',
    'Renew names until 2030-07-04 at 15:00',
    'Renew names until 2030-07-04 UTC',
    'Renew names until 2030-07-04T00:00:00Z',
    'Renew names until 2030-07-04 if gas is cheap',
    'Renew names expiring until 2030-07-04',
    'Renew names until 2030-07-04 and transfer them',
  ])('rejects an ambiguous, invalid or mixed date request: %s', (query) => {
    expect(parseJevAiResponse(response(), query)).toBeNull()
  })

  it('preserves date identity across timezone offsets and rejects rollover', () => {
    const date = parseTargetCalendarDate('2030-07-04')
    expect(
      date && [
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
      ],
    ).toEqual([2030, 6, 4, 0])
    expect(parseTargetCalendarDate('2030-02-30')).toBeNull()
    expect(parseTargetCalendarDate('2030-07-04T00:00:00Z')).toBeNull()
    expect(
      splitRenewalTargetDate('Renew july.eth until 29 February 2032')
        ?.targetDate,
    ).toBe('2032-02-29')
  })

  it('leaves the UTC boundary date for strict browser-local preparation', () => {
    const now = new Date('2028-01-01T01:00:00Z')
    expect(isPotentialFutureTargetDate('2028-01-01', now)).toBe(true)
    expect(isPotentialFutureTargetDate('2027-12-31', now)).toBe(false)
    expect(isFutureTargetDate('2028-01-01', new Date(2028, 0, 1, 12))).toBe(
      false,
    )
    expect(isFutureTargetDate('2028-01-01', new Date(2027, 11, 31, 18))).toBe(
      true,
    )
  })

  it('lands actual transaction expiries on the requested day across daylight saving changes', () => {
    const target = '2030-03-10'
    const names = [
      { name: 'cedar.eth', currentExpiry: expiry(2030, 1, 1) },
      { name: 'birch.eth', currentExpiry: expiry(2030, 2, 1) },
    ]
    const prefill = getBulkRenewDurationPrefill(
      { initialTargetDate: target },
      names,
    )
    if (prefill.status !== 'ready') throw new Error(prefill.message)
    for (const name of names) {
      const actual = new Date(
        Number(
          name.currentExpiry +
            durationForName(prefill.selection, name.currentExpiry),
        ) * 1000,
      )
      expect([
        actual.getFullYear(),
        actual.getMonth(),
        actual.getDate(),
        actual.getHours(),
        actual.getMinutes(),
        actual.getSeconds(),
      ]).toEqual([2030, 2, 10, 23, 59, 59])
      expect(
        newExpiryDateForName(prefill.selection, name.currentExpiry).getTime(),
      ).toBe(actual.getTime())
    }
    const late = new Date(2030, 1, 10, 23, 30)
    const nativeSeconds =
      (new Date(2030, 2, 10, 23, 59, 59).getTime() - late.getTime()) / 1000
    expect(getTargetDateRenewalDuration(target, late, 28).status).toBe(
      nativeSeconds >= 28 * 86_400 ? 'ready' : 'invalid',
    )
  })

  it.each([
    'America/New_York',
    'if gas is cheap',
    'at 15:00 UTC',
    'and sell them',
  ])('cannot drop a target-date qualifier with nonempty filters: %s', (suffix) => {
    expect(
      parseJevAiResponse(
        response({ version: choice('v2') }),
        `Renew my V2 names until 2030-07-04 ${suffix}`,
      ),
    ).toBeNull()
  })

  it('blocks a target below any selected name minimum and names the failing target', () => {
    const names = [
      { name: 'cedar.eth', currentExpiry: expiry(2030, 5, 1) },
      { name: 'birch.eth', currentExpiry: expiry(2030, 6, 7) },
    ]
    const prefill = getBulkRenewDurationPrefill(
      { initialTargetDate: '2030-07-04' },
      names,
    )
    expect(prefill).toMatchObject({
      status: 'invalid',
      message: expect.stringContaining('birch.eth'),
    })
    expect(
      getTargetDateRenewalDuration('2030-07-04', new Date(2030, 5, 6, 12), 28)
        .status,
    ).toBe('ready')
    expect(
      getBulkRenewDurationPrefill(
        { initialTargetDate: '2030-07-04', initialDurationDays: 84 },
        names,
      ).status,
    ).toBe('invalid')
    expect(
      v.safeParse(renewalDurationSearchSchema, {
        targetDate: '2030-07-04',
        durationYears: 2,
      }).success,
    ).toBe(false)
  })

  it('keeps precise paired negative filters in the AI request and action', () => {
    const query =
      'Renew names that are neither favourites nor primary for 31 days'
    expect(buildJevAiRequest(query).state).not.toContain('neither')
    expect(
      parseJevAiResponse(
        response({ favorite: choice('no'), primary: choice('no') }),
        query,
      )?.action,
    ).toEqual({
      intent: 'bulk_renew',
      filters: { favorite: 'no', primary: 'no' },
      durationDays: 31,
    })
    expect(
      parseJevAiResponse(
        response({
          intent: choice('find_names'),
          favorite: choice('no'),
          primary: choice('no'),
        }),
        'Show names that are neither favourites nor primary',
      )?.action,
    ).toEqual({
      intent: 'find_names',
      filters: { favorite: 'no', primary: 'no' },
    })
  })
})
