import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from '@radix-ui/react-alert-dialog'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { match, P } from 'ts-pattern'
import * as v from 'valibot'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldError } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { MSymbol } from '@/components/ui/material-symbol'
import { Switch } from '@/components/ui/switch'
import {
  addEmailChannelMutationOptions,
  addTelegramChannelMutationOptions,
  type Channel,
  channelsQueryOptions,
  deleteChannelMutationOptions,
  resendVerificationMutationOptions,
  telegramAuthMutationOptions,
} from '@/features/notifications/queries/channels'
import {
  preferencesQueryOptions,
  updatePreferenceMutationOptions,
} from '@/features/notifications/queries/preferences'

const TELEGRAM_BOT_USERNAME = '@ens_earl_bot'

export const Route = createFileRoute('/notifications/settings/')({
  component: RouteComponent,
})

const EmailContactMethod = ({ email }: { email?: Channel }) => {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#FAFAFB] p-5">
      {match(email?.status)
        .with('pending', () => (
          <div className="flex w-fit items-center rounded bg-[#F8F7E2] px-2 py-1 text-[#CA6200]">
            <MSymbol className="ms-opsz-16 ms-wght-300" symbol="schedule" />
            <span className="ml-2 text-xs">Pending</span>
          </div>
        ))
        .with('verified', () => (
          <div className="flex w-fit items-center rounded bg-[#DCFCE7] px-2 py-1 text-ens-peridot-core">
            <MSymbol className="ms-opsz-16 ms-wght-300" symbol="check" />
            <span className="ml-2 text-xs">Verified</span>
          </div>
        ))
        .otherwise(() => null)}
      <div className="flex items-start gap-2">
        <MSymbol className="ms-wght-300 text-ens-lapis-surface" symbol="mail" />
        <div className="flex flex-col gap-1.5">
          <div className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
            Email Notifications
          </div>
          <div className="text-slate-600 text-sm">
            Receive notifications via email for important domain events
          </div>
        </div>
      </div>

      {email ? (
        <ExistingEmailContactMethod email={email} />
      ) : (
        <NewEmailContactMethod />
      )}
    </div>
  )
}

const newEmailContactMethodFormSchema = v.object({
  email: v.pipe(v.string(), v.email('Please enter a valid email address')),
})

const NewEmailContactMethod = () => {
  const addEmailMutation = useMutation({
    ...addEmailChannelMutationOptions,
    onSuccess: () => {
      toast.success('Email added')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add email')
    },
  })

  // TODO: autofill email from para if signed in with an email option
  const form = useForm({
    defaultValues: {
      email: '',
    },
    validators: {
      onChange: newEmailContactMethodFormSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      await addEmailMutation.mutateAsync({ email: value.email })
      formApi.reset()
    },
  })
  return (
    <div className="flex gap-3">
      <form.Field name="email">
        {(field) => (
          <Field>
            <InputGroup className="h-12 bg-white">
              <InputGroupInput
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Enter your email"
                type="email"
                value={field.state.value}
              />
              {/* <InputGroupAddon>
            <Button variant="ghost" size="icon">
              <MSymbol symbol="mail" className="ms-wght-300 text-ens-lapis-surface" />
            </Button>
          </InputGroupAddon> */}
              {field.state.meta.isValid && field.state.meta.isDirty && (
                <InputGroupAddon align="inline-end">
                  <MSymbol
                    className="ms-wght-300 text-ens-lapis-surface"
                    symbol="check"
                  />
                </InputGroupAddon>
              )}
            </InputGroup>
            <FieldError
              className="flex items-center gap-0"
              errors={field.state.meta.errors}
              renderPrefix={
                <MSymbol
                  className="ms-opsz-16 ms-wght-400 text-destructive"
                  symbol="priority_high"
                />
              }
            />
          </Field>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            className="uppercase"
            disabled={!canSubmit || isSubmitting}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
            size="lg"
            variant="lightBlue"
          >
            {isSubmitting ? 'Sending...' : 'Send Verification'}
          </Button>
        )}
      </form.Subscribe>
    </div>
  )
}

