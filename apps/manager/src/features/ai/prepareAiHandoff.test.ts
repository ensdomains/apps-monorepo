import { describe, expect, it } from 'vitest'
import { prepareAiHandoff } from './prepareAiHandoff'

describe('prepareAiHandoff', () => {
  it('allows an explicitly requested complete wallet set and retains it for follow-up renewal', () => {
    expect(
      prepareAiHandoff({ intent: 'find_names', filters: {}, allNames: true }),
    ).toEqual({
      status: 'ready',
      action: { intent: 'find_names', filters: {} },
    })
    expect(
      prepareAiHandoff(
        { intent: 'bulk_renew', filters: {}, referencedSelection: true },
        { lastFilters: {} },
      ),
    ).toEqual({
      status: 'ready',
      action: { intent: 'bulk_renew', filters: {} },
    })
    expect(
      prepareAiHandoff({ intent: 'bulk_renew', filters: {} }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'bulk_renew',
        filters: {},
        referencedSelection: true,
      }),
    ).toMatchObject({ status: 'invalid' })
  })
  it.each([
    'months',
    'banana',
    'DAYS',
    '',
  ])('rejects an invalid clarified duration unit: %s', (durationUnit) => {
    for (const intent of ['renew', 'register'] as const) {
      expect(
        prepareAiHandoff(
          {
            intent,
            name: 'pookie.eth',
            durationAmount: 69,
            durationUnitRequested: true,
          },
          { durationUnit },
        ),
      ).toMatchObject({
        status: 'invalid',
        message: 'Choose days, weeks, or years for the duration.',
      })
      expect(
        prepareAiHandoff(
          { intent, name: 'pookie.eth', durationDays: 69 },
          { durationUnit },
        ),
      ).toMatchObject({ status: 'invalid' })
    }
  })

  it('clarifies units without defaulting an unknown unit to days', () => {
    const renewal = {
      intent: 'renew',
      name: 'pookie.eth',
      durationAmount: 2,
      durationUnitRequested: true,
    } as const
    expect(prepareAiHandoff(renewal)).toMatchObject({
      status: 'needs_input',
      field: 'durationUnit',
    })
    for (const [durationUnit, expected] of [
      ['days', { durationDays: 2 }],
      ['weeks', { durationDays: 14 }],
      ['years', { durationYears: 2 }],
    ] as const) {
      expect(prepareAiHandoff(renewal, { durationUnit })).toMatchObject({
        status: 'ready',
        action: expected,
      })
    }
    expect(
      prepareAiHandoff(
        { ...renewal, intent: 'register' },
        { durationUnit: 'years' },
      ),
    ).toMatchObject({ status: 'ready', action: { durationDays: 730 } })
  })
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

  it('combines follow-up facets with the prior selection and rejects conflicts', () => {
    expect(
      prepareAiHandoff(
        {
          intent: 'bulk_renew',
          filters: { favorite: 'no' },
          referencedSelection: true,
        },
        { lastFilters: { role: 'manager', expiry: 'expiring' } },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: {
          role: 'manager',
          expiry: 'expiring',
          favorite: 'no',
          withinDays: 30,
        },
      },
    })
    expect(
      prepareAiHandoff(
        {
          intent: 'bulk_renew',
          filters: { role: 'owner' },
          referencedSelection: true,
        },
        { lastFilters: { role: 'manager' } },
      ),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff(
        {
          intent: 'bulk_renew',
          filters: { expiry: 'expiring', withinDays: 20 },
          referencedSelection: true,
        },
        { lastFilters: { expiry: 'expiring', withinDays: 45 } },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'bulk_renew',
        filters: { expiry: 'expiring', withinDays: 20 },
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
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
      },
    })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        linkRequested: true,
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
        linkService: 'github',
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
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        linkService: 'github',
        value: 'https://github.com.evil.example/yoginth',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        value: 'https://example.com/profile',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'links',
        link: { name: 'Link', url: 'https://example.com/profile' },
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

  it('retains an explicit all-eligible migration selection for the native review', () => {
    expect(
      prepareAiHandoff({
        intent: 'migrate',
        excludeManagerRestoration: false,
        allEligible: true,
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'migrate',
        excludeManagerRestoration: false,
        allEligible: true,
      },
    })
  })

  it('does not broaden a specific migration subset with an all-eligible marker', () => {
    for (const action of [
      {
        intent: 'migrate' as const,
        excludeManagerRestoration: true,
        allEligible: true as const,
      },
      {
        intent: 'migrate' as const,
        excludeManagerRestoration: false,
        allEligible: true as const,
        names: ['pookie.eth'],
      },
    ]) {
      const { allEligible: _, ...expected } = action
      expect(prepareAiHandoff(action)).toEqual({
        status: 'ready',
        action: expected,
      })
    }
  })

  it('validates typed profile values and proposes them in the editor draft', () => {
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'general',
        field: 'description',
        value: 'I build ENS tools.',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'general',
        proposal: { field: 'description', value: 'I build ENS tools.' },
      },
    })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'general',
        field: 'description',
        value: 'x'.repeat(501),
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'general',
        field: 'avatar',
        value: 'javascript:alert(1)',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'general',
        field: 'avatar',
        value: 'https://example.com/avatar.png',
      }),
    ).toMatchObject({
      status: 'ready',
      action: {
        proposal: { field: 'avatar', value: 'https://example.com/avatar.png' },
      },
    })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'contact',
        field: 'email',
        value: 'bad@',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'contact',
        field: 'email',
        value: 'me@example.com',
      }),
    ).toMatchObject({
      status: 'ready',
      action: { proposal: { field: 'email', value: 'me@example.com' } },
    })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'addresses',
        field: 'eth_address',
        value: '0x123',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'addresses',
        field: 'eth_address',
        value: '0x000000000000000000000000000000000000dEaD',
      }),
    ).toMatchObject({
      status: 'ready',
      action: {
        proposal: {
          field: 'eth_address',
          value: '0x000000000000000000000000000000000000dEaD',
        },
      },
    })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'appearance',
        field: 'theme',
        value: 'Garnet',
      }),
    ).toMatchObject({
      status: 'ready',
      action: { proposal: { field: 'theme', value: '#E72A96' } },
    })
    expect(
      prepareAiHandoff({
        intent: 'edit_profile',
        name: 'yoginth.eth',
        section: 'appearance',
        field: 'theme',
        value: 'Rainbow',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff(
        {
          intent: 'edit_profile',
          name: 'yoginth.eth',
          section: 'contact',
          field: 'email',
        },
        { profileValue: 'me@example.com' },
      ),
    ).toMatchObject({
      status: 'ready',
      action: { proposal: { field: 'email', value: 'me@example.com' } },
    })
  })
})
