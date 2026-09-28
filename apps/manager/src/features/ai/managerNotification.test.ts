import { describe, expect, it } from 'vitest'
import { parseJevAiResponse } from './intent'
import { parseManagerAction, prepareManagerAction } from './managerActions'

const choice = (value: string, confidence = 0.99) => ({
  type: 'choice',
  choice: value,
  confidence,
})
const answers = (scope = 'all', extra: Record<string, unknown> = {}) => ({
  manager_action: choice('mark_notifications_read'),
  manager_constraints: choice('represented'),
  manager_notification_scope: choice(scope),
  manager_unread: choice('no'),
  ...extra,
})

describe('native notification request scope', () => {
  it.each([
    ['Show my notifications, only unread', 'all'],
    ['Show expiry notifications that I have not read', 'expiry'],
  ])('preserves a read-only unread selection: %s', (query, tag) => {
    const response = {
      answers: {
        ...answers(tag, {
          manager_action: choice('show_notifications'),
          manager_unread: choice('yes'),
        }),
        fully_supported: { type: 'noul', noul: 0.99 },
        unsupported_requirement: { type: 'noul', noul: 0.01 },
        multi_action: { type: 'noul', noul: 0.01 },
        intent: choice('manager_action'),
        request_mode: choice('requested'),
        action_count: choice('one'),
        next_intent: choice('none'),
      },
    }
    expect(parseJevAiResponse(response, query)).toMatchObject({
      status: 'ok',
      action: {
        intent: 'manager_action',
        kind: 'show_notifications',
        notificationTag: tag,
        unreadOnly: true,
      },
    })
  })
  it.each([
    ['Mark expiry notifications as unread', 'expiry', 'yes'],
    ['Mark expiry notifications unread', 'expiry', 'yes'],
    ['Mark expiry notifications as not read', 'expiry', 'yes'],
    ['Clear my inbox', 'all', 'no'],
    ['Clear my notifications', 'all', 'no'],
  ])('rejects unsupported direction or ambiguous clearing even with an optimistic complete model response: %s', (query, tag, unread) => {
    const response = {
      answers: {
        ...answers(tag, { manager_unread: choice(unread) }),
        fully_supported: { type: 'noul', noul: 0.99 },
        unsupported_requirement: { type: 'noul', noul: 0.01 },
        multi_action: { type: 'noul', noul: 0.01 },
        intent: choice('manager_action'),
        request_mode: choice('requested'),
        action_count: choice('one'),
        next_intent: choice('none'),
      },
    }
    expect(parseJevAiResponse(response, query)).toBeNull()
  })
  it('does not let irrelevant unread metadata reject a correctly scoped informal request', () => {
    expect(
      parseManagerAction(
        'Please mark those expiry notications as read',
        answers('expiry', {
          manager_unread: choice('no', 0.42),
        }),
        [],
      ),
    ).toMatchObject({
      kind: 'mark_notifications_read',
      notificationTag: 'expiry',
      unreadOnly: false,
    })
    expect(
      parseManagerAction(
        'Mark unread expiry notifications as read',
        answers('expiry', {
          manager_unread: choice('no', 0.42),
        }),
        [],
      ),
    ).toBeNull()
  })
  it('resolves uncertain metadata only when every local constraint agrees', () => {
    expect(
      parseManagerAction(
        'Mark only expiry notifications as read',
        answers('expiry', {
          manager_constraints: choice('represented', 0.4),
          manager_notification_scope: choice('expiry', 0.4),
          manager_unread: choice('no', 0.4),
        }),
        [],
      ),
    ).toMatchObject({ notificationTag: 'expiry', unreadOnly: false })
    for (const confidence of [-1, Number.NaN, 1.1])
      expect(
        parseManagerAction(
          'Mark only expiry notifications as read',
          answers('expiry', {
            manager_unread: choice('no', confidence),
          }),
          [],
        ),
      ).toBeNull()
  })

  it('cannot turn inbox viewing into a write or mark-as-read into viewing', () => {
    expect(
      parseManagerAction('Show my expiry notifications', answers('expiry'), []),
    ).toBeNull()
    expect(
      parseManagerAction(
        'Mark expiry notifications as read',
        answers('expiry', {
          manager_action: choice('show_notifications'),
        }),
        [],
      ),
    ).toBeNull()
  })
  it.each([
    'Mark only expiry notifications as read',
    'Please mark my expiry alerts as read',
    'Mark the notifications about expiration as read',
  ])('preserves the requested expiry category: %s', (query) => {
    expect(parseManagerAction(query, answers('expiry'), [])).toMatchObject({
      kind: 'mark_notifications_read',
      notificationTag: 'expiry',
    })
  })

  it.each([
    'Mark notifications as read',
    'Mark all my notifications as read',
    'Clear the unread status of my loaded notifications',
  ])('rejects an unrequested category: %s', (query) => {
    expect(parseManagerAction(query, answers('expiry'), [])).toBeNull()
  })

  it.each([
    'Mark expiry notifications from last week as read',
    'Mark expiry notifications from today as read',
    'Mark expiry notifications before September as read',
    'Mark expiry notifications from the past 45 days as read',
    'Mark expiry notifications since yesterday as read',
    'Mark expiry notifications except unread ones as read',
    'Mark expiry and transfer notifications as read',
    'Mark all notifications except expiry as read',
    'Mark only already-read expiry notifications as read',
    'Mark all historical expiry notifications including unloaded ones as read',
  ])('rejects extra unsupported selection even with optimistic model facets: %s', (query) => {
    expect(parseManagerAction(query, answers('expiry'), [])).toBeNull()
  })

  it('rejects a model category that contradicts the exact requested category', () => {
    expect(
      parseManagerAction(
        'Mark only expiry notifications as read',
        answers('transfer'),
        [],
      ),
    ).toBeNull()
  })

  it('asks which category when the user requests a category without identifying it', () => {
    const action = parseManagerAction(
      'Mark one category of notifications as read',
      answers('missing'),
      [],
    )
    expect(action).toMatchObject({
      kind: 'mark_notifications_read',
      notificationTagRequested: true,
    })
    if (!action) throw new Error('A missing category must be clarified')
    expect(prepareManagerAction(action, {})).toMatchObject({
      status: 'needs_input',
      field: 'managerValue',
    })
    expect(
      prepareManagerAction(action, { managerValue: 'expiry' }),
    ).toMatchObject({
      status: 'ready',
      action: { notificationTag: 'expiry' },
    })
    expect(
      prepareManagerAction(action, { managerValue: 'security' }),
    ).toMatchObject({ status: 'invalid' })
  })
})
