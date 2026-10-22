import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MSymbol } from '@/components/ui/material-symbol'
import { Switch } from '@/components/ui/switch'
import type { Channel } from '@/features/notifications/data/queries/channels'
import {
  browserPushStateQueryOptions,
  disableBrowserPushMutationOptions,
  enableBrowserPushMutationOptions,
  getPushErrorCode,
} from '@/features/notifications/data/queries/push'
import type { PushErrorCode } from '@/features/notifications/types/push'
import { ContactMethodCard } from './contact-method-card'

type PushContactMethodProps = {
  pushChannels: Channel[]
}

type PushErrorCopy = {
  title: string
  description: string
}

const isPushChannelWithEndpointHash = (
  channel: Channel,
): channel is Channel & { channel: 'push'; endpointHash: string } => {
  return (
    channel.channel === 'push' &&
    'endpointHash' in channel &&
    typeof channel.endpointHash === 'string'
  )
}

export const PushContactMethod = ({ pushChannels }: PushContactMethodProps) => {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [lastEnableErrorCode, setLastEnableErrorCode] =
    useState<PushErrorCode | null>(null)

  const browserState = useQuery(browserPushStateQueryOptions)

  // Translates a machine-readable PushErrorCode into concrete, actionable
  // guidance (e.g. step-by-step instructions to re-enable Brave's push
  // service) instead of a generic failure message or a raw error tag.
  const pushErrorCopy = (
    code: PushErrorCode,
    action: 'enable' | 'disable',
  ): PushErrorCopy => {
    switch (code) {
      case 'not-supported':
        return {
          title: t`Notifications aren't supported in this browser`,
          description: t`This browser doesn't support push notifications. Try Chrome, Firefox, or Safari, or use email or Telegram notifications instead.`,
        }
      case 'brave-push-disabled':
        return {
          title: t`Brave's push service is turned off`,
          description: t`Brave disables push messaging by default. Open brave://settings/privacy, turn on “Use Google services for push messaging”, then reload this page and try again.`,
        }
      case 'push-service-unavailable':
        return {
          title: t`No push service is available in this browser`,
          description: t`Your browser can't reach a push delivery service. Check your browser's push settings, then try again.`,
        }
      case 'browser-blocked':
        return {
          title: t`Notifications are blocked for this site`,
          description: t`To enable, go to your browser's site settings for this page and allow notifications, then try again.`,
        }
      case 'request-blocked':
        return {
          title: t`The notification prompt was blocked`,
          description: t`Your browser blocked the permission prompt, so notifications couldn't be enabled. Allow notifications for this site, then try again.`,
        }
      case 'permission-dismissed':
        return {
          title: t`The notification prompt was dismissed`,
          description: t`Try again and allow notifications when your browser asks.`,
        }
      case 'service-worker':
        return {
          title: t`Notifications couldn't be set up`,
          description: t`This app needs its notification service worker to receive push messages. Reload the page and try again.`,
        }
      case 'subscription-timeout':
        return {
          title: t`Setting up notifications timed out`,
          description: t`Your browser took too long to register for push messages. Check your connection, then try again.`,
        }
      case 'invalid-server-key':
        return {
          title: t`Notifications are misconfigured`,
          description: t`The notification service returned an invalid key. Please try again later.`,
        }
      case 'server':
        return action === 'enable'
          ? {
              title: t`Couldn't enable notifications`,
              description: t`There was a problem reaching the notification service. Please try again in a moment.`,
            }
          : {
              title: t`Couldn't disable notifications`,
              description: t`There was a problem reaching the notification service. Please try again in a moment.`,
            }
      case 'unknown':
        return action === 'enable'
          ? {
              title: t`Couldn't enable notifications`,
              description: t`Something went wrong while setting up browser notifications. Please try again.`,
            }
          : {
              title: t`Couldn't disable notifications`,
              description: t`Something went wrong while turning off browser notifications. Please try again.`,
            }
    }
  }

  const enableMutation = useMutation({
    ...enableBrowserPushMutationOptions,
    onSuccess: () => {
      setLastEnableErrorCode(null)
      toast.success(t`Browser notifications enabled`)
      browserState.refetch()
    },
    onError: (error) => {
      console.error(error)
      const code = getPushErrorCode(error)
      setLastEnableErrorCode(code)
      const { title, description } = pushErrorCopy(code, 'enable')
      toast.error(title, { description })
      browserState.refetch()
    },
  })

  const disableMutation = useMutation({
    ...disableBrowserPushMutationOptions(queryClient),
    onSuccess: () => {
      toast.success(t`Browser notifications disabled`)
      browserState.refetch()
    },
    onError: (error) => {
      console.error(error)
      const { title, description } = pushErrorCopy(
        getPushErrorCode(error),
        'disable',
      )
      toast.error(title, { description })
      browserState.refetch()
    },
  })

  const isPending = enableMutation.isPending || disableMutation.isPending
  const permission = browserState.data?.permission ?? 'default'
  const isSupported = browserState.data?.isSupported ?? false
  const endpointHash = browserState.data?.endpointHash

  const matchedChannel = endpointHash
    ? pushChannels.find(
        (channel) =>
          isPushChannelWithEndpointHash(channel) &&
          channel.endpointHash === endpointHash,
      )
    : undefined

  const isEnabled = Boolean(matchedChannel)

  const onToggle = (checked: boolean) => {
    if (checked) {
      enableMutation.mutate()
      return
    }

    disableMutation.mutate()
  }

  const action = match({ isSupported, permission })
    .with({ isSupported: true, permission: 'granted' }, () => (
      <Switch
        checked={isEnabled}
        disabled={isPending || browserState.isFetching}
        onCheckedChange={onToggle}
      />
    ))
    .otherwise(() => null)

  const showEnableButton = isSupported && permission === 'default'

  // Persistent guidance for the last failed enable, complementing the toast
  // (which disappears). Skip codes that the "Notifications blocked" alert
  // already covers once the state refetch lands.
  const lastEnableErrorCopy =
    lastEnableErrorCode && lastEnableErrorCode !== 'browser-blocked'
      ? pushErrorCopy(lastEnableErrorCode, 'enable')
      : undefined

  return (
    <ContactMethodCard
      action={action ?? undefined}
      actionDisabled={isPending || browserState.isFetching}
      actionLabel={showEnableButton ? t`Enable` : undefined}
      description={t`Get instant push notifications in your browser`}
      icon={
        <MSymbol
          className="ms-opsz-18 ms-wght-400 text-ens-lapis-core not-italic leading-[19.6px]"
          symbol="computer"
        />
      }
      onAction={showEnableButton ? () => enableMutation.mutate() : undefined}
      title={<Trans>Browser Notifications</Trans>}
      variant="browser-not"
    >
      {isSupported && permission === 'denied' && (
        <Alert variant="destructive">
          <MSymbol className="ms-opsz-16 ms-wght-300 block" symbol="warning" />
          <AlertTitle>
            <Trans>Notifications blocked</Trans>
          </AlertTitle>
          <AlertDescription>
            <Trans>
              To enable, go to your browser's site settings for this page and
              allow notifications.
            </Trans>
          </AlertDescription>
        </Alert>
      )}
      {isSupported && lastEnableErrorCopy && (
        <Alert variant="destructive">
          <MSymbol className="ms-opsz-16 ms-wght-300 block" symbol="warning" />
          <AlertTitle>{lastEnableErrorCopy.title}</AlertTitle>
          <AlertDescription>{lastEnableErrorCopy.description}</AlertDescription>
        </Alert>
      )}
    </ContactMethodCard>
  )
}
