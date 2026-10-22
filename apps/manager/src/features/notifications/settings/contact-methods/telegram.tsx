import { Trans, useLingui } from '@lingui/react/macro'
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from '@radix-ui/react-alert-dialog'
import { useMutation } from '@tanstack/react-query'
import {
  CircleCheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import { TelegramIcon } from '@/components/icons/telegram'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  type Channel,
  deleteChannelMutationOptions,
} from '@/features/notifications/data/queries/channels'
import { useTelegramLogin } from '@/features/notifications/hooks/useTelegramLogin'
import { ContactMethodCard } from './contact-method-card'

export const TelegramContactMethod = ({
  telegram,
}: {
  readonly telegram?: Channel
}) => {
  const { t } = useLingui()

  const login = useTelegramLogin()
  const loginStatus = (
    <div
      aria-live="polite"
      className="space-y-2 text-ens-quartz-550 text-sm empty:hidden"
    >
      {login.isPending && (
        <div className="space-y-3 rounded-lg border border-ens-lapis-dust bg-ens-lapis-tint p-4 text-ens-lapis-dense">
          <div className="flex items-center gap-2 font-medium">
            <Loader2Icon
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
            />
            <Trans>Waiting for Telegram</Trans>
          </div>
          <p className="text-ens-quartz-550 leading-relaxed">
            <Trans>
              Finish connecting in the Telegram tab. You can keep using ENS
              Manager.
            </Trans>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {login.authorizationUrl && (
              <Button asChild size="sm" variant="outline">
                <a
                  href={login.authorizationUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Trans>Open Telegram</Trans>
                  <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
            )}
            <Button
              disabled={login.isCancelling}
              onClick={login.cancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trans>Cancel connection</Trans>
            </Button>
          </div>
        </div>
      )}
      {login.isExpired && (
        <p>
          <Trans>Telegram login expired. Please try again.</Trans>
        </p>
      )}
      {login.attempt?.status === 'failed' && (
        <p>
          <Trans>
            Could not connect Telegram. Please try again and allow the bot to
            send messages.
          </Trans>
        </p>
      )}
      {login.startError && (
        <p className="text-destructive">{login.startError.message}</p>
      )}
      {login.cancelError && (
        <p className="text-destructive">{login.cancelError.message}</p>
      )}
      {login.statusError && (
        <p className="text-destructive">{login.statusError.message}</p>
      )}
    </div>
  )

  const deleteMutation = useMutation({
    ...deleteChannelMutationOptions,
    onMutate: (id) => {
      toast.loading(t`Removing telegram channel`, {
        id: `remove-telegram-${id}`,
        description: t`Removing telegram for ${telegram?.label}`,
      })
    },
    onSuccess: (_, id) => {
      toast.success(t`Telegram channel removed`, {
        id: `remove-telegram-${id}`,
      })
    },
    onError: (error: Error, id) => {
      toast.error(error.message || t`Failed to remove Telegram channel`, {
        id: `remove-telegram-${id}`,
      })
    },
  })

  return (
    <ContactMethodCard
      description={t`Get updates about your names in Telegram.`}
      icon={<TelegramIcon className="size-5 text-ens-lapis-core" />}
      title={<Trans>Telegram notifications</Trans>}
    >
      {telegram && (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-ens-quartz-150 bg-ens-quartz-0 p-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p
              className="truncate text-ens-blue-dark text-sm"
              title={telegram.label}
            >
              {telegram.label}
            </p>
            {telegram.status === 'verified' ? (
              <span className="inline-flex items-center gap-1 text-ens-signal-success-700 text-xs">
                <CircleCheckIcon aria-hidden="true" className="size-3.5" />
                <Trans>Connected</Trans>
              </span>
            ) : (
              <span className="text-ens-signal-warning-700 text-xs">
                <Trans>Bot access needed</Trans>
              </span>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                aria-label={t`Remove Telegram`}
                disabled={deleteMutation.isPending}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2Icon
                  aria-hidden="true"
                  className="size-4 text-ens-quartz-550"
                />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans>Remove Telegram Contact Method?</Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans>
                    You may miss important notifications if you remove this
                    contact method. Are you sure you want to continue?
                  </Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
                <AlertDialogCancelPrimitive asChild>
                  <Button
                    className="flex-1/3 uppercase"
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                </AlertDialogCancelPrimitive>
                <AlertDialogActionPrimitive asChild>
                  <Button
                    className="flex-2/3 uppercase"
                    onClick={() => {
                      deleteMutation.mutate(telegram.id)
                    }}
                    size="lg"
                    type="button"
                    variant="lightBlue"
                  >
                    <Trans>Remove</Trans>
                  </Button>
                </AlertDialogActionPrimitive>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {!login.isPending && telegram?.status !== 'verified' && (
        <>
          {telegram && (
            <p className="text-ens-quartz-550 text-sm leading-relaxed">
              <Trans>
                Reconnect and allow the bot to send you messages to receive
                notifications.
              </Trans>
            </p>
          )}
          <Button
            className="w-full sm:w-fit"
            disabled={login.isStarting}
            onClick={login.connect}
            size="lg"
            type="button"
            variant="blue"
          >
            {login.isStarting ? (
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
                <Trans>Connecting…</Trans>
              </>
            ) : telegram ? (
              <Trans>Reconnect Telegram</Trans>
            ) : (
              <Trans>Connect Telegram</Trans>
            )}
          </Button>
        </>
      )}
      {loginStatus}
    </ContactMethodCard>
  )
}
