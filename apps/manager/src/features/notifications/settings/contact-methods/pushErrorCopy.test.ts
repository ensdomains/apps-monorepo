import { i18n } from '@lingui/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { pushErrorCopy } from './pushErrorCopy'

describe('pushErrorCopy', () => {
  // The @lingui/core/macro t transpiles to i18n._; activating a bare locale
  // makes uncalogued msgids fall back to the source strings asserted below
  beforeAll(() => {
    i18n.activate('en')
  })
  describe('disable direction', () => {
    it('uses neutral retry copy for every non-backend code', () => {
      for (const code of [
        'not-supported',
        'brave-push-disabled',
        'push-service-unavailable',
        'browser-blocked',
        'request-blocked',
        'permission-dismissed',
        'service-worker',
        'subscription-timeout',
        'invalid-server-key',
      ] as const) {
        const copy = pushErrorCopy(code, 'disable')
        expect(copy.title).toBe("Couldn't disable notifications")
        expect(copy.description).toBe(
          'Something went wrong while turning off browser notifications. Please try again.',
        )
      }
    })

    it('uses backend connectivity copy for server errors', () => {
      const copy = pushErrorCopy('server', 'disable')
      expect(copy.title).toBe("Couldn't disable notifications")
      expect(copy.description).toBe(
        'There was a problem reaching the notification service. Please try again in a moment.',
      )
      expect(pushErrorCopy('unknown', 'disable')).toEqual(copy)
    })
  })

  describe('enable direction', () => {
    it('matches the "Notifications blocked" banner wording', () => {
      const copy = pushErrorCopy('browser-blocked', 'enable')
      expect(copy.title).toBe('Notifications blocked')
      expect(copy.description).toBe(
        "To enable, go to your browser's site settings for this page and allow notifications.",
      )
    })

    it('explains how to re-enable Brave push messaging', () => {
      const copy = pushErrorCopy('brave-push-disabled', 'enable')
      expect(copy.title).toBe("Brave's push service is turned off")
      expect(copy.description).toContain('brave://settings/privacy')
    })

    it('does not instruct enabling while disabling fails', () => {
      const copy = pushErrorCopy('browser-blocked', 'disable')
      expect(copy.title).toBe("Couldn't disable notifications")
    })
  })
})
