import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTelegramContinueUrl,
  getTelegramOpeningStrategy,
  tryOpenTelegramTab,
} from './browser'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Telegram browser handoff', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WebView MetaMaskMobile',
      'safari',
    ],
    ['Android Mobile MetaMaskMobile', 'copy-link'],
    ['iPhone Safari', 'new-tab'],
  ] as const)('selects the opening strategy: %s', (userAgent, expected) => {
    expect(getTelegramOpeningStrategy(userAgent)).toBe(expected)
  })

  it('changes only the opening scheme, preserving OAuth parameters and the callback', () => {
    const url =
      'https://oauth.telegram.org/auth?state=random&redirect_uri=https%3A%2F%2Fapi.example.com%2Fcallback'
    expect(getTelegramContinueUrl(url, 'safari')).toBe(
      'x-safari-https://oauth.telegram.org/auth?state=random&redirect_uri=https%3A%2F%2Fapi.example.com%2Fcallback',
    )
    expect(getTelegramContinueUrl(url, 'new-tab')).toBe(url)
  })

  it.each([false, undefined])(
    'does not open without current user activation: %s',
    (isActive) => {
      vi.stubGlobal('navigator', {
        userActivation: isActive === undefined ? undefined : { isActive },
      })
      const open = vi.spyOn(window, 'open')
      tryOpenTelegramTab('https://oauth.telegram.org/auth', 'new-tab')
      expect(open).not.toHaveBeenCalled()
    },
  )

  it.each(['blocked', 'throws'])(
    'allows manual continuation when automatic opening %s',
    (outcome) => {
      vi.stubGlobal('navigator', { userActivation: { isActive: true } })
      const open = vi.spyOn(window, 'open').mockImplementation(() => {
        if (outcome === 'throws') throw new Error('unsupported')
        return null
      })
      expect(() =>
        tryOpenTelegramTab('https://oauth.telegram.org/auth', 'new-tab'),
      ).not.toThrow()
      expect(open).toHaveBeenCalledWith(
        'https://oauth.telegram.org/auth',
        '_blank',
        'noopener,noreferrer',
      )
    },
  )
})
