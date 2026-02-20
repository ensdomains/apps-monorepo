import { describe, expect, it } from 'vitest'
import notificationKindRegistry, {
  resolveRenderableNotification,
} from './index'

describe('notification kind registry', () => {
  it('contains all known backend kinds', () => {
    expect(Object.keys(notificationKindRegistry).sort()).toEqual([
      'alpha-welcome',
      'blog-post',
      'ens-update',
      'name-expiry',
      'name-transferred',
    ])
  })
})

describe('resolveRenderableNotification', () => {
  it('returns renderable for known kind with valid payload', () => {
    const resolved = resolveRenderableNotification({
      id: '1',
      kind: 'name-expiry',
      payload: {
        name: 'example.eth',
        expiryDate: Date.now() + 1_000_000,
        isOwner: true,
        watchReason: 'owned',
      },
      source: 'personal',
      seen: false,
      timestamp: Date.now(),
    })

    expect(resolved.type).toBe('renderable')
  })

  it('returns invalid for known kind with malformed payload', () => {
    const resolved = resolveRenderableNotification({
      id: '2',
      kind: 'name-expiry',
      payload: {
        name: 'example.eth',
        expiryDate: 'tomorrow',
      },
      source: 'personal',
      seen: false,
      timestamp: Date.now(),
    } as unknown as Parameters<typeof resolveRenderableNotification>[0])

    expect(resolved.type).toBe('invalid')
  })

  it('returns unknown-kind when kind is not registered', () => {
    const resolved = resolveRenderableNotification({
      id: '3',
      kind: 'future-kind',
      payload: {},
      source: 'personal',
      seen: false,
      timestamp: Date.now(),
    } as unknown as Parameters<typeof resolveRenderableNotification>[0])

    expect(resolved.type).toBe('unknown-kind')
  })
})