const ExistingEmailContactMethod = ({ email }: { email: Channel }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const resendMutation = useMutation({
    ...resendVerificationMutationOptions,
    onMutate: (id) => {
      toast.loading('Resending email verification', {
        id: `resend-email-verification-${id}`,
        description: `Resending email verification for ${email.label}`,
      })
    },
    onSuccess: (_, id) => {
      toast.success('Email verification sent', {
        id: `resend-email-verification-${id}`,
      })
    },
    onError: (error: Error, id) => {
      toast.error(error.message || 'Failed to resend email verification', {
        id: `resend-email-verification-${id}`,
      })
    },
  })

  const deleteMutation = useMutation({
    ...deleteChannelMutationOptions,
    onMutate: (id) => {
      toast.loading('Removing email channel', {
        id: `remove-email-${id}`,
        description: `Removing email for ${email.label}`,
      })
    },
    onSuccess: (_, id) => {
      toast.success('Email channel removed', {
        id: `remove-email-${id}`,
      })
      toast.success('Email channel removed')
    },
    onError: (error: Error, id) => {
      toast.error(error.message || 'Failed to remove email channel', {
        id: `remove-email-${id}`,
      })
    },
  })
  return (
    <div className="flex h-12 items-center rounded border border-[#D4D9DB] bg-white px-4">
      <div className="text-[#515151] text-base">{email.label}</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="ml-auto" size="icon" variant="ghost">
            <MSymbol
              className="ms-wght-300 text-[#1C1B1F]"
              symbol="more_horiz"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {email.status === 'pending' && (
            <>
              <DropdownMenuItem
                className=""
                onClick={() => resendMutation.mutate(email.id)}
              >
                <MSymbol
                  className="ms-wght-300 text-[#515151]"
                  symbol="cached"
                />
                Resend Verification
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            className=""
            onClick={() => setShowDeleteDialog(true)}
          >
            <MSymbol className="ms-wght-300 text-[#515151]" symbol="delete" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Email Contact Method?</AlertDialogTitle>
            <AlertDialogDescription>
              You may miss important alerts if you remove this contact method.
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
            <Button
              className="flex-1/3 uppercase"
              onClick={() => setShowDeleteDialog(false)}
              size="lg"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="flex-2/3 uppercase"
              onClick={() => {
                deleteMutation.mutate(email.id)
                setShowDeleteDialog(false)
              }}
              size="lg"
              variant="lightBlue"
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const TelegramContactMethod = ({ telegram }: { telegram?: Channel }) => {
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

const ContactMethods = () => {
  const channels = useQuery({
    ...channelsQueryOptions,
    select: (data) => ({
      email: data.find((c) => c.channel === 'email'),
      telegram: data.find((c) => c.channel === 'telegram'),
      push: data.filter((c) => c.channel === 'push'),
    }),
  })

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-medium font-sans text-[#232222] text-base leading-ens-none">
        Contact Methods
      </h2>
      <EmailContactMethod email={channels.data?.email} />
      <TelegramContactMethod telegram={channels.data?.telegram} />
    </div>
  )
}

const Preference = ({
  icon,
  label,
  description,
  checked,
  disabled,
  isLoading,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  isLoading?: boolean
  onChange: (checked: boolean) => void
}) => {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[#FAFAFB] p-5">
      {icon}
      <div className="flex flex-col gap-1.5">
        <div className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
          {label}
        </div>
        <div className="text-slate-600 text-sm">{description}</div>
      </div>
      {isLoading ? (
        <Loader2Icon className="ml-auto size-5 animate-spin" />
      ) : (
        <Switch
          checked={checked}
          className="ml-auto"
          disabled={disabled}
          onCheckedChange={onChange}
        />
      )}
    </div>
  )
}

const NotificationPreferences = () => {
  const preferences = useQuery({
    ...preferencesQueryOptions,
  })

  const updatePreferencesMutation = useMutation({
    ...updatePreferenceMutationOptions,
    onSuccess: () => {
      toast.success('Preferences updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update preferences')
    },
  })

  const form = useForm({
    defaultValues: {
      ownedNameExpiry: preferences.data?.settings?.ownedNameExpiry ?? false,
      ensLabsUpdates: preferences.data?.settings?.ensLabsUpdates ?? false,
      favouritedNameExpiry:
        preferences.data?.settings?.favouritedNameExpiry ?? false,
    },
    onSubmit: async ({ formApi, value }) => {
      await updatePreferencesMutation.mutateAsync(value)

      await preferences.refetch()

      formApi.reset()
    },
  })

  const hasVerifiedChannels =
    (preferences.data?.verifiedChannels?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-medium font-sans text-[#232222] text-base leading-ens-none">
        Notification Preferences
      </h2>
      <div className="flex flex-col gap-3">
        <form.Field name="ownedNameExpiry">
          {(field) => (
            <Preference
              checked={field.state.value}
              description="You'll be notified 30, 7, and 1 day before expiry"
              disabled={false}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="schedule"
                />
              }
              isLoading={preferences.isLoading}
              label="Name Expiry"
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="ensLabsUpdates">
          {(field) => (
            <Preference
              checked={field.state.value}
              description="Get updated on the latest releases and features"
              disabled={false}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="search"
                />
              }
              isLoading={preferences.isLoading}
              label="ENS Labs Updates"
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
        <form.Field name="favouritedNameExpiry">
          {(field) => (
            <Preference
              checked={field.state.value}
              description="Get notified when names in your favourites expire"
              disabled={false}
              icon={
                <MSymbol
                  className="ms-wght-300 text-ens-lapis-surface"
                  symbol="favorite"
                />
              }
              isLoading={preferences.isLoading}
              label="Favourited Name Expiry"
              onChange={(checked) => field.handleChange(checked)}
            />
          )}
        </form.Field>
      </div>
      <div className="ml-auto w-full max-w-md">
        <form.Subscribe
          selector={(state) => [
            state.canSubmit,
            state.isSubmitting,
            state.isDefaultValue,
          ]}
        >
          {([canSubmit, isSubmitting, isDefaultValue]) => (
            <Button
              className="w-full uppercase"
              disabled={!canSubmit || !hasVerifiedChannels || isDefaultValue}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                form.handleSubmit()
              }}
              size="xl"
              variant="lightBlue"
            >
              {isSubmitting ? 'Saving...' : 'Save Preferences'}
            </Button>
          )}
        </form.Subscribe>
        {!hasVerifiedChannels && (
          <p className="mt-2 text-base text-slate-600 leading-ens-normal">
            Verify at least one contact method to save preferences
          </p>
        )}
      </div>
    </div>
  )
}

function RouteComponent() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-12 rounded-lg border-[#dededf] bg-white px-6 py-8 lg:my-5 lg:border">
      {/* title row */}
      <div className="flex flex-col gap-4">
        {/* title */}
        <h1 className="font-[350] font-serif text-[#232222] text-temp-32px leading-ens-none">
          Notification Settings
        </h1>

        <p className="text-[#717182] text-base">
          Manage your notification preferences for your name(s) and ENS-related
          updates.
        </p>
      </div>

      <ContactMethods />

      <NotificationPreferences />
    </div>
  )
}
