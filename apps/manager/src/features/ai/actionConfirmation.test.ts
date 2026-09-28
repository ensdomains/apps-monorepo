import { describe, expect, it } from 'vitest'
import {
  type AiConfirmationContext,
  confirmAiInterpretation,
  getAiConfirmationSummary,
  isAiConfirmationCurrent,
} from './actionConfirmation'
import type { AiAction, AiInterpretResult } from './intent'

const address = `0x${'1'.repeat(40)}`
const context: AiConfirmationContext = {
  revision: 3,
  walletAddress: address,
  authAddress: address,
  authToken: 'synthetic-test-session',
}
const candidate: Extract<AiInterpretResult, { status: 'needs_confirmation' }> =
  {
    status: 'needs_confirmation',
    action: { intent: 'register', name: 'copper.eth', durationDays: 69 },
    multiAction: { nextIntent: 'set_primary' },
  }

describe('AI interpretation confirmation', () => {
  it('promotes only the same candidate and preserves its exact details and second-step notice', () => {
    const result = confirmAiInterpretation(candidate, context, context)
    expect(result).toEqual({ ...candidate, status: 'ok' })
    expect(result?.action).toBe(candidate.action)
    expect(candidate.status).toBe('needs_confirmation')
  })

  it.each([
    { revision: 4 },
    { walletAddress: `0x${'2'.repeat(40)}` },
    { authAddress: `0x${'2'.repeat(40)}` },
    { authToken: 'a-different-test-session' },
    { authToken: undefined },
    { walletAddress: undefined },
    { apiBaseUrlOverride: 'https://another-backend.example' },
  ])('rejects a changed prompt or session: %j', (change) => {
    expect(
      confirmAiInterpretation(candidate, context, { ...context, ...change }),
    ).toBeNull()
  })

  it('does not promote a dismissed or missing candidate', () => {
    expect(confirmAiInterpretation(candidate, null, context)).toBeNull()
    expect(confirmAiInterpretation(null, context, context)).toBeNull()
    expect(
      confirmAiInterpretation({ status: 'unsupported' }, context, context),
    ).toBeNull()
    expect(
      confirmAiInterpretation(
        { status: 'ok', action: candidate.action },
        context,
        context,
      ),
    ).toBeNull()
  })

  it('requires the signed-in backend address to match the connected wallet', () => {
    const mismatched = { ...context, authAddress: `0x${'2'.repeat(40)}` }
    expect(isAiConfirmationCurrent(mismatched, mismatched)).toBe(false)
  })

  it('accepts address casing without exposing credentials in an identifier', () => {
    const mixed = { ...context, walletAddress: '0xAbc', authAddress: '0xabc' }
    expect(
      isAiConfirmationCurrent(mixed, { ...mixed, walletAddress: '0xABC' }),
    ).toBe(true)
  })

  it('preserves missing fields for the existing targeted detail flow', () => {
    const incomplete = {
      ...candidate,
      action: { intent: 'set_primary' as const },
    }
    expect(
      confirmAiInterpretation(incomplete, context, context)?.action,
    ).toEqual({ intent: 'set_primary' })
  })
})

