import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
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
  deleteChannelMutationOptions,
  resendVerificationMutationOptions,
} from '@/features/notifications/queries/channels'

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

export const EmailContactMethod = ({ email }: { email?: Channel }) => {
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
