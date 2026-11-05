import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { match } from 'ts-pattern'
import { HcaFundingApprovalDialog } from '@/components/HcaFundingApprovalDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  FundingSourceOrigin,
  PaymentAsset,
} from '@/features/register-v2/state/registrationUi.machine'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { useBulkRenew } from '../hooks/useBulkRenew'
import { useBulkRenewSubmit } from '../hooks/useBulkRenewSubmit'
import type { BulkRenewName, Selection, SummaryRow } from '../types'
import { BulkNamesHeading } from './BulkNamesHeading'
import { BulkRenewPaymentStep } from './BulkRenewPaymentStep'
import { DurationPresets } from './DurationPresets'
import { FailureStep } from './FailureStep'
import { NamesBreakdown } from './NamesBreakdown'
import { RenewingStep } from './RenewingStep'
import { RenewToDatePopover } from './RenewToDatePopover'
import { SuccessStep } from './SuccessStep'

const dialogTitleClassName =
  'text-left font-normal font-sans text-ens-quartz-900 text-xl tracking-[-0.4px]'

type Step = 'summary' | 'confirm'

interface BulkRenewDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly names: readonly BulkRenewName[]
  /** Called once the batch has successfully renewed (e.g. to clear selection). */
  readonly onRenewed?: () => void
}

