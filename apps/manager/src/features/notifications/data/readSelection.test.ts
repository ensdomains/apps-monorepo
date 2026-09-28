import { describe, expect, it } from 'vitest'
import { selectUnreadNotifications } from './readSelection'

const loaded = [
  { id: 'expiry-new', kind: 'name-expiry', seen: false },
  { id: 'expiry-read', kind: 'name-expiry', seen: true },
  { id: 'update', kind: 'ens-update', seen: false },
  { id: 'blog', kind: 'blog-post', seen: false },
  { id: 'welcome', kind: 'alpha-welcome', seen: false },
  { id: 'transfer', kind: 'name-transferred', seen: false },
] as const

describe('reviewed notification read selection', () => {
  it.each([
    ['expiry', ['expiry-new']],
    ['updates', ['update', 'blog']],
    ['education', ['blog']],
    ['onboarding', ['welcome']],
    ['transfer', ['transfer']],
    ['all', ['expiry-new', 'update', 'blog', 'welcome', 'transfer']],
  ] as const)('retains only loaded unread %s items', (tag, ids) => {
    expect(selectUnreadNotifications(loaded, tag).map(({ id }) => id)).toEqual(
      ids,
    )
  })

  it('never includes already-read items or mutates the loaded query data', () => {
    expect(selectUnreadNotifications([loaded[1]], 'expiry')).toEqual([])
    const selected = selectUnreadNotifications(loaded, 'expiry')
    expect(selected[0]).toBe(loaded[0])
    expect(loaded).toHaveLength(6)
    expect(loaded[0].seen).toBe(false)
  })
})
