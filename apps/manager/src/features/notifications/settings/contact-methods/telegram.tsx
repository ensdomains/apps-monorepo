import { Trans, useLingui } from '@lingui/react/macro'
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from '@radix-ui/react-alert-dialog'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { MSymbol } from '@/components/ui/material-symbol'
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
    <div aria-live="polite" className="space-y-2 text-sm">
      {(login.isStarting || login.isPending) && (
        <p>
          <Trans>
            Finish connecting in the Telegram tab. You can keep using ENS
            Manager.
          </Trans>
        </p>
      )}
      {login.authorizationUrl && (
        <a
          className="text-ens-lapis-core underline"
          href={login.authorizationUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Trans>Open Telegram</Trans>
        </a>
      )}
      {login.isPending && (
        <Button
          disabled={login.isCancelling}
          onClick={login.cancel}
          size="sm"
          type="button"
          variant="outline"
        >
          <Trans>Cancel connection</Trans>
        </Button>
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

  if (!telegram) {
    return (
      <ContactMethodCard
        actionLabel={t`Telegram Notifications`}
        actionLoading={login.isStarting || login.isPending}
        description={t`Get instant updates through Telegram for your domains.`}
        icon={
          <MSymbol
            className="ms-opsz-18 ms-wght-400 text-ens-lapis-core not-italic leading-[19.6px]"
            symbol="message"
          />
        }
        onAction={login.connect}
        variant="tg"
      >
        {loginStatus}
      </ContactMethodCard>
    )
  }

  return (
    <ContactMethodCard
      action={
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="flex w-fit items-center gap-3 rounded-full bg-[#54a9ec] px-4 py-3 transition-colors hover:bg-[#3b95d8]"
              type="button"
            >
              <span className="font-normal text-sm text-white leading-ens-normal">
                {telegram.label}
              </span>
              <MSymbol className="ms-wght-300 text-ens-white" symbol="close" />
            </button>
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
                  variant="lightBlue"
                >
                  <Trans>Remove</Trans>
                </Button>
              </AlertDialogActionPrimitive>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
      description={
        telegram.status === 'verified' ? (
          <Trans>Connected</Trans>
        ) : (
          <Trans>Bot access needed</Trans>
        )
      }
      icon={
        <MSymbol
          className="ms-opsz-18 ms-wght-400 text-ens-lapis-core not-italic leading-[19.6px]"
          symbol="message"
        />
      }
      title={<Trans>Telegram</Trans>}
    >
      {telegram.status !== 'verified' && (
        <Button
          disabled={login.isStarting || login.isPending}
          onClick={login.connect}
          type="button"
          variant="outline"
        >
          <Trans>Reconnect Telegram</Trans>
        </Button>
      )}
      {loginStatus}
    </ContactMethodCard>
  )
}
