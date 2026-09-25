import { Trans, useLingui } from '@lingui/react/macro'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import * as v from 'valibot'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import {
  addEmailChannelMutationOptions,
  type Channel,
  cancelEmailVerificationMutationOptions,
  deleteChannelMutationOptions,
  resendVerificationMutationOptions,
  verifyEmailMutationOptions,
} from '@/features/notifications/data/queries/channels'

const newEmailContactMethodFormSchema = v.object({
  email: v.pipe(v.string(), v.email('Please enter a valid email address')),
})

// Match EMAIL_OTP_RESEND_COOLDOWN_MS in the API worker.
const RESEND_COOLDOWN_MS = 30 * 1000

const useSecondsRemaining = (expiresAt: number) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (Date.now() >= expiresAt) return

    const interval = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= expiresAt) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

const PendingEmailResendMenuItem = ({
  email,
  isResending,
  onResend,
}: {
  email: Extract<Channel, { status: 'pending' }>
  isResending: boolean
  onResend: () => void
}) => {
  const resendWait = useSecondsRemaining(
    new Date(email.last_verification_sent_at).getTime() + RESEND_COOLDOWN_MS,
  )

  return (
    <DropdownMenuItem
      disabled={isResending || resendWait > 0}
      onClick={onResend}
    >
      <MSymbol className="ms-wght-300 text-[#515151]" symbol="cached" />
      {resendWait > 0 ? (
        <Trans>Resend in {resendWait}s</Trans>
      ) : (
        <Trans>Resend Verification</Trans>
      )}
    </DropdownMenuItem>
  )
}

const NewEmailContactMethod = () => {
  const { t } = useLingui()
  const addEmailMutation = useMutation({
    ...addEmailChannelMutationOptions,
    onSuccess: () => {
      toast.success(t`Verification requested. Check your email.`)
    },
    onError: (error: Error) => {
      toast.error(error.message || t`Failed to add email`)
    },
  })

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
    <div className="flex gap-3 max-md:flex-col">
      <form.Field name="email">
        {(field) => (
          <Field>
            <InputGroup className="h-12 bg-white">
              <InputGroupInput
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={t`Enter your email`}
                type="email"
                value={field.state.value}
              />
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
            className="w-full uppercase md:w-auto"
            disabled={!canSubmit || isSubmitting}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
            size="lg"
            type="button"
            variant="lightBlue"
          >
            {isSubmitting ? (
              <Trans>Sending...</Trans>
            ) : (
              <Trans>Send Verification</Trans>
            )}
          </Button>
        )}
      </form.Subscribe>
    </div>
  )
}

