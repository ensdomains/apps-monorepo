import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from '@radix-ui/react-alert-dialog'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { match, P } from 'ts-pattern'
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
import { MSymbol } from '@/components/ui/material-symbol'
import {
  addTelegramChannelMutationOptions,
  type Channel,
  deleteChannelMutationOptions,
  telegramAuthMutationOptions,
} from '@/features/notifications/queries/channels'

const TELEGRAM_BOT_USERNAME = '@ens_earl_bot'

export const TelegramContactMethod = ({ telegram }: { telegram?: Channel }) => {
  const addTelegramChannelMutation = useMutation({
    ...addTelegramChannelMutationOptions,
    onSuccess: () => {
      toast.success('Telegram channel added')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add Telegram channel')
    },
  })

  const telegramAuthMutation = useMutation({
    ...telegramAuthMutationOptions,
    onSuccess: (authData) => {
      addTelegramChannelMutation.mutate({ auth_data: authData })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to authenticate with Telegram')
    },
  })

  const deleteMutation = useMutation({
    ...deleteChannelMutationOptions,
    onMutate: (id) => {
      toast.loading('Removing telegram channel', {
        id: `remove-telegram-${id}`,
        description: `Removing telegram for ${telegram?.label}`,
      })
    },
    onSuccess: (_, id) => {
      toast.success('Telegram channel removed', {
        id: `remove-telegram-${id}`,
      })

      telegramAuthMutation.reset()
      addTelegramChannelMutation.reset()
    },
    onError: (error: Error, id) => {
      toast.error(error.message || 'Failed to remove Telegram channel', {
        id: `remove-telegram-${id}`,
      })
    },
  })

  if (!telegram) {
    return (
      <div className="flex flex-col space-y-3 rounded-lg bg-ens-white p-5">
        <button
          className="flex w-fit items-center gap-4 rounded-full bg-[#54A9EC] px-4 py-3"
          disabled={
            telegramAuthMutation.isPending ||
            addTelegramChannelMutation.isPending
          }
          onClick={() => telegramAuthMutation.mutate()}
          type="button"
        >
          <TelegramIcon className="size-5 text-ens-white" />
          <span className="font-medium text-base text-ens-white leading-ens-none">
            Telegram Notifications
          </span>
        </button>
        <p className="text-[#45556C] text-sm leading-ens-normal">
          {match({
            authPending: telegramAuthMutation.isPending,
            error:
              telegramAuthMutation.error ?? addTelegramChannelMutation.error,
            addPending: addTelegramChannelMutation.isPending,
          })
            .with({ authPending: true }, () => (
              <span className="">
                Please sign in to telegram in the popup window.
              </span>
            ))
            .with({ addPending: true }, () => <span>Adding telegram...</span>)
            .with({ error: P.not(P.nullish) }, ({ error }) => (
              <div className="">
                <span className="font-medium">Failed to add telegram: </span>
                <span>{error.message}</span>
              </div>
            ))
            .otherwise(() => (
              <span>
                Get instant updates through Telegram for your domains.
              </span>
            ))}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-3 rounded-lg bg-ens-white p-5">
      <div className="flex items-center gap-2">
        <TelegramIcon className="size-5 text-ens-lapis-surface" />
        <span className="font-normal text-base text-ens-blue-dark leading-ens-none">
          Telegram
        </span>
        {telegram.status === 'pending' && (
          <div className="flex w-fit items-center rounded bg-[#F8F7E2] px-2 py-1 text-[#CA6200]">
            <MSymbol className="ms-opsz-16 ms-wght-300" symbol="schedule" />
            <span className="ml-2 text-xs">Pending</span>
          </div>
        )}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="flex w-fit items-center gap-4 rounded-full bg-[#54A9EC] px-4 py-3"
            type="button"
          >
            <span className="font-normal text-base text-white leading-ens-none">
              {telegram.label}
            </span>

            <MSymbol className="ms-wght-300 text-ens-white" symbol="close" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Email Contact Method?</AlertDialogTitle>
            <AlertDialogDescription>
              You may miss important alerts if you remove this contact method.
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
            <AlertDialogCancelPrimitive asChild>
              <Button
                className="flex-1/3 uppercase"
                size="lg"
                variant="outline"
              >
                Cancel
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
                Remove
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {telegram.status === 'pending' && (
        <p className="text-[#45556C] text-sm leading-ens-normal">
          <span>
            To finish connecting Telegram, you need to&nbsp;
            <a
              className="text-[#54A9EC] underline hover:text-[#357bb8]"
              href={`https://t.me/${TELEGRAM_BOT_USERNAME.replace(/^@/, '')}?start`}
              rel="noopener noreferrer"
              target="_blank"
            >
              start the ENS Notifications Bot
            </a>
            &nbsp;in Telegram.
          </span>
        </p>
      )}
    </div>
  )
}
