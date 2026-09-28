import { describe, expect, it } from 'vitest'
import type { AiAction } from '@/features/ai/intent'
import { prepareAiHandoff } from '@/features/ai/prepareAiHandoff'

// Deterministic continuation checks are separate from model classification.
// They verify that answering a targeted control preserves every other detail.
describe('clarification completion without a provider or action execution', () => {
  it('keeps Manager target choices bounded when clarifying a sharing request', () => {
    const action: AiAction = {
      intent: 'manager_action',
      kind: 'share_profile',
      nameCandidates: ['orbit.eth', 'fern.eth'],
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
      options: [
        { value: 'orbit.eth', label: 'orbit.eth' },
        { value: 'fern.eth', label: 'fern.eth' },
      ],
    })
    expect(prepareAiHandoff(action, { name: 'fern.eth' })).toMatchObject({
      status: 'ready',
      action: {
        intent: 'manager_action',
        kind: 'share_profile',
        name: 'fern.eth',
      },
    })
    expect(prepareAiHandoff(action, { name: 'unmentioned.eth' })).toMatchObject(
      { status: 'invalid' },
    )
  })

  it('requires an exact native permission when migration revocation is clarified', () => {
    const action: AiAction = {
      intent: 'manager_action',
      kind: 'migration_revoke',
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(
      prepareAiHandoff(action, { managerValue: 'name-wrapper:hca' }),
    ).toEqual({
      status: 'ready',
      action: { ...action, approval: 'name-wrapper:hca' },
    })
    expect(prepareAiHandoff(action, { managerValue: 'all' })).toMatchObject({
      status: 'invalid',
    })
  })

  it('validates the clarified notification email without turning it into a profile record', () => {
    const action: AiAction = { intent: 'manager_action', kind: 'email_add' }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(
      prepareAiHandoff(action, { managerValue: 'alerts@example.org' }),
    ).toEqual({
      status: 'ready',
      action: { ...action, email: 'alerts@example.org' },
    })
    expect(prepareAiHandoff(action, { managerValue: 'invalid' })).toMatchObject(
      { status: 'invalid' },
    )
  })

  it('preserves the network while clarifying a cryptocurrency address', () => {
    const action: AiAction = {
      intent: 'edit_profile',
      name: 'orbit.eth',
      section: 'addresses',
      field: 'address',
      addressCoinType: 0,
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
    })
    expect(
      prepareAiHandoff(action, {
        profileValue: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'orbit.eth',
        section: 'addresses',
        proposal: {
          field: 'address',
          coinType: 0,
          value: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
        },
      },
    })
    expect(
      prepareAiHandoff(action, {
        profileValue: '0x1111111111111111111111111111111111111111',
      }),
    ).toMatchObject({ status: 'invalid' })
  })

  it('keeps the requested amount and name when a renewal unit is supplied', () => {
    const action: AiAction = {
      intent: 'renew',
      name: 'orbit.eth',
      durationAmount: 10,
      durationUnitRequested: true,
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'durationUnit',
    })
    expect(prepareAiHandoff(action, { durationUnit: 'weeks' })).toEqual({
      status: 'ready',
      action: {
        intent: 'renew',
        name: 'orbit.eth',
        durationDays: 70,
        durationYears: undefined,
      },
    })
    expect(prepareAiHandoff(action, { durationUnit: 'months' })).toMatchObject({
      status: 'invalid',
    })
  })

  it('completes registration across both a name choice and duration unit', () => {
    const action: AiAction = {
      intent: 'register',
      nameCandidates: ['mint-tea.eth', 'nebula.eth'],
      durationAmount: 8,
      durationUnitRequested: true,
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'durationUnit',
    })
    expect(prepareAiHandoff(action, { durationUnit: 'weeks' })).toMatchObject({
      status: 'needs_input',
      field: 'name',
      options: [
        { value: 'mint-tea.eth', label: 'mint-tea.eth' },
        { value: 'nebula.eth', label: 'nebula.eth' },
      ],
    })
    expect(
      prepareAiHandoff(action, { durationUnit: 'weeks', name: 'nebula.eth' }),
    ).toEqual({
      status: 'ready',
      action: { intent: 'register', name: 'nebula.eth', durationDays: 56 },
    })
  })

  it('chooses only a proposed name while preserving explicit years', () => {
    const action: AiAction = {
      intent: 'renew',
      nameCandidates: ['copper.eth', 'lantern.eth'],
      durationYears: 3,
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(prepareAiHandoff(action, { name: 'LANTERN.eth' })).toEqual({
      status: 'ready',
      action: {
        intent: 'renew',
        name: 'lantern.eth',
        durationYears: 3,
        durationDays: undefined,
      },
    })
    expect(prepareAiHandoff(action, { name: 'unmentioned.eth' })).toMatchObject(
      { status: 'invalid' },
    )
  })

  it('asks for a value after the name without losing the replacement condition', () => {
    const action: AiAction = {
      intent: 'edit_profile',
      section: 'contact',
      field: 'github',
      expectedValue: 'old-user',
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(prepareAiHandoff(action, { name: 'meadow.eth' })).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
    })
    expect(
      prepareAiHandoff(action, {
        name: 'meadow.eth',
        profileValue: '@meadow-dev',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'meadow.eth',
        section: 'contact',
        proposal: {
          field: 'github',
          value: 'meadow-dev',
          expectedValue: 'old-user',
        },
      },
    })
  })

  it('completes field and value controls while retaining the ENS target', () => {
    const action: AiAction = {
      intent: 'edit_profile',
      name: 'comet.eth',
      section: 'general',
      fieldRequested: true,
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
    })
    expect(prepareAiHandoff(action, { profileField: 'email' })).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
    })
    expect(
      prepareAiHandoff(action, {
        profileField: 'email',
        profileValue: 'hi@example.org',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'comet.eth',
        section: 'contact',
        proposal: { field: 'email', value: 'hi@example.org' },
      },
    })
    expect(
      prepareAiHandoff(action, {
        profileField: 'email',
        profileValue: 'broken',
      }),
    ).toMatchObject({ status: 'invalid' })
  })

  it('completes notification preference and polarity independently', () => {
    const action: AiAction = { intent: 'notification' }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'notificationPreference',
    })
    expect(
      prepareAiHandoff(action, { notificationPreference: 'ownedNameExpiry' }),
    ).toMatchObject({ status: 'needs_input', field: 'notificationEnabled' })
    expect(
      prepareAiHandoff(action, {
        notificationPreference: 'ownedNameExpiry',
        notificationEnabled: 'off',
      }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'notification',
        preference: 'ownedNameExpiry',
        enabled: false,
      },
    })
    expect(
      prepareAiHandoff(
        { intent: 'notification', enabled: false },
        { notificationPreference: 'ensLabsUpdates' },
      ),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'notification',
        preference: 'ensLabsUpdates',
        enabled: false,
      },
    })
  })

  it('validates a missing link value and preserves a supplied service constraint', () => {
    const action: AiAction = {
      intent: 'edit_profile',
      name: 'aurora.eth',
      section: 'links',
      linkRequested: true,
      linkService: 'github',
    }
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'url',
    })
    expect(
      prepareAiHandoff(action, { url: 'https://example.org/not-github' }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiHandoff(action, { url: 'https://github.com/aurora-builds' }),
    ).toEqual({
      status: 'ready',
      action: {
        intent: 'edit_profile',
        name: 'aurora.eth',
        section: 'links',
        link: { name: 'GitHub', url: 'https://github.com/aurora-builds' },
      },
    })
  })

  it('cannot overwrite literal names or values through stale clarification state', () => {
    expect(
      prepareAiHandoff(
        { intent: 'renew', name: 'fern.eth', durationDays: 12 },
        { name: 'other.eth', durationDays: 999 },
      ),
    ).toMatchObject({
      status: 'ready',
      action: { intent: 'renew', name: 'fern.eth', durationDays: 12 },
    })
    expect(
      prepareAiHandoff(
        {
          intent: 'edit_profile',
          name: 'coral.eth',
          section: 'contact',
          field: 'github',
          value: 'coral-dev',
        },
        { name: 'other.eth', profileValue: 'wrong-user' },
      ),
    ).toMatchObject({
      status: 'ready',
      action: {
        name: 'coral.eth',
        proposal: { field: 'github', value: 'coral-dev' },
      },
    })
  })
})
