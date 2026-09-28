import { describe, expect, it } from 'vitest'
import {
  buildCandidateVerificationRequest,
  parseCandidateVerification,
} from './candidateVerification'
import type { AiAction } from './intent'

const judgment = (noul = 0.95) => ({ type: 'noul', noul })
const verdict = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    operation: judgment(),
    details: judgment(),
    coverage: judgment(),
    ...overrides,
  },
})
const request = (query: string, action: AiAction) =>
  buildCandidateVerificationRequest(query, { status: 'ok', action })

describe('candidate verification judgments', () => {
  it('requires all three independent judgments to verify the candidate', () => {
    expect(parseCandidateVerification(verdict())).toBe('verified')
    expect(
      parseCandidateVerification(
        verdict({
          operation: judgment(0.9),
          details: judgment(0.9),
          coverage: judgment(0.9),
        }),
      ),
    ).toBe('verified')
  })

  it.each([
    'operation',
    'details',
    'coverage',
  ])('rejects a contradiction in %s', (field) => {
    expect(
      parseCandidateVerification(verdict({ [field]: judgment(0.1) })),
    ).toBe('rejected')
  })

  it.each([
    'details',
    'coverage',
  ])('never offers a partial action for uncertain %s', (field) => {
    expect(
      parseCandidateVerification(verdict({ [field]: judgment(0.89) })),
    ).toBe('rejected')
    expect(
      parseCandidateVerification(verdict({ [field]: judgment(0.5) })),
    ).toBe('rejected')
  })

  it.each([
    0.5, 0.89,
  ])('asks about the operation only after details and full coverage are verified', (probability) => {
    expect(
      parseCandidateVerification(verdict({ operation: judgment(probability) })),
    ).toBe('confirm_operation')
  })

  it.each([
    undefined,
    null,
    [],
    'yes',
    { type: 'choice', choice: 'matches', confidence: 1 },
    { type: 'noul', noul: '1' },
    { type: 'noul' },
    judgment(-1),
    judgment(1.1),
    judgment(Number.NaN),
    judgment(Number.POSITIVE_INFINITY),
  ])('rejects malformed answer %#', (answer) => {
    for (const field of ['operation', 'details', 'coverage'])
      expect(parseCandidateVerification(verdict({ [field]: answer }))).toBe(
        'rejected',
      )
  })

  it.each([
    null,
    [],
    {},
    { answers: null },
    { answers: [] },
  ])('rejects malformed response %#', (body) =>
    expect(parseCandidateVerification(body)).toBe('rejected'))
})

