import { describe, expect, it } from 'vitest'
import { prepareAiHandoff } from './prepareAiHandoff'

describe('prepareAiHandoff', () => {
  it('normalizes a proposed primary name and asks for a missing name', () => {
    expect(
      prepareAiHandoff({ intent: 'set_primary', name: 'YOGINTH.ETH' }),
    ).toEqual({
      status: 'ready',
      action: { intent: 'set_primary', name: 'yoginth.eth' },
    })
    expect(prepareAiHandoff({ intent: 'set_primary' })).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
  })

  it('requires a valid registration name and 28 or more days', () => {
    expect(
      prepareAiHandoff({
        intent: 'register',
        name: 'yoginth.eth',
        durationDays: 69,
      }),
    ).toEqual({
      status: 'ready',
      action: { intent: 'register', name: 'yoginth.eth', durationDays: 69 },
    })
    expect(
      prepareAiHandoff({
        intent: 'register',
        name: 'sub.yoginth.eth',
        durationDays: 69,
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'register',
        name: 'yoginth.eth',
        durationDays: 27,
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({ intent: 'register', name: 'yoginth.eth' }),
    ).toMatchObject({ status: 'needs_input', field: 'durationDays' })
  })

  it('preserves a two-year renewal and rejects ambiguous durations', () => {
    expect(
      prepareAiHandoff({ intent: 'renew', name: 'name.eth', durationYears: 2 }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'renew',
        name: 'name.eth',
        durationYears: 2,
        durationDays: undefined,
      },
    })
    expect(
      prepareAiHandoff({
        intent: 'renew',
        name: 'name.eth',
        durationYears: 2,
        durationDays: 30,
      }),
    ).toMatchObject({ status: 'invalid' })
  })

  it('requires a prior selection for "those names" and carries the same filters to review', () => {
    const action = {
      intent: 'bulk_renew',
      filters: {},
      referencedSelection: true,
    } as const
    expect(prepareAiHandoff(action)).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff(action, {
        lastFilters: { expiry: 'expiring', withinDays: 45, role: 'manager' },
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { expiry: 'expiring', withinDays: 45, role: 'manager' },
      },
    })
  })

  it('validates profile links and preserves notification and migration proposals', () => {
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
      }),
    ).toMatchObject({ status: 'needs_input', field: 'url' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        value: 'javascript:alert(1)',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        value: 'https://github.com/yoginth',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        link: { name: 'GitHub', url: 'https://github.com/yoginth' },
      },
    })
    expect(
      prepareAiHandoff({
        intent: 'notification',
        preference: 'favouritedNameExpiry',
        enabled: true,
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'notification',
        preference: 'favouritedNameExpiry',
        enabled: true,
      },
    })
    expect(
      prepareAiHandoff({ intent: 'migrate', excludeManagerRestoration: true }),
    ).toEqual({
      status: 'ready',
      action: { intent: 'migrate', excludeManagerRestoration: true },
    })
  })
})
