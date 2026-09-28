import { describe, expect, it } from 'vitest'
import { parseJevAiResponse } from './intent'
import {
  buildManagerActionQuestions,
  hasExplicitManagerOperation,
  type ManagerAction,
  type ManagerActionKind,
  managerActionCatalog,
  parseManagerAction,
  prepareManagerAction,
} from './managerActions'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (
  kind: ManagerActionKind,
  extra: Record<string, unknown> = {},
) => ({
  manager_action: choice(kind),
  manager_constraints: choice('represented'),
  manager_locale: choice('missing'),
  manager_approval: choice('missing'),
  manager_notification_scope: choice('all'),
  manager_unread: choice('no'),
  manager_wallet_target: choice('missing'),
  manager_share_target: choice('missing'),
  manager_address_network: choice('missing'),
  ...extra,
})
const action = (
  kind: ManagerActionKind,
  detail: Partial<ManagerAction> = {},
): ManagerAction => ({ intent: 'manager_action', kind, ...detail })
const address = '0x00000000000000000000000000000000000000a1'

describe('bounded management actions', () => {
  it('uses the exact clipboard destination when matching model metadata is uncertain', () => {
    const query = 'Put the link to café.eth profile on my clipboard'
    const response = {
      answers: {
        ...answers('copy_profile'),
        intent: choice('manager_action'),
        fully_supported: { type: 'noul', noul: 0.88 },
        unsupported_requirement: { type: 'noul', noul: 0.22 },
        multi_action: { type: 'noul', noul: 0.07 },
        next_intent: choice('none'),
        request_mode: choice('requested'),
        action_count: choice('one'),
        profile_field: choice('unknown', 0.59),
        profile_operation: choice('set', 0.93),
        manager_share_target: choice('link', 0.56),
      },
    }
    expect(parseJevAiResponse(response, query)?.action).toEqual({
      intent: 'manager_action',
      kind: 'copy_profile',
      name: 'café.eth',
    })
    expect(
      parseManagerAction(
        query,
        answers('copy_profile', {
          manager_share_target: choice('unsupported'),
        }),
        ['café.eth'],
      ),
    ).toBeNull()
  })

  it.each([
    'expiry',
    'updates',
    'education',
    'onboarding',
    'transfer',
    'all',
  ])('preserves the %s category when marking notifications as read', (tag) => {
    const parsed = parseManagerAction(
      `Mark ${tag} notifications as read`,
      answers('mark_notifications_read', {
        manager_notification_scope: choice(tag),
      }),
      [],
    )
    expect(parsed).toMatchObject({
      kind: 'mark_notifications_read',
      notificationTag: tag,
    })
    expect(prepareManagerAction(parsed as ManagerAction, {})).toMatchObject({
      status: 'ready',
      action: { notificationTag: tag },
    })
  })

  it('rejects a mark-read scope that cannot be represented', () => {
    expect(
      parseManagerAction(
        'Mark notifications from last week as read',
        answers('mark_notifications_read', {
          manager_notification_scope: choice('unsupported'),
        }),
        [],
      ),
    ).toBeNull()
  })
  it.each([
    ['revkoe name wrapper migrtion approval', 'name-wrapper:hca'],
    ['Remove base registrar migration access', 'base-registrar:hca'],
    ['Revoke temporary ETH registry approval', 'eth-registry:hca'],
  ] as const)('retains exact local approval in %s despite uncertain matching classification', (query, approval) => {
    expect(
      parseManagerAction(
        query,
        answers('migration_revoke', {
          manager_approval: choice(approval, 0.53),
        }),
        [],
      ),
    ).toMatchObject({ approval })
  })

  it('rejects model approval contradictory to the exact requested registry', () => {
    for (const confidence of [0.53, 0.99])
      expect(
        parseManagerAction(
          'Remove name wrapper migration approval',
          answers('migration_revoke', {
            manager_approval: choice('base-registrar:hca', confidence),
          }),
          [],
        ),
      ).toBeNull()
  })

  it('does not choose one of several exact approvals or accept malformed evidence', () => {
    expect(
      parseManagerAction(
        'Revoke name wrapper and base registrar migration approvals',
        answers('migration_revoke'),
        [],
      ),
    ).toBeNull()
    expect(
      parseManagerAction(
        'Revoke name wrapper approval',
        answers('migration_revoke', {
          manager_approval: {
            type: 'choice',
            choice: 'name-wrapper:hca',
            confidence: 2,
          },
        }),
        [],
      ),
    ).toBeNull()
  })

  it.each([
    ['revkoe name wrapper migrtion approval', 'migration_revoke'],
    ['Remove temporary ETH registry access', 'migration_revoke'],
    ['Save the WebP image of my commemorative NFT', 'nft_download'],
    ['downlaod my migrtion NFT as webp', 'nft_download'],
    ['show my commemorative NFT', 'nft_view'],
    ['share my NFT', 'nft_share'],
    ['cliam my NFT', 'nft_claim'],
  ] as const)('recognizes explicit operation and resource for %s', (query, kind) => {
    expect(hasExplicitManagerOperation(query, kind)).toBe(true)
  })

  it.each([
    ['Show revoke.eth', 'migration_revoke'],
    ['Upgrade my names', 'migration_revoke'],
    ['Download my profile image', 'nft_download'],
    ['Show nft.eth', 'nft_view'],
    ['Share my NFT', 'nft_download'],
  ] as const)('does not override from vague context or words inside names: %s', (query, kind) => {
    expect(hasExplicitManagerOperation(query, kind)).toBe(false)
  })
  it.each(
    Object.keys(managerActionCatalog) as ManagerActionKind[],
  )('represents the existing %s control as a closed choice', (kind) => {
    const result = parseManagerAction(
      kind === 'copy_profile_address'
        ? 'Copy the profile address'
        : kind === 'copy_profile_owner'
          ? 'Copy the owner address'
          : kind === 'view_profile_owner'
            ? 'Who owns this ENS name?'
            : kind === 'view_primary_profile'
              ? 'Open my primary name profile'
              : 'Please help',
      answers(kind),
      [],
    )
    expect(result).toMatchObject({ intent: 'manager_action', kind })
    expect(
      buildManagerActionQuestions('').manager_action.criteria[kind],
    ).toBeTruthy()
  })

  it.each([
    0.2,
    -1,
    1.1,
    Number.NaN,
  ])('rejects invalid action confidence %s', (confidence) => {
    expect(
      parseManagerAction(
        'open favorites',
        answers('show_favorites', {
          manager_action: choice('show_favorites', confidence),
        }),
        [],
      ),
    ).toBeNull()
  })

  it('rejects unsupported, absent, and low-confidence extra constraints', () => {
    for (const constraint of [
      choice('unsupported'),
      choice('represented', 0.3),
      undefined,
    ]) {
      expect(
        parseManagerAction(
          'share profile',
          answers('share_profile', { manager_constraints: constraint }),
          [],
        ),
      ).toBeNull()
    }
  })

  it('rejects malicious and inherited kinds', () => {
    expect(
      parseManagerAction(
        'do something',
        {
          manager_action: choice('__proto__'),
          manager_constraints: choice('represented'),
        },
        [],
      ),
    ).toBeNull()
    expect(
      parseManagerAction(
        'do something',
        {
          manager_action: choice('/attacker'),
          manager_constraints: choice('represented'),
        },
        [],
      ),
    ).toBeNull()
  })

  it('copies exact name and email values without asking the model to write them', () => {
    expect(
      parseManagerAction('unstar example.eth', answers('unfavorite'), [
        'example.eth',
      ]),
    ).toMatchObject({ name: 'example.eth' })
    expect(
      parseManagerAction(
        'add alerts+ens@example.test for notifications',
        answers('email_add'),
        [],
      ),
    ).toMatchObject({ email: 'alerts+ens@example.test' })
  })

  it('keeps multiple names unresolved until the user chooses a candidate', () => {
    const parsed = parseManagerAction(
      'share alice.eth or bob.eth',
      answers('share_profile', { target_name: choice('ambiguous') }),
      ['alice.eth', 'bob.eth'],
    )
    expect(parsed).toMatchObject({ nameCandidates: ['alice.eth', 'bob.eth'] })
    expect(prepareManagerAction(parsed as ManagerAction, {})).toMatchObject({
      status: 'needs_input',
      field: 'name',
    })
    expect(
      prepareManagerAction(parsed as ManagerAction, { name: 'alice.eth' }),
    ).toMatchObject({ status: 'ready', action: { name: 'alice.eth' } })
    expect(
      prepareManagerAction(parsed as ManagerAction, { name: 'carol.eth' })
        .status,
    ).toBe('invalid')
  })

  it('does not let an optimistic model choose an explicit name alternative', () => {
    expect(
      parseManagerAction(
        'share alice.eth or bob.eth',
        answers('share_profile', { target_name: choice('name_1') }),
        ['alice.eth', 'bob.eth'],
      ),
    ).toMatchObject({
      name: undefined,
      nameCandidates: ['alice.eth', 'bob.eth'],
    })
  })

  it('does not treat words inside exact names as operation constraints', () => {
    expect(
      parseManagerAction('unfavorite all.eth', answers('unfavorite'), [
        'all.eth',
      ]),
    ).toMatchObject({ name: 'all.eth' })
    expect(
      parseManagerAction('share or.eth', answers('share_profile'), ['or.eth']),
    ).toMatchObject({ name: 'or.eth' })
  })

  it('preserves an explicit supported NFT share target and rejects another platform', () => {
    for (const target of ['x', 'telegram', 'link'])
      expect(
        parseManagerAction(
          'share my NFT',
          answers('nft_share', { manager_share_target: choice(target) }),
          [],
        ),
      ).toMatchObject({ shareTarget: target })
    expect(
      parseManagerAction(
        'share my NFT on Discord',
        answers('nft_share', { manager_share_target: choice('unsupported') }),
        [],
      ),
    ).toBeNull()
  })

  it.each([
    'Share orbit.eth with my boss by email',
    'Share orbit.eth to my friend',
    'Share orbit.eth on Telegram',
    'Share orbit.eth via Twitter',
  ])('rejects profile sharing destinations even with optimistic answers: %s', (query) => {
    expect(
      parseManagerAction(query, answers('share_profile'), ['orbit.eth']),
    ).toBeNull()
  })

  it('rejects a semantic recipient or unsupported profile-sharing target', () => {
    expect(
      parseManagerAction(
        'send the orbit.eth profile to Alex',
        answers('share_profile', {
          manager_share_target: choice('unsupported'),
        }),
        ['orbit.eth'],
      ),
    ).toBeNull()
    expect(
      parseManagerAction(
        'share orbit.eth',
        answers('share_profile', { manager_share_target: choice('telegram') }),
        ['orbit.eth'],
      ),
    ).toBeNull()
  })

  it.each([
    'Share orbit.eth with a QR code',
    'Copy orbit.eth profile link to my clipboard',
    'Copy orbit.eth link to the clipboard',
  ])('retains native profile sharing controls: %s', (query) => {
    expect(
      parseManagerAction(
        query,
        answers('share_profile', { manager_share_target: choice('link') }),
        ['orbit.eth'],
      ),
    ).toMatchObject({ name: 'orbit.eth' })
  })

  it('rejects an optimistically classified excluded target', () => {
    expect(
      parseManagerAction(
        'share alice.eth, not bob.eth',
        answers('share_profile', { target_name: choice('name_2') }),
        ['alice.eth', 'bob.eth'],
      ),
    ).toBeNull()
  })

  it.each([
    ['show notifications for alice.eth', 'show_notifications', ['alice.eth']],
    ['download alice.eth NFT', 'nft_download', ['alice.eth']],
    ['copy wallet address alerts@example.test', 'wallet_copy', []],
    [`disconnect ${address}`, 'wallet_disconnect', []],
    ['remove all favorites', 'unfavorite', []],
    ['revoke all migration approvals', 'migration_revoke', []],
    ['download my NFT as PNG', 'nft_download', []],
    ['turn off push notifications', 'push_enable', []],
    ['turn on push notifications', 'push_disable', []],
    ['remove Telegram', 'telegram_connect', []],
  ] as const)('rejects dropped targets or contradictory operations: %s', (query, kind, names) => {
    expect(parseManagerAction(query, answers(kind), names)).toBeNull()
  })

  it('does not select one of several supplied exact values', () => {
    expect(
      parseManagerAction(
        'add one@example.test and two@example.test',
        answers('email_add'),
        [],
      ),
    ).toBeNull()
    expect(
      parseManagerAction(
        `view ${address} or 0x00000000000000000000000000000000000000b2`,
        answers('view_address'),
        [],
      ),
    ).toBeNull()
  })

  it('distinguishes explicit own wallet from a missing wallet target', () => {
    const own = parseManagerAction(
      'show my wallet profile',
      answers('view_address', { manager_wallet_target: choice('own') }),
      [],
    )
    expect(prepareManagerAction(own as ManagerAction, {})).toMatchObject({
      status: 'ready',
      action: { ownWallet: true },
    })
    const missing = parseManagerAction(
      'show wallet profile',
      answers('view_address'),
      [],
    )
    expect(prepareManagerAction(missing as ManagerAction, {})).toMatchObject({
      status: 'needs_input',
      field: 'address',
    })
  })

  it('retains unread and category together and rejects unknown scopes', () => {
    expect(
      parseManagerAction(
        'show unread expiry alerts',
        answers('show_notifications', {
          manager_unread: choice('yes'),
          manager_notification_scope: choice('expiry'),
        }),
        [],
      ),
    ).toMatchObject({ unreadOnly: true, notificationTag: 'expiry' })
    expect(
      parseManagerAction(
        'show notifications this week',
        answers('show_notifications', {
          manager_notification_scope: choice('unsupported'),
        }),
        [],
      ),
    ).toBeNull()
    expect(
      parseManagerAction(
        'show read notifications',
        answers('show_notifications', {
          manager_unread: choice('unsupported'),
        }),
        [],
      ),
    ).toBeNull()
  })

  it.each([
    'eth-registry:hca',
    'base-registrar:hca',
    'name-wrapper:hca',
  ])('retains exact approval %s', (approval) => {
    expect(
      parseManagerAction(
        'review approval removal',
        answers('migration_revoke', { manager_approval: choice(approval) }),
        [],
      ),
    ).toMatchObject({ approval })
  })
})

