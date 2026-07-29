import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export type ResolverSetupConfirmIntent = 'primary-name' | 'edit-profile'

interface ResolverSetupConfirmDialogProps {
  readonly intent: ResolverSetupConfirmIntent
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
}

const getCopy = (
  intent: ResolverSetupConfirmIntent,
): { title: ReactNode; description: ReactNode; confirmLabel: ReactNode } =>
  match(intent)
    .with('primary-name', () => ({
      title: <Trans>Replace this name’s profile setup?</Trans>,
      description: (
        <Trans>
          This name still has profile settings from a previous owner. Continuing
          will replace them. Only your wallet address will be kept — other
          profile details will be cleared.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Continue</Trans>,
    }))
    .with('edit-profile', () => ({
      title: <Trans>Replace this name’s profile setup?</Trans>,
      description: (
        <Trans>
          This name still has profile settings from a previous owner. Continuing
          will replace them with what you’ve entered here.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Save</Trans>,
    }))
    .exhaustive()

export const ResolverSetupConfirmDialog = ({
  intent,
  open,
  onOpenChange,
  onConfirm,
}: ResolverSetupConfirmDialogProps) => {
  const { title, description, confirmLabel } = getCopy(intent)

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row md:ml-auto md:w-2/3">
          <Button
            className="flex-1/3 uppercase"
            onClick={() => onOpenChange(false)}
            size="lg"
            variant="outline"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            className="flex-2/3 uppercase"
            onClick={() => {
              // Confirm before close — edit-profile clears the deferred save
              // when the dialog closes, so reversing this no-ops Replace & Save.
              onConfirm()
              onOpenChange(false)
            }}
            size="lg"
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
