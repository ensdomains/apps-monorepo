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
  /** False when the name has nothing to replace, so the action is a plain continue. */
  readonly isReplacing?: boolean
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
  readonly children?: ReactNode
}

const getCopy = (
  intent: ResolverSetupConfirmIntent,
  isReplacing: boolean,
): { title: ReactNode; description: ReactNode; confirmLabel: ReactNode } =>
  match({ intent, isReplacing })
    .with({ intent: 'primary-name', isReplacing: true }, () => ({
      title: <Trans>Set this as your primary name?</Trans>,
      description: (
        <Trans>
          To use this as your primary name, we’ll set a resolver your wallet
          controls and keep only your wallet address.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Continue</Trans>,
    }))
    .with({ intent: 'primary-name', isReplacing: false }, () => ({
      title: <Trans>Set this as your primary name?</Trans>,
      description: (
        <Trans>
          To use this as your primary name, we’ll set a resolver your wallet
          controls.
        </Trans>
      ),
      confirmLabel: <Trans>Continue</Trans>,
    }))
    .with({ intent: 'edit-profile', isReplacing: true }, () => ({
      title: <Trans>Set up this name’s resolver?</Trans>,
      description: (
        <Trans>
          To save these changes, we’ll set a resolver your wallet controls and
          keep only the changes you save.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Save</Trans>,
    }))
    .with({ intent: 'edit-profile', isReplacing: false }, () => ({
      title: <Trans>Set up this name’s resolver?</Trans>,
      description: (
        <Trans>
          To save these changes, we’ll set a resolver your wallet controls.
        </Trans>
      ),
      confirmLabel: <Trans>Save</Trans>,
    }))
    .exhaustive()

export const ResolverSetupConfirmDialog = ({
  intent,
  isReplacing = true,
  open,
  onOpenChange,
  onConfirm,
  children,
}: ResolverSetupConfirmDialogProps) => {
  const { title, description, confirmLabel } = getCopy(intent, isReplacing)

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
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
            variant={isReplacing ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