describe('management review preparation', () => {
  it.each([
    'unfavorite',
    'share_profile',
    'copy_profile',
  ] as const)('requires an exact valid name for %s', (kind) => {
    expect(prepareManagerAction(action(kind), {}).status).toBe('needs_input')
    expect(prepareManagerAction(action(kind), { name: 'invalid' }).status).toBe(
      'invalid',
    )
    expect(
      prepareManagerAction(action(kind), { name: 'EXAMPLE.eth' }),
    ).toMatchObject({ status: 'ready', action: { name: 'example.eth' } })
  })
  it('validates supplied wallet addresses without substituting the connected wallet', () => {
    expect(
      prepareManagerAction(action('view_address', { address: '0xinvalid' }), {
        address,
      }).status,
    ).toBe('invalid')
    expect(
      prepareManagerAction(action('view_address', { address }), {}).status,
    ).toBe('ready')
  })
  it('asks for email and keeps invalid supplied email invalid', () => {
    expect(prepareManagerAction(action('email_add'), {})).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(
      prepareManagerAction(action('email_add', { email: 'broken@' }), {
        managerValue: 'valid@example.test',
      }).status,
    ).toBe('invalid')
    expect(
      prepareManagerAction(action('email_add'), {
        managerValue: 'test@example.test',
      }),
    ).toMatchObject({ status: 'ready', action: { email: 'test@example.test' } })
  })
  it.each([
    'email_remove',
    'email_resend',
  ] as const)('preserves an email match requirement for %s', (kind) => {
    expect(
      prepareManagerAction(action(kind, { email: 'test@example.test' }), {}),
    ).toMatchObject({ status: 'ready', action: { email: 'test@example.test' } })
    expect(
      prepareManagerAction(action(kind, { email: 'invalid@' }), {}).status,
    ).toBe('invalid')
  })
  it('asks which approval and never accepts arbitrary addresses or prototype keys', () => {
    expect(prepareManagerAction(action('migration_revoke'), {})).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(
      prepareManagerAction(action('migration_revoke'), {
        managerValue: address,
      }).status,
    ).toBe('invalid')
    expect(
      prepareManagerAction(action('migration_revoke'), {
        managerValue: 'eth-registry:hca',
      }),
    ).toMatchObject({
      status: 'ready',
      action: { approval: 'eth-registry:hca' },
    })
  })
  it('supports only existing app locales', () => {
    expect(prepareManagerAction(action('language'), {})).toMatchObject({
      status: 'needs_input',
      options: [
        { value: 'en', label: 'English' },
        { value: 'sv', label: 'Swedish' },
      ],
    })
    for (const value of ['fr', '__proto__', 'constructor'])
      expect(
        prepareManagerAction(action('language'), { managerValue: value })
          .status,
      ).toBe('invalid')
    expect(
      prepareManagerAction(action('language'), { managerValue: 'sv' }),
    ).toMatchObject({ status: 'ready', action: { locale: 'sv' } })
  })
})
