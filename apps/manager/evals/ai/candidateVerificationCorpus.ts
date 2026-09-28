import type { AiAction, AiInterpretResult } from '@/features/ai/intent'

export type CandidateVerificationCase = {
  readonly id: string
  readonly query: string
  readonly candidate: Extract<AiInterpretResult, { status: 'ok' }>
  readonly expected: 'verified' | 'rejected'
}

const candidate = (
  action: AiAction,
): CandidateVerificationCase['candidate'] => ({
  status: 'ok',
  action,
})
const pair = (
  id: string,
  query: string,
  correct: CandidateVerificationCase['candidate'],
  incorrect: CandidateVerificationCase['candidate'],
): readonly CandidateVerificationCase[] => [
  {
    id: `verify-contrast-${id}-valid`,
    query,
    candidate: correct,
    expected: 'verified',
  },
  {
    id: `verify-contrast-${id}-wrong`,
    query,
    candidate: incorrect,
    expected: 'rejected',
  },
]

// Independent second-stage contrasts, authored before any verifier responses.
// Labels describe whether this exact candidate preserves the complete request;
// they do not describe first-stage support or later live Manager eligibility.
// Keep labels frozen after provider evaluation, including inconvenient failures.
export const CANDIDATE_VERIFICATION_CORPUS: readonly CandidateVerificationCase[] =
  [
    ...pair(
      'primary-operation',
      'Make azalea.eth the primary name for my wallet.',
      candidate({ intent: 'set_primary', name: 'azalea.eth' }),
      candidate({ intent: 'favorite', name: 'azalea.eth' }),
    ),
    ...pair(
      'primary-target',
      'Set azalea.eth as primary, not wisteria.eth.',
      candidate({ intent: 'set_primary', name: 'azalea.eth' }),
      candidate({ intent: 'set_primary', name: 'wisteria.eth' }),
    ),
    ...pair(
      'profile-replacement',
      'Replace azalea.eth GitHub handle azalea-old with azalea-new',
      candidate({
        intent: 'edit_profile',
        name: 'azalea.eth',
        section: 'contact',
        field: 'github',
        value: 'azalea-new',
        expectedValue: 'azalea-old',
      }),
      candidate({
        intent: 'edit_profile',
        name: 'azalea.eth',
        section: 'contact',
        field: 'github',
        value: 'azalea-old',
        expectedValue: 'azalea-new',
      }),
    ),
    ...pair(
      'profile-feature',
      'Pin the GitHub contact on wisteria.eth.',
      candidate({
        intent: 'edit_profile',
        name: 'wisteria.eth',
        section: 'contact',
        field: 'github',
        operation: 'feature',
      }),
      candidate({
        intent: 'edit_profile',
        name: 'wisteria.eth',
        section: 'contact',
        field: 'github',
        operation: 'unfeature',
      }),
    ),
    ...pair(
      'renewal-duration',
      'Extend azalea.eth for another 23 days',
      candidate({ intent: 'renew', name: 'azalea.eth', durationDays: 23 }),
      candidate({ intent: 'renew', name: 'azalea.eth', durationYears: 23 }),
    ),
    ...pair(
      'renewal-window',
      'Renew names expiring within 17 days for another 83 days',
      candidate({
        intent: 'bulk_renew',
        filters: { expiry: 'expiring', withinDays: 17 },
        durationDays: 83,
      }),
      candidate({
        intent: 'bulk_renew',
        filters: { expiry: 'expiring', withinDays: 83 },
        durationDays: 17,
      }),
    ),
    ...pair(
      'bulk-conjunction',
      'Show my favourite V1 names, alphabetically',
      candidate({
        intent: 'find_names',
        filters: { favorite: 'yes', version: 'v1', sort: 'name-asc' },
      }),
      candidate({
        intent: 'find_names',
        filters: { favorite: 'yes', sort: 'name-asc' },
      }),
    ),
    ...pair(
      'notification-direction',
      'Turn off expiry reminders for names I own',
      candidate({
        intent: 'notification',
        preference: 'ownedNameExpiry',
        enabled: false,
      }),
      candidate({
        intent: 'notification',
        preference: 'ownedNameExpiry',
        enabled: true,
      }),
    ),
    ...pair(
      'notification-target',
      'Enable favourite-name expiry notifications',
      candidate({
        intent: 'notification',
        preference: 'favouritedNameExpiry',
        enabled: true,
      }),
      candidate({
        intent: 'notification',
        preference: 'ownedNameExpiry',
        enabled: true,
      }),
    ),
    ...pair(
      'notification-email',
      'Add garden-alerts@example.net as my notification email',
      candidate({
        intent: 'manager_action',
        kind: 'email_add',
        email: 'garden-alerts@example.net',
      }),
      candidate({
        intent: 'manager_action',
        kind: 'email_remove',
        email: 'garden-alerts@example.net',
      }),
    ),
    ...pair(
      'second-action',
      'Register wisteria.eth for 97 days and then set it as primary',
      {
        ...candidate({
          intent: 'register',
          name: 'wisteria.eth',
          durationDays: 97,
        }),
        multiAction: { nextIntent: 'set_primary' },
      },
      candidate({ intent: 'register', name: 'wisteria.eth', durationDays: 97 }),
    ),
    {
      id: 'verify-contrast-extra-instruction-valid',
      query: 'Show the profile for azalea.eth',
      candidate: candidate({ intent: 'view_name', name: 'azalea.eth' }),
      expected: 'verified',
    },
    {
      id: 'verify-contrast-extra-instruction-wrong',
      query:
        'Show the profile for azalea.eth and email it to garden-recipient@example.net',
      candidate: candidate({ intent: 'view_name', name: 'azalea.eth' }),
      expected: 'rejected',
    },
  ]