describe('candidate verification privacy and exact references', () => {
  it('preserves exact name selection through numbered references', () => {
    const built = request('Show second.eth, not first.eth', {
      intent: 'view_name',
      name: 'second.eth',
    })
    expect(built?.state).toEqual({
      request: 'Show [ENS_NAME] not [ENS_NAME_2]',
      candidate: {
        meaning: 'Open the existing public profile for this ENS name.',
        action: {
          intent: 'view_name',
          name: '[ENS_NAME]',
          nameCandidates: undefined,
        },
      },
    })
    expect(JSON.stringify(built)).not.toMatch(/second\.eth|first\.eth/)
  })

  it('preserves old/new roles without leaking either exact profile value', () => {
    const built = request(
      'Replace private.eth GitHub handle private-old with private-new',
      {
        intent: 'edit_profile',
        name: 'private.eth',
        section: 'contact',
        field: 'github',
        operation: 'set',
        value: 'private-new',
        expectedValue: 'private-old',
      },
    )
    expect(built?.state.candidate.action).toMatchObject({
      name: '[ENS_NAME]',
      value: '[PROFILE_VALUE_2]',
      expectedValue: '[PROFILE_VALUE_1]',
    })
    expect(JSON.stringify(built)).not.toMatch(
      /private\.eth|private-old|private-new/,
    )
  })

  it('masks private link titles and URLs with shared references', () => {
    const built = request(
      'For private.eth replace link "Secret Studio" URL https://old.example/path with https://new.example/path',
      {
        intent: 'edit_profile',
        name: 'private.eth',
        section: 'links',
        field: 'link',
        operation: 'set',
        linkName: 'Secret Studio',
        value: 'https://new.example/path',
        expectedValue: 'https://old.example/path',
      },
    )
    expect(built).not.toBeNull()
    expect(built?.state.candidate.action).toMatchObject({
      linkName: '[PROFILE_VALUE_1]',
      value: '[PROFILE_VALUE_3]',
      expectedValue: '[PROFILE_VALUE_2]',
    })
    expect(JSON.stringify(built)).not.toMatch(
      /Secret Studio|old\.example|new\.example|private\.eth/,
    )
  })

  it('masks a non-EVM address like any other exact profile value', () => {
    const value = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    const built = request(`Set private.eth Bitcoin address to ${value}`, {
      intent: 'edit_profile',
      name: 'private.eth',
      section: 'addresses',
      field: 'address',
      addressCoinType: 0,
      value,
    })
    expect(built).not.toBeNull()
    expect(JSON.stringify(built)).not.toContain(value)
    expect(built?.state.candidate.action).toMatchObject({
      value: '[PROFILE_VALUE_1]',
    })
  })

  it('masks a notification email and an exact wallet target', () => {
    const email = 'private@example.org'
    const address = '0x000000000000000000000000000000000000dead'
    const emailRequest = request(`Add ${email} for notification emails`, {
      intent: 'manager_action',
      kind: 'email_add',
      email,
    })
    const addressRequest = request(`Show wallet ${address}`, {
      intent: 'manager_action',
      kind: 'view_address',
      address,
    })
    expect(emailRequest).not.toBeNull()
    expect(addressRequest).not.toBeNull()
    expect(JSON.stringify(emailRequest)).not.toContain(email)
    expect(JSON.stringify(addressRequest)).not.toContain(address)
  })

  it('fails closed if an exact value cannot be tied to a local placeholder', () => {
    expect(
      request('Set private.eth GitHub to supplied', {
        intent: 'edit_profile',
        name: 'private.eth',
        section: 'contact',
        field: 'github',
        value: 'invented',
      }),
    ).toBeNull()
    expect(
      request('Show private.eth', { intent: 'view_name', name: 'other.eth' }),
    ).toBeNull()
  })

  it('uses the actual request reference when notification redaction bypasses profile masking', () => {
    const built = request(
      'I would like to add private@example.org as my notification email',
      {
        intent: 'manager_action',
        kind: 'email_add',
        email: 'private@example.org',
      },
    )
    expect(built?.state.request).toContain('[EMAIL]')
    expect(built?.state.candidate.action).toMatchObject({ email: '[EMAIL]' })
    expect(JSON.stringify(built)).not.toContain('[PROFILE_VALUE_1]')
    expect(JSON.stringify(built)).not.toContain('private@example.org')
  })

  it('preserves explicit durations, filters and excluded migration subset', () => {
    expect(
      request('Renew my V2 names expiring within 45 days for two years', {
        intent: 'bulk_renew',
        filters: { version: 'v2', expiry: 'expiring', withinDays: 45 },
        durationYears: 2,
      })?.state.candidate.action,
    ).toMatchObject({
      filters: { version: 'v2', expiry: 'expiring', withinDays: 45 },
      durationYears: 2,
    })
    expect(
      request('Upgrade my names except those needing manager restoration', {
        intent: 'migrate',
        excludeManagerRestoration: true,
      })?.state.candidate.action,
    ).toMatchObject({ excludeManagerRestoration: true })
  })

  it('does not serialize undeclared action properties', () => {
    const extended = {
      intent: 'view_name' as const,
      name: 'private.eth',
      authToken: 'never-send',
      addressList: ['never-send'],
    }
    expect(JSON.stringify(request('Show private.eth', extended))).not.toContain(
      'never-send',
    )
  })
})
