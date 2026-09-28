import type { V1Domain } from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { Loader2 } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RenewalUiProvider,
  useRenewalUiContext,
} from '@/features/renew/state/renewalUi.context'
import { ConfirmPurchase } from '@/features/renew/workflow/pricing/components/ConfirmPurchase'
import { PricingSummaryCard } from '@/features/renew/workflow/pricing/components/PricingSummaryCard'
import { TokenPickerContent } from '@/features/renew/workflow/pricing/components/TokenPickerContent'
import { useV1NameClassificationTime } from '../hooks/useV1NameClassificationTime'
import {
  getGracePeriodRenewalQuote,
  getGraceRenewalDuration,
} from '../service/gracePeriodRenewal'
import { GracePeriodRenewalSuccess } from './GracePeriodRenewalSuccess'

type GracePeriodRenewalDialogProps = {
  readonly domain: V1Domain
  readonly onClose: () => void
}

const RenewalDialogFrame = ({
  name,
  onClose,
  isRenewing = false,
  children,
}: {
  readonly name: string
  readonly onClose: () => void
  readonly isRenewing?: boolean
  readonly children: ReactNode
}) => (
  <Dialog onOpenChange={(open) => !open && !isRenewing && onClose()} open>
    <DialogContent
      className="overflow-y-auto sm:max-w-xl"
      showCloseButton={!isRenewing}
    >
      <DialogHeader>
        <DialogTitle className="break-all pr-6">
          <Trans>Renew {name}</Trans>
        </DialogTitle>
        <DialogDescription>
          <Trans>
            Renew for the time spent in grace plus one week, then upgrade your
            name. You can renew for longer after upgrading.
          </Trans>
        </DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
)

const GracePeriodRenewalFlow = ({
  domain,
  onClose,
}: GracePeriodRenewalDialogProps) => {
  const { t } = useLingui()
  const { uiActor, currentExpiry } = useRenewalUiContext()
  const state = useSelector(uiActor, (snapshot) => snapshot)
  const isRenewing = state.hasTag('renewing')
  const quotedDomains = useMemo(
    () => [
      { ...domain, registration: { expiryDate: currentExpiry.toString() } },
    ],
    [domain, currentExpiry],
  )
  const nowSeconds = useV1NameClassificationTime(
    quotedDomains,
    state.matches('pricing'),
    currentExpiry + state.context.duration,
  )
  const isOutsideGrace =
    getGraceRenewalDuration(currentExpiry, nowSeconds) === null

  useBlocker({
    shouldBlockFn: () =>
      isRenewing &&
      !confirm(
        t`Your renewal is in progress. Leaving may interrupt it. Are you sure you want to leave?`,
      ),
    enableBeforeUnload: isRenewing,
  })

  const body = (): ReactNode => {
    if (state.matches('success')) {
      return (
        <GracePeriodRenewalSuccess
          domain={domain}
          minimumExpiry={currentExpiry + state.context.duration}
          onClose={onClose}
          transactionId={state.context.renewalTxId}
        />
      )
    }
    if (state.matches('failure')) {
      return (
        <div className="flex flex-col gap-4">
          <p className="break-words text-destructive" role="alert">
            <Trans>Renewal Failed</Trans>: {state.context.lastErrorMessage}
          </p>
          <Button
            onClick={() => uiActor.send({ type: 'cancel' })}
            type="button"
          >
            <Trans>Back to Quote</Trans>
          </Button>
        </div>
      )
    }
    if (isRenewing) {
      return (
        <div
          className="flex items-center justify-center gap-3 py-8"
          role="status"
        >
          <Loader2
            aria-hidden
            className="size-5 animate-spin motion-reduce:animate-none"
          />
          <Trans>
            Complete the renewal in your wallet. Keep this window open until it
            finishes.
          </Trans>
        </div>
      )
    }
    if (isOutsideGrace) {
      return (
        <p role="alert">
          <Trans>
            This name's grace period has ended. It can no longer be renewed for
            upgrade.
          </Trans>
        </p>
      )
    }
    if (nowSeconds >= currentExpiry + state.context.duration) {
      return (
        <p role="alert">
          <Trans>
            This renewal quote has expired. Close this dialog and renew again
            for a fresh quote.
          </Trans>
        </p>
      )
    }
    if (state.matches({ pricing: 'tokens' })) return <TokenPickerContent />
    if (state.matches({ pricing: 'confirm' })) return <ConfirmPurchase />
    return (
      <div className="flex flex-col gap-4">
        <PricingSummaryCard />
        <Button
          onClick={() => uiActor.send({ type: 'pricing.step.next' })}
          type="button"
          variant="blue"
        >
          <Trans>Review renewal</Trans>
        </Button>
      </div>
    )
  }

  return (
    <RenewalDialogFrame
      isRenewing={isRenewing}
      name={domain.name}
      onClose={onClose}
    >
      {body()}
      {state.matches({ pricing: 'tokens' }) ||
      state.matches({ pricing: 'confirm' }) ? (
        <Button
          onClick={() => uiActor.send({ type: 'pricing.step.previous' })}
          type="button"
          variant="ghost"
        >
          <Trans>Back</Trans>
        </Button>
      ) : null}
    </RenewalDialogFrame>
  )
}

export const GracePeriodRenewalDialog = ({
  domain,
  onClose,
}: GracePeriodRenewalDialogProps) => {
  // The quote stays fixed while reviewing/signing. A new dialog gets fresh
  // on-chain expiry and renewability reads, including after an external renewal.
  const quote = useQuery({
    ...resultQueryOptions({
      queryKey: qk('migration', 'grace_renewal_quote', {
        renewalName: domain.name,
      }),
      queryFn: () => getGracePeriodRenewalQuote(domain.name),
    }),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })

  if (!quote.data) {
    return (
      <RenewalDialogFrame name={domain.name} onClose={onClose}>
        {quote.isError ? (
          <>
            <p role="alert">
              <Trans>
                We couldn't confirm this name can be renewed in grace. Refresh
                and try again.
              </Trans>
            </p>
            <Button onClick={() => quote.refetch()} type="button">
              <Trans>Try Again</Trans>
            </Button>
          </>
        ) : (
          <p role="status">
            <Trans>Checking renewal...</Trans>
          </p>
        )}
      </RenewalDialogFrame>
    )
  }

  return (
    <RenewalUiProvider
      currentExpiry={quote.data.currentExpiry}
      initialDuration={quote.data.duration}
      label={domain.name.slice(0, -4)}
      protocol="v1"
    >
      <GracePeriodRenewalFlow domain={domain} onClose={onClose} />
    </RenewalUiProvider>
  )
}
