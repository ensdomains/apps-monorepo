import { t } from '@lingui/core/macro'
import { match, P } from 'ts-pattern'
import type { PushErrorCode } from '@/features/notifications/types/push'

export type PushErrorCopy = {
  readonly title: string
  readonly description: string
}

/**
 * Translates a machine-readable {@link PushErrorCode} into concrete,
 * actionable guidance (e.g. step-by-step instructions to re-enable Brave's
 * push service) instead of a generic failure message or a raw error tag.
 *
 * Direction-aware: while enabling notifications, failures get browser-setup
 * instructions, whereas a failure while *turning notifications off* must not
 * tell the user to enable something — every non-backend disable error gets
 * the same neutral retry copy.
 */
export const pushErrorCopy = (
  code: PushErrorCode,
  action: 'enable' | 'disable',
): PushErrorCopy =>
  match({ code, action })
    .returnType<PushErrorCopy>()
    .with({ action: 'disable' }, () =>
      code === 'server' || code === 'unknown'
        ? {
            title: t`Couldn't disable notifications`,
            description: t`There was a problem reaching the notification service. Please try again in a moment.`,
          }
        : {
            title: t`Couldn't disable notifications`,
            description: t`Something went wrong while turning off browser notifications. Please try again.`,
          },
    )
    .with({ code: 'not-supported' }, () => ({
      title: t`Notifications aren't supported in this browser`,
      description: t`This browser doesn't support push notifications. Try Chrome, Firefox, or Safari, or use email or Telegram notifications instead.`,
    }))
    .with({ code: 'brave-push-disabled' }, () => ({
      title: t`Brave's push service is turned off`,
      description: t`Brave disables push messaging by default. Open brave://settings/privacy, turn on “Use Google services for push messaging”, then reload this page and try again.`,
    }))
    .with({ code: 'push-service-unavailable' }, () => ({
      title: t`No push service is available in this browser`,
      description: t`Your browser can't reach a push delivery service. Check your browser's push settings, then try again.`,
    }))
    .with({ code: 'browser-blocked' }, () => ({
      // Same strings as the "Notifications blocked" banner for this state, so
      // translators keep one message per locale and both surfaces read alike
      title: t`Notifications blocked`,
      description: t`To enable, go to your browser's site settings for this page and allow notifications.`,
    }))
    .with({ code: 'request-blocked' }, () => ({
      title: t`The notification prompt was blocked`,
      description: t`Your browser blocked the permission prompt, so notifications couldn't be enabled. Allow notifications for this site, then try again.`,
    }))
    .with({ code: 'permission-dismissed' }, () => ({
      title: t`The notification prompt was dismissed`,
      description: t`Try again and allow notifications when your browser asks.`,
    }))
    .with({ code: 'service-worker' }, () => ({
      title: t`Notifications couldn't be set up`,
      description: t`This app needs its notification service worker to receive push messages. Reload the page and try again.`,
    }))
    .with({ code: 'subscription-timeout' }, () => ({
      title: t`Setting up notifications timed out`,
      description: t`Your browser took too long to register for push messages. Check your connection, then try again.`,
    }))
    .with({ code: 'invalid-server-key' }, () => ({
      title: t`Notifications are misconfigured`,
      description: t`The notification service returned an invalid key. Please try again later.`,
    }))
    .with({ code: P.union('server', 'unknown') }, () => ({
      title: t`Couldn't enable notifications`,
      description: t`Something went wrong while setting up browser notifications. Please try again.`,
    }))
    .exhaustive()
