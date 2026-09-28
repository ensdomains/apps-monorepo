import { describe, expect, it } from 'vitest'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { prepareAiDetail } from './prepareAiDetail'
import { type AiHandoffInputs, prepareAiHandoff } from './prepareAiHandoff'

describe('submitted AI action details', () => {
  it.each([
    'feature',
    'unfeature',
  ] as const)('asks for a social contact and preserves the %s operation through selection', (operation) => {
    const action = {
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      fieldRequested: true,
      operation,
    } as const
    const requested = prepareAiHandoff(action)
    expect(requested).toMatchObject({
      status: 'needs_input',
      field: 'profileField',
      label: 'Social contact',
    })
    if (requested.status !== 'needs_input') throw new Error('Expected a picker')
    expect(requested.options?.map(({ value }) => value)).toEqual(
      PROFILE_FIELD_DEFINITIONS.filter(
        ({ storage }) => storage === 'social',
      ).map(({ field }) => field),
    )
    expect(prepareAiDetail(action, {}, 'profileField', 'github')).toEqual({
      status: 'accepted',
      inputs: { profileField: 'github' },
      preparation: {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'pookie.eth',
          section: 'contact',
          proposal: { field: 'github', operation, value: '' },
        },
      },
    })
    for (const invalidField of [
      'eth_address',
      'link',
      'email',
      'description',
    ]) {
      expect(
        prepareAiDetail(action, {}, 'profileField', invalidField),
      ).toMatchObject({
        status: 'invalid',
      })
    }
  })

  it('does not commit partial, invalid, or empty ENS names', () => {
    const inputs: AiHandoffInputs = Object.freeze({ durationDays: 69 })
    for (const name of ['p', 'pookie.', '.eth', '']) {
      expect(
        prepareAiDetail({ intent: 'register' }, inputs, 'name', name),
      ).toMatchObject({ status: 'invalid', message: expect.any(String) })
      expect(inputs).toEqual({ durationDays: 69 })
    }
  })

  it('advances from a submitted name to a missing URL and preserves the name', () => {
    const action = {
      intent: 'edit_profile',
      section: 'links',
      linkRequested: true,
      linkService: 'github',
    } as const
    const name = prepareAiDetail(action, {}, 'name', 'pookie.eth')
    expect(name).toEqual({
      status: 'accepted',
      inputs: { name: 'pookie.eth' },
      preparation: {
        status: 'needs_input',
        field: 'url',
        message: 'Paste the link URL to add.',
      },
    })
    if (name.status !== 'accepted') throw new Error('Expected accepted name')

    expect(prepareAiDetail(action, name.inputs, 'url', '')).toMatchObject({
      status: 'invalid',
    })
    expect(
      prepareAiDetail(action, name.inputs, 'url', 'https://example.com/me'),
    ).toMatchObject({ status: 'invalid' })
    expect(name.inputs).toEqual({ name: 'pookie.eth' })

    expect(
      prepareAiDetail(action, name.inputs, 'url', 'https://github.com/me'),
    ).toEqual({
      status: 'accepted',
      inputs: { name: 'pookie.eth', url: 'https://github.com/me' },
      preparation: {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'pookie.eth',
          section: 'links',
          link: { name: 'GitHub', url: 'https://github.com/me' },
        },
      },
    })
  })

  it('preserves the complete submitted description and existing inputs', () => {
    const description =
      'I build ENS tools. Find me around the Ethereum community.'
    const inputs: AiHandoffInputs = Object.freeze({ name: 'pookie.eth' })
    expect(
      prepareAiDetail(
        { intent: 'edit_profile', section: 'general', field: 'description' },
        inputs,
        'profileValue',
        description,
      ),
    ).toEqual({
      status: 'accepted',
      inputs: { name: 'pookie.eth', profileValue: description },
      preparation: {
        status: 'ready',
        action: {
          intent: 'edit_profile',
          name: 'pookie.eth',
          section: 'general',
          proposal: { field: 'description', value: description },
        },
      },
    })
    expect(inputs).toEqual({ name: 'pookie.eth' })
  })

  it('validates submitted registration and renewal durations before committing', () => {
    const inputs: AiHandoffInputs = Object.freeze({ name: 'pookie.eth' })
    for (const duration of ['', '27', '1.5', 'invalid', 'Infinity']) {
      expect(
        prepareAiDetail(
          { intent: 'register' },
          inputs,
          'durationDays',
          duration,
        ),
      ).toMatchObject({ status: 'invalid' })
    }
    expect(
      prepareAiDetail({ intent: 'register' }, inputs, 'durationDays', '69'),
    ).toMatchObject({
      status: 'accepted',
      inputs: { name: 'pookie.eth', durationDays: 69 },
      preparation: {
        status: 'ready',
        action: { intent: 'register', name: 'pookie.eth', durationDays: 69 },
      },
    })
    expect(
      prepareAiDetail({ intent: 'renew' }, inputs, 'durationYears', '101'),
    ).toMatchObject({ status: 'invalid' })
    expect(
      prepareAiDetail({ intent: 'renew' }, inputs, 'durationYears', '2'),
    ).toMatchObject({
      status: 'accepted',
      inputs: { name: 'pookie.eth', durationYears: 2 },
      preparation: {
        status: 'ready',
        action: { intent: 'renew', name: 'pookie.eth', durationYears: 2 },
      },
    })
    expect(inputs).toEqual({ name: 'pookie.eth' })
  })
})