describe('local AI confirmation summaries', () => {
  it('shows the old-value condition beside the exact proposed profile replacement', () => {
    expect(
      getAiConfirmationSummary({
        intent: 'edit_profile',
        name: 'copper.eth',
        section: 'contact',
        field: 'github',
        operation: 'set',
        value: 'new-handle',
        expectedValue: 'old-handle',
      }).rows,
    ).toEqual(
      expect.arrayContaining([
        { label: 'Name', value: 'copper.eth' },
        { label: 'New value', value: 'new-handle' },
        { label: 'Replace only if currently', value: 'old-handle' },
      ]),
    )
  })

  it('keeps expiry selection separate from additional renewal time and exact names', () => {
    expect(
      getAiConfirmationSummary({
        intent: 'bulk_renew',
        names: ['copper.eth', 'meadow.eth'],
        filters: {
          expiry: 'expiring',
          withinDays: 45,
          favorite: 'no',
          version: 'v2',
          sort: 'expiry-asc',
        },
        durationDays: 69,
      }).rows,
    ).toEqual(
      expect.arrayContaining([
        { label: 'Names', value: 'copper.eth, meadow.eth' },
        { label: 'Filter', value: 'Expiring within 45 days' },
        { label: 'Filter', value: 'Not favourites' },
        { label: 'Filter', value: 'ENSv2' },
        { label: 'Filter', value: 'Earliest expiry first' },
        { label: 'Additional time', value: '69 days' },
      ]),
    )
  })

  it('shows the exact native scope and approval instead of a generic continue message', () => {
    expect(
      getAiConfirmationSummary({
        intent: 'manager_action',
        kind: 'mark_notifications_read',
        notificationTag: 'expiry',
      }).rows,
    ).toEqual([
      { label: 'Category', value: 'expiry' },
      { label: 'Messages', value: 'Currently loaded unread notifications' },
    ])
    expect(
      getAiConfirmationSummary({
        intent: 'manager_action',
        kind: 'migration_revoke',
        approval: 'name-wrapper:hca',
      }).rows,
    ).toContainEqual({
      label: 'Permission',
      value: 'Wrapped ENSv1 name access',
    })
  })

  it('includes language, email, address, share destination and custom link values locally', () => {
    expect(
      getAiConfirmationSummary({
        intent: 'manager_action',
        kind: 'language',
        locale: 'sv',
      }).rows,
    ).toContainEqual({ label: 'Language', value: 'Swedish' })
    expect(
      getAiConfirmationSummary({
        intent: 'manager_action',
        kind: 'email_add',
        email: 'person@example.com',
      }).rows,
    ).toContainEqual({ label: 'Email', value: 'person@example.com' })
    expect(
      getAiConfirmationSummary({
        intent: 'manager_action',
        kind: 'view_address',
        address,
      }).rows,
    ).toContainEqual({ label: 'Wallet', value: address })
    expect(
      getAiConfirmationSummary({
        intent: 'manager_action',
        kind: 'nft_share',
        shareTarget: 'telegram',
      }).rows,
    ).toContainEqual({ label: 'Share using', value: 'Telegram' })
    expect(
      getAiConfirmationSummary({
        intent: 'edit_profile',
        name: 'copper.eth',
        section: 'links',
        field: 'link',
        operation: 'rename',
        linkTarget: 'Old title',
        linkName: 'New title',
      }).rows,
    ).toEqual(
      expect.arrayContaining([
        { label: 'Existing link', value: 'Old title' },
        { label: 'Link title', value: 'New title' },
      ]),
    )
  })

  it.each<AiAction>([
    { intent: 'set_primary', nameCandidates: ['copper.eth', 'meadow.eth'] },
    { intent: 'favorite', name: 'copper.eth' },
    { intent: 'view_name', name: 'copper.eth' },
    { intent: 'register', name: 'copper.eth', durationDays: 69 },
    { intent: 'renew', name: 'copper.eth', durationYears: 2 },
    {
      intent: 'find_names',
      filters: { role: 'manager', primary: 'no', upgrade: 'eligible' },
      referencedSelection: true,
    },
    {
      intent: 'migrate',
      names: ['copper.eth'],
      excludeManagerRestoration: true,
    },
    { intent: 'notification', enabled: false, preference: 'ownedNameExpiry' },
  ])('describes existing action family $intent', (action) => {
    const summary = getAiConfirmationSummary(action)
    expect(summary.title.length).toBeGreaterThan(0)
    expect(summary.rows.length).toBeGreaterThan(0)
    expect(
      summary.rows.every(
        ({ value }) => typeof value === 'string' && value.length > 0,
      ),
    ).toBe(true)
  })
})
