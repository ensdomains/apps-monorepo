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
import type { ResolverRecordWrite } from '@/features/profile/service/resolverReplacementRecords'

/**
 * What a new primary-name resolver replaces: nothing (a plain continue), a
 * working resolver or address (a destructive replace), or an address that is
 * not a working resolver, which holds nothing readable.
 */
export type ResolverSetupReplacement =
  | 'nothing'
  | 'resolver'
  | 'invalid-resolver'

type ResolverSetupTarget =
  | {
      readonly intent: 'primary-name'
      readonly replaces: ResolverSetupReplacement
    }
  | {
      readonly intent: 'edit-profile'
      /** False when the name has nothing to replace, so the action is a plain continue. */
      readonly isReplacing: boolean
    }

type ResolverSetupConfirmDialogProps = ResolverSetupTarget & {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
  readonly children?: ReactNode
  readonly recordWrites?: readonly ResolverRecordWrite[]
}

const getCopy = (
  target: ResolverSetupTarget,
): { title: ReactNode; description: ReactNode; confirmLabel: ReactNode } =>
  match(target)
    .with({ intent: 'primary-name', replaces: 'invalid-resolver' }, () => ({
      title: <Trans>Replace this name’s resolver?</Trans>,
      description: (
        <Trans>
          This name points to an address that isn’t a working resolver, so its
          records can’t be read or saved. To use it as your primary name, we’ll
          replace it with a resolver your wallet controls.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Continue</Trans>,
    }))
    .with({ intent: 'primary-name', replaces: 'resolver' }, () => ({
      title: <Trans>Set this as your primary name?</Trans>,
      description: (
        <Trans>
          To use this as your primary name, we’ll set a resolver your wallet
          controls and keep only your wallet address.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Continue</Trans>,
    }))
    .with({ intent: 'primary-name', replaces: 'nothing' }, () => ({
      title: <Trans>Set this as your primary name?</Trans>,
      description: (
        <Trans>
          To use this as your primary name, we’ll set a resolver your wallet
          controls.
        </Trans>
      ),
      confirmLabel: <Trans>Continue</Trans>,
    }))
    .with({ intent: 'edit-profile', isReplacing: false }, () => ({
      title: <Trans>Set up this name’s resolver?</Trans>,
      description: (
        <Trans>
          We’ll prepare a resolver your wallet controls with the records listed
          below, verify them, then assign it to this name.
        </Trans>
      ),
      confirmLabel: <Trans>Set up & Save</Trans>,
    }))
    .with({ intent: 'edit-profile', isReplacing: true }, () => ({
      title: <Trans>Set up this name’s resolver?</Trans>,
      description: (
        <Trans>
          We’ll prepare a resolver your wallet controls with only the changes
          listed below. Existing records you did not edit will not be copied.
          Your current resolver stays active until the replacement is ready.
        </Trans>
      ),
      confirmLabel: <Trans>Replace & Save</Trans>,
    }))
    .exhaustive()

/** Only replacing something readable warrants the destructive action. */
const isDestructive = (target: ResolverSetupTarget): boolean =>
  target.intent === 'primary-name'
    ? target.replaces === 'resolver'
    : target.isReplacing

export const ResolverSetupConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  children,
  recordWrites,
  ...target
}: ResolverSetupConfirmDialogProps) => {
  const { title, description, confirmLabel } = getCopy(target)

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {target.intent === 'edit-profile' && recordWrites?.length === 0 ? (
          <p className="rounded-md border p-3 text-sm" role="status">
            <Trans>
              No profile records will be kept. The replacement resolver will
              start with empty records.
            </Trans>
          </p>
        ) : null}
        {target.intent === 'edit-profile' && recordWrites?.length ? (
          <section
            aria-label="Reviewed record values"
            className="max-h-60 min-w-0 overflow-y-auto rounded-md border p-3 text-sm"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll through complete record values.
            tabIndex={0}
          >
            <ul aria-label="Records to write" className="space-y-3">
              {recordWrites.map(({ key, value }) => (
                <li className="min-w-0 space-y-1" key={key}>
                  <code className="block break-all font-medium">{key}</code>
                  <p className="whitespace-pre-wrap break-all text-muted-foreground">
                    {value}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
            disabled={
              target.intent === 'edit-profile' && recordWrites === undefined
            }
            onClick={() => {
              // Confirm before close — edit-profile clears the deferred save
              // when the dialog closes, so reversing this no-ops Replace & Save.
              onConfirm()
              onOpenChange(false)
            }}
            size="lg"
            variant={isDestructive(target) ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
