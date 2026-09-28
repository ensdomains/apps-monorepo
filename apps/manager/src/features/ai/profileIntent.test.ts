import { describe, expect, it } from 'vitest'
import { parseJevAiResponse } from './intent'
import { prepareAiHandoff } from './prepareAiHandoff'
import { isSingleProfileEdit, parseProfileSection } from './profileIntent'

describe('profile intent details', () => {
  const choice = (value: string) => ({
    type: 'choice',
    choice: value,
    confidence: 0.99,
  })
  const profileAnswers = (
    field: string,
    value = 'value_1',
    previous = 'none',
  ) => ({
    profile_field: choice(field),
    profile_operation: choice(previous === 'none' ? 'set' : 'replace'),
    profile_value: choice(value),
    profile_previous_value: choice(previous),
  })

  it.each([
    ['description', 'description', 'general'],
    ['avatar', 'avatar', 'general'],
    ['email', 'email', 'contact'],
    ['GitHub', 'github', 'contact'],
    ['Ethereum address', 'eth_address', 'addresses'],
    ['theme', 'theme', 'appearance'],
  ])('asks for a missing value when editing the named %s field', (label, field, section) => {
    const action = parseProfileSection(
      `Edit pookie.eth ${label}`,
      'pookie.eth',
      {
        ...profileAnswers(field, 'none'),
        profile_operation: { type: 'choice', choice: 'set', confidence: 0.49 },
      },
    )
    expect(action).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section,
      field,
    })
    if (!action) throw new Error('Expected the requested field edit')
    expect(prepareAiHandoff(action)).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
    })
  })

  it.each([
    ['Edit pookie.eth profile', 'general'],
    ['Edit pookie.eth appearance', 'appearance'],
    ['Edit pookie.eth links', 'links'],
    ['Open pookie.eth description', 'general'],
    ['Open the GitHub editor for pookie.eth', 'contact'],
  ])('keeps section-opening requests without a field assignment: %s', (query, section) => {
    expect(parseProfileSection(query, 'pookie.eth')).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section,
    })
  })

  it('preserves missing description detail through full parsing when the model operation is uncertain', () => {
    const interpretation = parseJevAiResponse(
      {
        answers: {
          fully_supported: { type: 'noul', noul: 0.95 },
          unsupported_requirement: { type: 'noul', noul: 0.08 },
          intent: choice('edit_profile'),
          next_intent: choice('none'),
          multi_action: { type: 'noul', noul: 0.05 },
          request_mode: choice('requested'),
          action_count: choice('one'),
          ...profileAnswers('description', 'none'),
          profile_operation: {
            type: 'choice',
            choice: 'set',
            confidence: 0.49,
          },
        },
      },
      'Edit pookie.eth description',
    )
    expect(interpretation?.action).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'general',
      field: 'description',
    })
    if (!interpretation) throw new Error('Expected a field value clarification')
    expect(prepareAiHandoff(interpretation.action)).toMatchObject({
      status: 'needs_input',
      field: 'profileValue',
      label: 'Description',
    })
  })

  it.each([
    ['set pookie.eth githb to yoginth', 'github', 'yoginth'],
    ['Use yoginth for GitHub on pookie.eth', 'github', 'yoginth'],
    ['make yoginth my github for pookie.eth', 'github', 'yoginth'],
    ['pookie.eth github: yoginth', 'github', 'yoginth'],
    ['my github is now yoginth for pookie.eth', 'github', 'yoginth'],
    [
      'set pookie.eth descreption to "I build ENS tools!"',
      'description',
      'I build ENS tools!',
    ],
    [
      'change pookie.eth profil picture to https://example.com/a.png',
      'avatar',
      'https://example.com/a.png',
    ],
    [
      'set pookie.eth e-mail to yoginth@example.com',
      'email',
      'yoginth@example.com',
    ],
    [
      'set pookie.eth ethereum address to 0x000000000000000000000000000000000000dEaD',
      'eth_address',
      '0x000000000000000000000000000000000000dEaD',
    ],
    ['Use Garnet theme for pookie.eth', 'theme', 'Garnet'],
  ])('uses bounded choices without changing literal values: %s', (query, field, value) => {
    expect(
      parseProfileSection(query, 'pookie.eth', profileAnswers(field)),
    ).toMatchObject({
      intent: 'edit_profile',
      name: 'pookie.eth',
      field,
      value,
    })
  })

  it('does not change a mistyped username while resolving a mistyped field', () => {
    expect(
      parseProfileSection(
        'set pookie.eth githb to yoginht',
        'pookie.eth',
        profileAnswers('github'),
      ),
    ).toMatchObject({ field: 'github', value: 'yoginht' })
  })

  it('uses exact local assignments when optional role or operation answers are uncertain', () => {
    const uncertain = { type: 'choice', choice: 'none', confidence: 0.1 }
    expect(
      parseProfileSection('set pookie.eth githb to yoginth', 'pookie.eth', {
        ...profileAnswers('github'),
        profile_value: uncertain,
        profile_operation: uncertain,
      }),
    ).toMatchObject({ field: 'github', value: 'yoginth' })
    expect(
      parseProfileSection(
        'Set pookie.eth avatar to https://example.com/avatar.png',
        'pookie.eth',
        {
          ...profileAnswers('avatar'),
          profile_value: { ...uncertain, choice: 'value_1' },
        },
      ),
    ).toMatchObject({
      field: 'avatar',
      value: 'https://example.com/avatar.png',
    })
  })

  it('does not use an uncertain model value role when there is no explicit local assignment', () => {
    expect(
      parseProfileSection(
        'make yoginth my github for pookie.eth',
        'pookie.eth',
        {
          ...profileAnswers('github'),
          profile_value: { type: 'choice', choice: 'value_1', confidence: 0.2 },
        },
      ),
    ).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      field: 'github',
    })
  })

  it.each([
    { type: 'choice', choice: 'value_99', confidence: 1 },
    { type: 'choice', choice: 'value_1', confidence: 1.2 },
    { type: 'choice', choice: 'value_1', confidence: Number.NaN },
    { type: 'text', choice: 'value_1', confidence: 1 },
  ])('still rejects malformed model roles when an exact assignment exists %#', (profile_value) => {
    expect(
      parseProfileSection('set pookie.eth GitHub to yoginth', 'pookie.eth', {
        ...profileAnswers('github'),
        profile_value,
      }),
    ).toBeNull()
  })

  it('accepts old/new roles only when consistent with explicit local replacements', () => {
    const query = 'Change GitHub from bigint to yoginth for pookie.eth'
    expect(
      parseProfileSection(
        query,
        'pookie.eth',
        profileAnswers('github', 'value_2', 'value_1'),
      ),
    ).toMatchObject({
      field: 'github',
      value: 'yoginth',
      expectedValue: 'bigint',
    })
    expect(
      parseProfileSection(
        query,
        'pookie.eth',
        profileAnswers('github', 'value_1', 'value_2'),
      ),
    ).toBeNull()
    expect(
      parseProfileSection(
        query,
        'pookie.eth',
        profileAnswers('github', 'value_2', 'value_2'),
      ),
    ).toBeNull()
  })

  it('asks for an unresolved field and retains a supplied value', () => {
    expect(
      parseProfileSection(
        'set pookie.eth profile detail to yoginth',
        'pookie.eth',
        profileAnswers('unknown'),
      ),
    ).toMatchObject({
      fieldRequested: true,
      value: 'yoginth',
      name: 'pookie.eth',
    })
  })

  it('keeps a known field with a missing value for a focused follow-up', () => {
    expect(
      parseProfileSection(
        'change pookie.eth githb',
        'pookie.eth',
        profileAnswers('github', 'none'),
      ),
    ).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      field: 'github',
    })
  })

  it.each([
    ['set pookie.eth email to yoginth@example.com', 'github'],
    ['set pookie.eth bitcoin address to satoshis address', 'eth_address'],
    ['set pookie.eth Github and email to yoginth', 'github'],
    ['dont set pookie.eth githb to yoginth', 'github'],
    ['keep pookie.eth GitHub unchanged', 'github'],
    ['set pookie.eth GitHub to yoginth and add Twitter to yoginth', 'github'],
  ])('rejects optimistic choices for conflicting or unsupported instructions: %s', (query, field) => {
    expect(
      parseProfileSection(query, 'pookie.eth', profileAnswers(field)),
    ).toBeNull()
  })

  it('does not treat quoted action words as a second operation', () => {
    expect(
      parseProfileSection(
        'Set pookie.eth bio to "renew alice.eth and transfer bitcoin"',
        'pookie.eth',
        profileAnswers('description'),
      ),
    ).toMatchObject({
      field: 'description',
      value: 'renew alice.eth and transfer bitcoin',
    })
  })
  it('proposes an exact supplied description and ignores field words inside it', () => {
    expect(
      parseProfileSection(
        'Set yoginth.eth description to "I write about email and avatar design"',
        'yoginth.eth',
      ),
    ).toEqual({
      intent: 'edit_profile',
      name: 'yoginth.eth',
      section: 'general',
      field: 'description',
      value: 'I write about email and avatar design',
    })
    expect(
      parseProfileSection(
        'Set yoginth.eth description to "I build and document ENS tools!"',
        'yoginth.eth',
      )?.value,
    ).toBe('I build and document ENS tools!')
    expect(
      parseProfileSection(
        'Set description to I build ENS tools for yoginth.eth',
        'yoginth.eth',
      )?.value,
    ).toBe('I build ENS tools')
  })

  it('extracts avatar, email, and Ethereum address values from the query', () => {
    expect(
      parseProfileSection(
        'Set avatar for yoginth.eth to https://example.com/avatar.png',
        'yoginth.eth',
      ),
    ).toMatchObject({
      section: 'general',
      field: 'avatar',
      value: 'https://example.com/avatar.png',
    })
    expect(
      parseProfileSection(
        'Set avatar for yoginth.eth to "https://example.com/avatar.png?size=2&v=1".',
        'yoginth.eth',
      )?.value,
    ).toBe('https://example.com/avatar.png?size=2&v=1')
    expect(
      parseProfileSection(
        'Set avatar for yoginth.eth to https://example.com/avatar.png.',
        'yoginth.eth',
      )?.value,
    ).toBeUndefined()
    expect(
      parseProfileSection(
        'Set avatar for yoginth.eth to "https://example.com/image,end.png.".',
        'yoginth.eth',
      )?.value,
    ).toBe('https://example.com/image,end.png.')
    expect(
      parseProfileSection(
        'Add my email me@example.com to yoginth.eth',
        'yoginth.eth',
      ),
    ).toMatchObject({
      section: 'contact',
      field: 'email',
      value: 'me@example.com',
    })
    expect(
      parseProfileSection(
        'Set Ethereum address on yoginth.eth to 0x000000000000000000000000000000000000dEaD',
        'yoginth.eth',
      ),
    ).toMatchObject({
      section: 'addresses',
      field: 'eth_address',
      value: '0x000000000000000000000000000000000000dEaD',
    })
  })

  it('routes a theme proposal to Appearance and generic edits to sections', () => {
    expect(
      parseProfileSection('Use Garnet theme for yoginth.eth', 'yoginth.eth'),
    ).toMatchObject({ section: 'appearance', field: 'theme', value: 'Garnet' })
    expect(
      parseProfileSection(
        'Change Quartz theme to Garnet for yoginth.eth',
        'yoginth.eth',
      )?.value,
    ).toBe('Garnet')
    expect(
      parseProfileSection('Change theme to Garnet.', 'yoginth.eth')?.value,
    ).toBe('Garnet')
    expect(
      parseProfileSection(
        'Use Quartz and Garnet themes for yoginth.eth',
        'yoginth.eth',
      ),
    ).toBeNull()
    expect(
      parseProfileSection('Edit appearance for yoginth.eth', 'yoginth.eth'),
    ).toEqual({
      intent: 'edit_profile',
      name: 'yoginth.eth',
      section: 'appearance',
    })
    expect(
      parseProfileSection('Edit links for yoginth.eth', 'yoginth.eth'),
    ).toEqual({ intent: 'edit_profile', name: 'yoginth.eth', section: 'links' })
    expect(
      parseProfileSection('Edit social records for yoginth.eth', 'yoginth.eth'),
    ).toEqual({
      intent: 'edit_profile',
      name: 'yoginth.eth',
      section: 'contact',
    })
  })

  it('requests a URL for adding a link and rejects multiple or unknown field edits', () => {
    expect(
      parseProfileSection(
        'Add https://example.com/work to the links of pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({ section: 'links', value: 'https://example.com/work' })
    expect(
      parseProfileSection('Add my GitHub to yoginth.eth', 'yoginth.eth'),
    ).toEqual({
      intent: 'edit_profile',
      name: 'yoginth.eth',
      section: 'contact',
      field: 'github',
    })
    expect(
      parseProfileSection(
        'Add my GitHub link to yoginth.eth as (https://github.com/yoginth?tab=repositories).',
        'yoginth.eth',
      )?.value,
    ).toBe('https://github.com/yoginth?tab=repositories')
    expect(
      parseProfileSection(
        'Add link https://example.com/path,segment to yoginth.eth',
        'yoginth.eth',
      )?.value,
    ).toBe('https://example.com/path,segment')
    expect(
      parseProfileSection(
        'Add link https://example.com/path, to yoginth.eth',
        'yoginth.eth',
      )?.value,
    ).toBeUndefined()
    expect(
      parseProfileSection(
        'Set my avatar and email on yoginth.eth',
        'yoginth.eth',
      ),
    ).toBeNull()
    expect(
      parseProfileSection('Set phone to 123 on yoginth.eth', 'yoginth.eth'),
    ).toMatchObject({ field: 'phone', value: '123' })
    expect(
      parseProfileSection('Add Twitter to yoginth.eth', 'yoginth.eth'),
    ).toMatchObject({ field: 'twitter' })
    expect(
      parseProfileSection(
        'Set profile name to Yogi on yoginth.eth',
        'yoginth.eth',
      ),
    ).toMatchObject({ field: 'display_name', value: 'Yogi' })
  })

  it.each([
    'Edit my profile pookie.eth and set github name to yoginth instead of bigint',
    'Change GitHub from bigint to yoginth for pookie.eth',
    'Replace bigint with yoginth on GitHub for pookie.eth',
    'Replace my GitHub username bigint with yoginth on pookie.eth',
    'Set the GitHub handle on pookie.eth to yoginth rather than bigint',
    'Set GitHub on pookie.eth to yoginth, not bigint',
    'Open pookie.eth profile and change GitHub from bigint to yoginth',
    "Change pookie.eth's GitHub from 'bigint' to 'yoginth'",
    'Set GitHub to yoginth instead of bigint.',
  ])('extracts the GitHub replacement without the old value: %s', (query) => {
    expect(parseProfileSection(query, 'pookie.eth')).toEqual({
      intent: 'edit_profile',
      name: 'pookie.eth',
      section: 'contact',
      field: 'github',
      value: 'yoginth',
      expectedValue: 'bigint',
    })
    expect(isSingleProfileEdit(query, 'pookie.eth')).toBe(true)
  })

  it.each([
    [
      'Set GitHub to @yoginth instead of @bigint on pookie.eth',
      '@yoginth',
      '@bigint',
    ],
    [
      'Change GitHub from https://github.com/bigint to https://github.com/yoginth for pookie.eth',
      'https://github.com/yoginth',
      'https://github.com/bigint',
    ],
    [
      'Replace "https://github.com/bigint" with "https://github.com/yoginth" on GitHub for pookie.eth',
      'https://github.com/yoginth',
      'https://github.com/bigint',
    ],
  ])('keeps explicit new and old handles or URLs separate: %s', (query, value, expectedValue) => {
    expect(parseProfileSection(query, 'pookie.eth')).toMatchObject({
      field: 'github',
      value,
      expectedValue,
    })
  })

  it('extracts replacement constraints for other existing profile fields', () => {
    expect(
      parseProfileSection(
        'Change email from old@example.com to new@example.com on pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({
      field: 'email',
      value: 'new@example.com',
      expectedValue: 'old@example.com',
    })
    expect(
      parseProfileSection(
        'Change theme from Quartz to Garnet for pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({
      field: 'theme',
      value: 'Garnet',
      expectedValue: 'Quartz',
    })
    expect(
      parseProfileSection(
        'Change bio from "I write about email" to "I build ENS tools" for pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({
      field: 'description',
      value: 'I build ENS tools',
      expectedValue: 'I write about email',
    })
    expect(
      parseProfileSection(
        'Set bio to "I work from home instead of an office" on pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({
      field: 'description',
      value: 'I work from home instead of an office',
    })
    expect(
      parseProfileSection(
        'Set bio to I build tools from Bengaluru on pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({
      field: 'description',
      value: 'I build tools from Bengaluru',
    })
    expect(
      parseProfileSection(
        'Set bio to I replace confusing software for pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({
      field: 'description',
      value: 'I replace confusing software',
    })
  })

  it('extracts directly supplied GitHub handles and URLs before the target name', () => {
    expect(
      parseProfileSection('Add my GitHub @yoginth to pookie.eth', 'pookie.eth'),
    ).toMatchObject({ field: 'github', value: '@yoginth' })
    expect(
      parseProfileSection(
        'Add my GitHub https://github.com/yoginth to pookie.eth',
        'pookie.eth',
      ),
    ).toMatchObject({ field: 'github', value: 'https://github.com/yoginth' })
  })

  it.each([
    'Edit my profile pookie.eth and set github to yoginth and email to yoginth@example.com',
    'Set GitHub and website to yoginth on pookie.eth',
    'Set GitHub, website to yoginth on pookie.eth',
    'Set GitHub to yoginth and add Twitter on pookie.eth',
    'Edit my profile pookie.eth and set GitHub to yoginth and register another.eth',
    'Set bio to Building ENS; renew pookie.eth',
    'Change GitHub from bigint to yoginth to anotheruser on pookie.eth',
    'Set GitHub to yoginth instead of bigint instead of anotheruser on pookie.eth',
    'Replace bigint with yoginth with anotheruser on GitHub for pookie.eth',
    'Edit pookie.eth but do not set GitHub to yoginth',
    "Edit pookie.eth but don't set GitHub to yoginth",
    'Never change GitHub to yoginth on pookie.eth',
    'Edit pookie.eth without changing GitHub to yoginth',
  ])('rejects ambiguous or multiple edits as a whole: %s', (query) => {
    expect(parseProfileSection(query, 'pookie.eth')).toBeNull()
    expect(isSingleProfileEdit(query, 'pookie.eth')).toBe(false)
  })
})
