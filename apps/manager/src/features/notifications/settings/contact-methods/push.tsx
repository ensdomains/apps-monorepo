import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { Switch } from '@/components/ui/switch'
import type { Channel } from '@/features/notifications/data/queries/channels'
import {
  browserPushStateQueryOptions,
  disableBrowserPushMutationOptions,
  enableBrowserPushMutationOptions,
} from '@/features/notifications/data/queries/push'

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

  const browserState = useQuery(browserPushStateQueryOptions)

  const enableMutation = useMutation({
    ...enableBrowserPushMutationOptions,
    onSuccess: () => {
      toast.success(t`Browser notifications enabled`)
      browserState.refetch()
    },
    onError: (error) => {
      console.error(error)
      toast.error(error.message || error._tag)
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
      toast.error(error.message || error._tag)
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

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#FAFAFB] p-5">
      <div className="flex items-start gap-2">
        <MSymbol
          className="ms-wght-300 text-ens-lapis-surface"
          symbol="notifications"
        />
        <div className="flex flex-col gap-1.5">
          <div className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
            <Trans>Browser Notifications</Trans>
          </div>
          <div className="text-slate-600 text-sm">
            <Trans>Get instant push notifications in your browser</Trans>
          </div>
        </div>

        <div className="ml-auto">
          {match({ isSupported, permission })
            .with({ isSupported: true, permission: 'granted' }, () => (
              <div className="flex items-center gap-2">
                <Switch
                  checked={isEnabled}
                  disabled={isPending || browserState.isFetching}
                  onCheckedChange={onToggle}
                />
              </div>
            ))
            .with({ isSupported: true, permission: 'default' }, () => (
              <Button
                className="uppercase"
                disabled={isPending || browserState.isFetching}
                onClick={() => enableMutation.mutate()}
                size="lg"
                variant="lightBlue"
              >
                <Trans>Enable</Trans>
              </Button>
            ))
            .otherwise(() => null)}
        </div>
      </div>

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
    </div>
  )
}
