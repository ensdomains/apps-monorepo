import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const pushSwSource = readFileSync(
  join(process.cwd(), 'public/push-sw.js'),
  'utf8',
)

const ORIGIN = 'https://app.ens.domains'
const DEFAULT_NOTIFICATION_RESOURCE = '/logo192.png'

type ExistingClient = {
  readonly url: string
  readonly focus?: ReturnType<typeof vi.fn>
}

const loadPushServiceWorker = (origin = ORIGIN) => {
  const listeners = new Map<string, (event: unknown) => void>()
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const matchAll = vi.fn().mockResolvedValue([])
  const showNotification = vi.fn().mockResolvedValue(undefined)

  runInNewContext(pushSwSource, {
    URL,
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners.set(type, handler)
      },
      location: new URL(`${origin}/push-sw.js`),
      skipWaiting: vi.fn(),
      clients: {
        claim: vi.fn(),
        matchAll,
        openWindow,
      },
      registration: {
        showNotification,
      },
    },
  })

  return {
    listeners,
    matchAll,
    openWindow,
    showNotification,
  }
}

const clickNotification = async (
  rawUrl: unknown,
  options?: {
    readonly origin?: string
    readonly clients?: readonly ExistingClient[]
  },
) => {
  const sw = loadPushServiceWorker(options?.origin)
  sw.matchAll.mockResolvedValue(options?.clients ?? [])
  let waitUntilPromise: Promise<unknown> | undefined

  const handler = sw.listeners.get('notificationclick')
  if (!handler) throw new Error('notificationclick handler missing')

  handler({
    notification: {
      close: vi.fn(),
      data: {
        url: rawUrl,
      },
    },
    waitUntil: (promise: Promise<unknown>) => {
      waitUntilPromise = promise
    },
  })

  if (waitUntilPromise) await waitUntilPromise

  return {
    matchAll: sw.matchAll,
    openWindow: sw.openWindow,
    waitUntilCalled: waitUntilPromise !== undefined,
  }
}

const showPushNotification = async (
  payload: unknown,
  options?: {
    readonly origin?: string
  },
) => {
  const sw = loadPushServiceWorker(options?.origin)
  let waitUntilPromise: Promise<unknown> | undefined

  const handler = sw.listeners.get('push')
  if (!handler) throw new Error('push handler missing')

  handler({
    data: {
      text: () =>
        typeof payload === 'string' ? payload : JSON.stringify(payload),
    },
    waitUntil: (promise: Promise<unknown>) => {
      waitUntilPromise = promise
    },
  })

  if (waitUntilPromise) await waitUntilPromise

  return {
    showNotification: sw.showNotification,
  }
}