export const BulkRenewDialog = ({
  open,
  onOpenChange,
  names,
  onRenewed,
}: BulkRenewDialogProps) => {
  const { t } = useLingui()
  const [step, setStep] = useState<Step>('summary')
  const [selection, setSelection] = useState<Selection>({
    kind: 'preset',
    years: 1,
  })
  const [selectedToken, setSelectedToken] = useState<RENEWAL_TOKEN>('USDC')
  // The L2 row paying instead of the wallet's coin; a coin pick clears it.
  const [fundingSourceChainId, setFundingSourceChainId] = useState<
    number | undefined
  >()
  // Who picked the method: the fallback's pick gives way when it no longer pays.
  const [fundingSourceOrigin, setFundingSourceOrigin] =
    useState<FundingSourceOrigin>()
  const [paymentAsset, setPaymentAsset] = useState<PaymentAsset>('stablecoin')
  const selectCoin = (coin: RENEWAL_TOKEN, origin?: FundingSourceOrigin) => {
    setSelectedToken(coin)
    setFundingSourceChainId(undefined)
    setFundingSourceOrigin(origin ?? 'user')
    setPaymentAsset('stablecoin')
  }
  // Swapped into USDC, so the price is paid in USDC.
  const selectEth = (origin?: FundingSourceOrigin) => {
    setSelectedToken('USDC')
    setFundingSourceChainId(undefined)
    setFundingSourceOrigin(origin ?? 'user')
    setPaymentAsset('eth')
  }
  // Bridged in as USDC, so the price is paid in USDC.
  const selectL2 = (chainId: number, origin?: FundingSourceOrigin) => {
    setSelectedToken('USDC')
    setFundingSourceChainId(chainId)
    setFundingSourceOrigin(origin ?? 'user')
    setPaymentAsset('stablecoin')
  }

  const [receipt, setReceipt] = useState<{
    readonly rows: readonly SummaryRow[]
    readonly total: number | undefined
    readonly existingBalance: number
  } | null>(null)

  const {
    minSelectableDate,
    grandTotal,
    sumPriceRaw,
    summaryRows,
    renewItems,
    presetSummaries,
    payment,
  } = useBulkRenew({
    names,
    selection,
    selectedToken,
    open,
    isPaying: step === 'confirm',
    fundingSourceChainId,
    fundingSourceOrigin,
    onSelectL2: selectL2,
    isEthSelected: paymentAsset === 'eth',
    onSelectEth: selectEth,
  })

  const submit = useBulkRenewSubmit()

  const count = names.length
  const durationLabel = match(selection)
    .with({ kind: 'preset' }, ({ years }) =>
      years === 1 ? t`1 year` : t`${years} years`,
    )
    .with({ kind: 'custom' }, ({ targetMs }) =>
      format(new Date(targetMs), 'MMM d, yyyy'),
    )
    .exhaustive()

  const isSubmitting =
    submit.phase === 'preparing' ||
    submit.phase === 'authorizing' ||
    submit.phase === 'renewing'

  // Drives both which body renders and the crossfade key.
  const view = match(submit.phase)
    .with('success', () => 'success' as const)
    .with('error', () => 'error' as const)
    .with('preparing', 'authorizing', 'renewing', () => 'renewing' as const)
    .otherwise(() => step)

  // Reset on close, not open: a run closed mid-flight resumes (or shows its
  // outcome) when reopened.
  const handleOpenChange = (next: boolean) => {
    if (!next && !isSubmitting) {
      setStep('summary')
      setReceipt(null)
      setFundingSourceChainId(undefined)
      setFundingSourceOrigin(undefined)
      setPaymentAsset('stablecoin')
      submit.reset()
    }
    onOpenChange(next)
  }

  const { selectedL2, ethPayment, intentFunding } = payment
  const handleConfirm = () => {
    // Refused rather than paid from the wallet's USDC instead.
    if (ethPayment?.isSelected && !ethPayment.funding) return
    setReceipt({
      rows: summaryRows,
      total: payment.listTotal,
      existingBalance: payment.appliedBalance,
    })
    submit.submit({
      items: renewItems,
      token: selectedToken,
      sumPriceRaw,
      // Each batch is checked against this, so the wallet opens on the amount shown here.
      ...(intentFunding.displayedDebit
        ? { displayedDebit: intentFunding.displayedDebit }
        : {}),
      // Paid from an L2, each intent's shortfall is bridged in from there,
      // bounded by the charge this screen showed.
      ...(selectedL2
        ? {
            l2Payment: {
              chainId: selectedL2.option.source.chain.id,
              displayedCharge: selectedL2.amountInRaw,
            },
          }
        : {}),
      // Paid with ETH, one swap buys the remaining chunks' USDC, bounded by the ETH shown.
      ...(ethPayment?.isSelected && ethPayment.funding
        ? {
            ethPayment: { displayedCharge: ethPayment.funding.displayedCharge },
          }
        : {}),
    })
  }

  const receiptSummary = receipt ?? {
    rows: summaryRows,
    total: payment.listTotal,
    existingBalance: payment.appliedBalance,
  }

  // The route depends on the account: a smart account renews as owner-signed
  // intents paid from the account (chunked, one `renewBatch` per intent), and a plain
  // EOA keeps the direct-wallet route — one transaction per name. Either way
  // this is never gated on the scoped HCA session, whose policy allowlists only
  // `commit`/`register`.
  const renderBody = (): ReactNode => {
    if (submit.phase === 'success') {
      return (
        <SuccessStep
          existingBalance={receiptSummary.existingBalance}
          onDone={() => {
            onRenewed?.()
            handleOpenChange(false)
          }}
          rows={receiptSummary.rows}
          total={receiptSummary.total}
        />
      )
    }
    if (submit.phase === 'error') {
      return (
        <FailureStep
          errorMessage={submit.errorMessage}
          onBack={submit.reset}
          onRetry={handleConfirm}
        />
      )
    }
    if (isSubmitting) {
      return (
        <RenewingStep
          existingBalance={receiptSummary.existingBalance}
          rows={receiptSummary.rows}
          statuses={submit.statuses}
          total={receiptSummary.total}
        />
      )
    }
    if (step === 'confirm') {
      return (
        <>
          <DialogHeader>
            <DialogTitle className={dialogTitleClassName}>
              <Trans>Confirm renewal</Trans>
            </DialogTitle>
          </DialogHeader>

          <BulkRenewPaymentStep
            grandTotal={grandTotal}
            header={
              <BulkNamesHeading count={count} durationLabel={durationLabel} />
            }
            onConfirm={handleConfirm}
            onSelectCoin={selectCoin}
            payment={payment}
            selectedToken={selectedToken}
          />
        </>
      )
    }
    return (
      <>
        <DialogHeader>
          <DialogTitle className={dialogTitleClassName}>
            <Plural
              one="Renew # name for"
              other="Renew # names for"
              value={count}
            />{' '}
            <span className="text-ens-lapis-core">{durationLabel}</span>
          </DialogTitle>
        </DialogHeader>

        <DurationPresets
          onSelectPreset={(years) => setSelection({ kind: 'preset', years })}
          presetSummaries={presetSummaries}
          selection={selection}
        />

        <div className="flex justify-end">
          <RenewToDatePopover
            minSelectableDate={minSelectableDate}
            onPickDate={(date) =>
              setSelection({ kind: 'custom', targetMs: date.getTime() })
            }
            selection={selection}
          />
        </div>

        <NamesBreakdown
          existingBalance={payment.appliedBalance}
          rows={summaryRows}
          total={payment.listTotal}
        />

        <Button
          className="w-full uppercase"
          onClick={() => setStep('confirm')}
          size="lg"
          type="button"
          variant="lightBlue"
        >
          <Trans>Next</Trans>
        </Button>
      </>
    )
  }

  return (
    <>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent
          className="flex max-h-[90vh] flex-col overflow-hidden px-6 py-4 sm:max-w-[588px] sm:px-11 sm:py-8"
          showCloseButton
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={{ opacity: 1 }}
              className="flex min-h-0 flex-col gap-5"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={view}
              transition={{ duration: 0.2 }}
            >
              {renderBody()}
            </motion.div>
          </AnimatePresence>
        </DialogContent>
      </Dialog>
      <HcaFundingApprovalDialog
        onApprove={submit.approveFunding}
        onDecline={submit.declineFunding}
        state={submit.approvalState}
      />
    </>
  )
}
