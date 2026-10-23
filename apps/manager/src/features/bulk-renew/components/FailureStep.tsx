import { Trans } from '@lingui/react/macro'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'

const dialogTitleClassName =
  'text-left font-normal font-sans text-ens-quartz-900 text-xl tracking-[-0.4px]'

/** Terminal failure view: error banner + retry / back-to-confirm actions. */
export const FailureStep = ({
  errorMessage,
  onRetry,
  onBack,
}: {
  readonly errorMessage: string | undefined
  readonly onRetry: () => void
  readonly onBack: () => void
}) => (
  <>
    <DialogHeader>
      <DialogTitle className={dialogTitleClassName}>
        <Trans>Renewal failed</Trans>
      </DialogTitle>
    </DialogHeader>

    <Alert className="font-sans" variant="error">
      <AlertTitle>
        <Trans>Something went wrong</Trans>
      </AlertTitle>
      <AlertDescription className="max-h-32 overflow-y-auto">
        {errorMessage ?? <Trans>The renewal could not be completed.</Trans>}
      </AlertDescription>
    </Alert>

    <div className="flex gap-3">
      <Button
        className="flex-1 uppercase"
        onClick={onBack}
        size="lg"
        type="button"
        variant="lightBlue"
      >
        <Trans>Back</Trans>
      </Button>
      <Button
        className="flex-1 uppercase"
        onClick={onRetry}
        size="lg"
        type="button"
        variant="blue"
      >
        <Trans>Try again</Trans>
      </Button>
    </div>
  </>
)