describe('push-sw notificationclick URL validation', () => {
  it('accepts relative Manager paths and resolves them against the service-worker origin', async () => {
    const result = await clickNotification('/helgesson.eth')

    expect(result.waitUntilCalled).toBe(true)
    expect(result.openWindow).toHaveBeenCalledWith(
      'https://app.ens.domains/helgesson.eth',
    )
  })

  it('accepts same-origin absolute URLs', async () => {
    const result = await clickNotification(
      'https://app.ens.domains/helgesson.eth',
    )

    expect(result.openWindow).toHaveBeenCalledWith(
      'https://app.ens.domains/helgesson.eth',
    )
  })

  it('accepts explicitly allow-listed HTTPS origins', async () => {
    const result = await clickNotification('https://ens.domains/blog/post')

    expect(result.openWindow).toHaveBeenCalledWith(
      'https://ens.domains/blog/post',
    )
  })

  it('rejects untrusted cross-origin URLs', async () => {
    const result = await clickNotification('https://attacker.example/phish')

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('rejects protocol-relative URLs that resolve cross-origin', async () => {
    const result = await clickNotification('//attacker.example/phish')

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('rejects javascript: URLs', async () => {
    const result = await clickNotification('javascript:alert(1)')

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('rejects data: URLs', async () => {
    const result = await clickNotification('data:text/html,hello')

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('rejects blob: URLs', async () => {
    const result = await clickNotification(
      'blob:https://app.ens.domains/123e4567-e89b-12d3-a456-426614174000',
    )

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('rejects malformed URLs', async () => {
    const result = await clickNotification('http://[')

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('rejects non-string data.url values', async () => {
    const result = await clickNotification({
      href: 'https://attacker.example',
    })

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('does not broadly trust ens.domains subdomains', async () => {
    const result = await clickNotification('https://evil.ens.domains/phish')

    expect(result.waitUntilCalled).toBe(false)
    expect(result.openWindow).not.toHaveBeenCalled()
  })

  it('matches existing windows using the normalized absolute url.href', async () => {
    const focus = vi.fn().mockResolvedValue(undefined)
    const result = await clickNotification('/helgesson.eth', {
      clients: [
        { url: 'https://app.ens.domains/other.eth', focus: vi.fn() },
        { url: 'https://app.ens.domains/helgesson.eth', focus },
      ],
    })

    expect(focus).toHaveBeenCalledOnce()
    expect(result.openWindow).not.toHaveBeenCalled()
  })
})

describe('push-sw notification resource URL validation', () => {
  it('accepts relative same-origin icon and badge URLs', async () => {
    const result = await showPushNotification({
      title: 'Expiry',
      body: 'Your name is expiring',
      icon: '/icons/custom.png',
      badge: '/icons/badge.png',
    })

    expect(result.showNotification).toHaveBeenCalledWith(
      'Expiry',
      expect.objectContaining({
        icon: 'https://app.ens.domains/icons/custom.png',
        badge: 'https://app.ens.domains/icons/badge.png',
      }),
    )
  })

  it('accepts same-origin absolute icon and badge URLs', async () => {
    const result = await showPushNotification({
      title: 'Expiry',
      body: 'Your name is expiring',
      icon: 'https://app.ens.domains/icons/custom.png',
      badge: 'https://app.ens.domains/icons/badge.png',
    })

    expect(result.showNotification).toHaveBeenCalledWith(
      'Expiry',
      expect.objectContaining({
        icon: 'https://app.ens.domains/icons/custom.png',
        badge: 'https://app.ens.domains/icons/badge.png',
      }),
    )
  })

  it('rejects cross-origin icon and badge URLs and uses the fallback', async () => {
    const result = await showPushNotification({
      title: 'Expiry',
      body: 'Your name is expiring',
      icon: 'https://attacker.example/icon.png',
      badge: 'https://ens.domains/badge.png',
    })

    expect(result.showNotification).toHaveBeenCalledWith(
      'Expiry',
      expect.objectContaining({
        icon: DEFAULT_NOTIFICATION_RESOURCE,
        badge: DEFAULT_NOTIFICATION_RESOURCE,
      }),
    )
  })

  it('rejects malformed, javascript:, and data: resource URLs', async () => {
    const malformed = await showPushNotification({
      title: 'Expiry',
      icon: 'http://[',
      badge: 'javascript:alert(1)',
    })
    const dataUrl = await showPushNotification({
      title: 'Expiry',
      icon: 'data:image/png;base64,aaaa',
      badge: { href: 'https://app.ens.domains/icons/badge.png' },
    })

    expect(malformed.showNotification).toHaveBeenCalledWith(
      'Expiry',
      expect.objectContaining({
        icon: DEFAULT_NOTIFICATION_RESOURCE,
        badge: DEFAULT_NOTIFICATION_RESOURCE,
      }),
    )
    expect(dataUrl.showNotification).toHaveBeenCalledWith(
      'Expiry',
      expect.objectContaining({
        icon: DEFAULT_NOTIFICATION_RESOURCE,
        badge: DEFAULT_NOTIFICATION_RESOURCE,
      }),
    )
  })
})
