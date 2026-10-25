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
import { pushErrorCopy } from './pushErrorCopy'

type PushContactMethodProps = {
  pushChannels: Channel[]
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
  const [lastEnableError, setLastEnableError] = useState<{
    readonly code: PushErrorCode
    readonly permission: NotificationPermission
    readonly endpointHash: string | null
  } | null>(null)

  const browserState = useQuery(browserPushStateQueryOptions)

  const enableMutation = useMutation({
    ...enableBrowserPushMutationOptions,
    onSuccess: () => {
      setLastEnableError(null)
      toast.success(t`Browser notifications enabled`, {
        description: t`Tip: if your browser asks how long to allow notifications, pick the permanent option.`,
      })
      browserState.refetch()
    },
    onError: async (error) => {
      console.error(error)
      const code = getPushErrorCode(error)
      const { title, description } = pushErrorCopy(code, 'enable')
      toast.error(title, { description })
      // Snapshot after the refetch: the failed attempt may itself have changed
      // the browser state (the permission prompt has been answered during it),
      // so anchoring the snapshot to the current state keeps the persistent
      // alert's staleness gate meaningful
      const refreshed = await browserState.refetch()
      setLastEnableError({
        code,
        permission: refreshed.data?.permission ?? 'default',
        endpointHash: refreshed.data?.endpointHash ?? null,
      })
    },
  })

  const disableMutation = useMutation({
    ...disableBrowserPushMutationOptions(queryClient),
    onSuccess: () => {
      setLastEnableError(null)
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
  // (which disappears). It hides again when the user has outrun the guidance:
  // either the failure-time snapshot no longer matches the current browser
  // state (e.g. they changed the site permission in browser settings), or the
  // state-driven "Notifications blocked" banner is already on screen with the
  // same instructions. The suppression is keyed on the rendered condition,
  // not on the error code, so a blocked subscription attempt while the
  // permission is still 'default' (api-level block, permissions policy, ...)
  // keeps its alert instead of losing all guidance.
  const lastEnableErrorCopy =
    lastEnableError &&
    browserState.data?.permission === lastEnableError.permission &&
    browserState.data?.endpointHash === lastEnableError.endpointHash &&
    !(isSupported && permission === 'denied')
      ? pushErrorCopy(lastEnableError.code, 'enable')
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
      {/* The backend has a push channel for this browser, but this browser
          session no longer grants notification permission — the signature of
          a session-scoped (or silently revoked) grant that expired while the
          browser was closed. Explain why re-enabling is expected here. */}
      {isSupported && permission === 'default' && matchedChannel && (
        <Alert>
          <MSymbol className="ms-opsz-16 ms-wght-300 block" symbol="info" />
          <AlertTitle>
            <Trans>Turn notifications back on</Trans>
          </AlertTitle>
          <AlertDescription>
            <Trans>
              Notifications worked here before, but the permission ended with
              your last session. When you re-enable, picking the permanent
              option keeps them working after you close the browser.
            </Trans>
          </AlertDescription>
        </Alert>
      )}
      {lastEnableErrorCopy && (
        <Alert variant="destructive">
          <MSymbol className="ms-opsz-16 ms-wght-300 block" symbol="warning" />
          <AlertTitle>{lastEnableErrorCopy.title}</AlertTitle>
          <AlertDescription>{lastEnableErrorCopy.description}</AlertDescription>
        </Alert>
      )}
    </ContactMethodCard>
  )
}