const PendingEmailVerification = ({
  email,
  isResending,
  onResend,
}: {
  email: Extract<Channel, { status: 'pending' }>
  isResending: boolean
  onResend: () => void
}) => {
  const { t } = useLingui()
  const [otp, setOtp] = useState('')
  const secondsRemaining = useSecondsRemaining(
    new Date(email.expires_at).getTime(),
  )
  const resendWait = useSecondsRemaining(
    new Date(email.last_verification_sent_at).getTime() + RESEND_COOLDOWN_MS,
  )
  const countdown = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`

  const verifyMutation = useMutation({
    ...verifyEmailMutationOptions,
    onSuccess: () => {
      setOtp('')
      toast.success(t`Email verified successfully`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (secondsRemaining === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-ens-signal-warning-700 text-sm" role="status">
          <Trans>
            This verification code has expired. Resend verification to get a new
            code.
          </Trans>
        </p>
        <Button
          disabled={isResending || resendWait > 0}
          onClick={onResend}
          size="lg"
          type="button"
          variant="lightBlue"
        >
          {resendWait > 0 ? (
            <Trans>Resend in {resendWait}s</Trans>
          ) : (
            <Trans>Resend Verification</Trans>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 max-md:flex-col">
        <InputGroup className="h-12 bg-white">
          <InputGroupInput
            aria-label={t`Email verification code`}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            placeholder={t`6-digit code`}
            value={otp}
          />
        </InputGroup>
        <Button
          disabled={otp.length !== 6 || verifyMutation.isPending}
          onClick={() => verifyMutation.mutate({ challengeId: email.id, otp })}
          size="lg"
          type="button"
          variant="lightBlue"
        >
          <Trans>Verify Email</Trans>
        </Button>
      </div>
      <p className="text-slate-600 text-sm">
        <Trans>Code expires in {countdown}</Trans>
      </p>
    </div>
  )
}

const ExistingEmailContactMethod = ({ email }: { email: Channel }) => {
  const { t } = useLingui()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const resendMutation = useMutation({
    ...resendVerificationMutationOptions,
    onMutate: (id) => {
      toast.loading(t`Resending email verification`, {
        id: `resend-email-verification-${id}`,
        description: t`Resending email verification for ${email.label}`,
      })
    },
    onSuccess: (_, id) => {
      toast.success(t`Email verification requested. Check your email.`, {
        id: `resend-email-verification-${id}`,
      })
    },
    onError: (error: Error, id) => {
      toast.error(error.message || t`Failed to resend email verification`, {
        id: `resend-email-verification-${id}`,
      })
    },
  })

  const deleteMutation = useMutation({
    ...deleteChannelMutationOptions,
    onMutate: (id) => {
      toast.loading(t`Removing email channel`, {
        id: `remove-email-${id}`,
        description: t`Removing email for ${email.label}`,
      })
    },
    onSuccess: (_, id) => {
      toast.success(t`Email channel removed`, {
        id: `remove-email-${id}`,
      })
    },
    onError: (error: Error, id) => {
      toast.error(error.message || t`Failed to remove email channel`, {
        id: `remove-email-${id}`,
      })
    },
  })
  const cancelMutation = useMutation({
    ...cancelEmailVerificationMutationOptions,
    onSuccess: () => toast.success(t`Email verification cancelled`),
    onError: (error: Error) => toast.error(error.message),
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 items-center rounded border border-[#D4D9DB] bg-white px-4">
        <div className="text-[#515151] text-base">{email.label}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t`Email options`}
              className="ml-auto"
              size="icon"
              type="button"
              variant="ghost"
            >
              <MSymbol
                className="ms-wght-300 text-[#1C1B1F]"
                symbol="more_horiz"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {email.status === 'pending' && (
              <>
                <PendingEmailResendMenuItem
                  email={email}
                  isResending={resendMutation.isPending}
                  onResend={() => resendMutation.mutate(email.id)}
                />
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
              <MSymbol className="ms-wght-300 text-[#515151]" symbol="delete" />
              {email.status === 'pending' ? (
                <Trans>Cancel Verification</Trans>
              ) : (
                <Trans>Remove</Trans>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {email.status === 'pending' ? (
                  <Trans>Cancel Email Verification?</Trans>
                ) : (
                  <Trans>Remove Email Contact Method?</Trans>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {email.status === 'pending' ? (
                  <Trans>The pending code will stop working.</Trans>
                ) : (
                  <Trans>
                    You may miss important alerts if you remove this contact
                    method. Are you sure you want to continue?
                  </Trans>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
              <Button
                className="flex-1/3 uppercase"
                onClick={() => setShowDeleteDialog(false)}
                size="lg"
                type="button"
                variant="outline"
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button
                className="flex-2/3 uppercase"
                onClick={() => {
                  if (email.status === 'pending')
                    cancelMutation.mutate(email.id)
                  else deleteMutation.mutate(email.id)
                  setShowDeleteDialog(false)
                }}
                size="lg"
                type="button"
                variant="lightBlue"
              >
                {email.status === 'pending' ? (
                  <Trans>Cancel Verification</Trans>
                ) : (
                  <Trans>Remove</Trans>
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {email.status === 'pending' && (
        <PendingEmailVerification
          email={email}
          isResending={resendMutation.isPending}
          key={String(email.expires_at)}
          onResend={() => resendMutation.mutate(email.id)}
        />
      )}
    </div>
  )
}

export const EmailContactMethod = ({ emails }: { emails: Channel[] }) => {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#FAFAFB] p-5">
      <div className="flex items-start gap-2">
        <MSymbol
          className="ms-opsz-18 ms-wght-400 text-ens-lapis-core not-italic leading-[19.6px]"
          symbol="mail"
        />
        <div className="flex flex-col gap-1.5">
          <div className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
            <Trans>Email Notifications</Trans>
          </div>
          <div className="text-slate-600 text-sm">
            <Trans>
              Receive notifications via email for important domain events
            </Trans>
          </div>
        </div>
      </div>

      {emails.map((email) => (
        <div className="flex flex-col gap-3" key={email.id}>
          {match(email.status)
            .with('pending', () => (
              <div className="flex w-fit items-center rounded bg-ens-signal-warning-100 px-2 py-1 text-ens-signal-warning-700">
                <MSymbol className="ms-opsz-16 ms-wght-300" symbol="schedule" />
                <span className="ml-2 text-xs">
                  <Trans>Pending</Trans>
                </span>
              </div>
            ))
            .with('verified', () => (
              <div className="flex w-fit items-center rounded bg-[#DCFCE7] px-2 py-1 text-ens-peridot-core">
                <MSymbol className="ms-opsz-16 ms-wght-300" symbol="check" />
                <span className="ml-2 text-xs">
                  <Trans>Verified</Trans>
                </span>
              </div>
            ))
            .otherwise(() => null)}
          <ExistingEmailContactMethod email={email} />
        </div>
      ))}
      {!emails.some((email) => email.status === 'pending') && (
        <NewEmailContactMethod />
      )}
    </div>
  )
}
