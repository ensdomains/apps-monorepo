import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBulkRenew } from '../hooks/useBulkRenew'
import { useBulkRenewSubmit } from '../hooks/useBulkRenewSubmit'
import type { BulkRenewName, Selection, SummaryRow } from '../types'
import {
  type BulkRenewDurationPrefill,
  getBulkRenewDurationPrefill,
  getBulkRenewTargetDateIssue,
  getRequestedTargetDateSelection,
} from '../utils/durationPrefill'
import { DurationPresets } from './DurationPresets'
import { FailureStep } from './FailureStep'
import { NamesBreakdown } from './NamesBreakdown'
import { PaymentMethodSection } from './PaymentMethodSection'
import { RenewingStep } from './RenewingStep'
import { RenewToDatePopover } from './RenewToDatePopover'
import { SuccessStep } from './SuccessStep'

const dialogTitleClassName =
  'text-left font-normal font-sans text-ens-quartz-900 text-xl tracking-[-0.4px]'

type Step = 'summary' | 'confirm'

interface BulkRenewDialogProps extends BulkRenewDurationPrefill {
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
  initialDurationDays,
  initialDurationYears,
  initialTargetDate,
}: BulkRenewDialogProps) => {
  const { t } = useLingui()
  const [step, setStep] = useState<Step>('summary')
  const initialDuration = getBulkRenewDurationPrefill(
    {
      initialDurationDays,
      initialDurationYears,
      initialTargetDate,
    },
    names,
  )
  const [selection, setSelection] = useState<Selection>(() =>
    initialDuration.status === 'ready'
      ? initialDuration.selection
      : (getRequestedTargetDateSelection(initialTargetDate) ?? {
          kind: 'preset',
          years: 1,
        }),
  )
  const [durationError, setDurationError] = useState<string | undefined>(() =>
    initialDuration.status === 'invalid' ? initialDuration.message : undefined,
  )
  const [selectedToken, setSelectedToken] = useState<SUPPORTED_TOKEN>('USDC')
  const effectiveDurationError =
    durationError ??
    (initialTargetDate && selection.kind === 'custom'
      ? getBulkRenewTargetDateIssue(
          format(new Date(selection.targetMs), 'yyyy-MM-dd'),
          names,
        )
      : null)

  const [receipt, setReceipt] = useState<{
    readonly rows: readonly SummaryRow[]
    readonly total: number
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
    open: open && !effectiveDurationError,
  })

  const submit = useBulkRenewSubmit()

  const count = names.length
  const durationLabel = match(selection)
    .with({ kind: 'preset' }, ({ years }) =>
      years === 1 ? t`1 year` : t`${years} years`,
    )
    .with({ kind: 'days' }, ({ days }) => t`${days} days`)
    .with({ kind: 'custom' }, ({ targetMs }) =>
      format(new Date(targetMs), 'MMM d, yyyy'),
    )
    .exhaustive()

  const isSubmitting =
    submit.phase === 'preparing' ||
    submit.phase === 'authorizing' ||
    submit.phase === 'renewing'

  const wasOpen = useRef(false)
  const appliedPrefill = useRef(
    `${initialDurationDays ?? ''}:${initialDurationYears ?? ''}:${initialTargetDate ?? ''}`,
  )
  useEffect(() => {
    const justOpened = open && !wasOpen.current
    wasOpen.current = open
    const key = `${initialDurationDays ?? ''}:${initialDurationYears ?? ''}:${initialTargetDate ?? ''}`
    const previousKey = appliedPrefill.current
    if (!open || isSubmitting || (!justOpened && key === previousKey)) return
    appliedPrefill.current = key
    // An in-flight renewal keeps its selection. A new reviewed prompt gets
    // its explicit prefill even when the dialog stayed mounted after closing.
    if (key === '::' && previousKey === '::') return
    const prefill = getBulkRenewDurationPrefill(
      {
        initialDurationDays,
        initialDurationYears,
        initialTargetDate,
      },
      names,
    )
    setStep('summary')
    if (prefill.status === 'invalid') {
      const requestedDate = getRequestedTargetDateSelection(initialTargetDate)
      if (requestedDate) setSelection(requestedDate)
      setDurationError(prefill.message)
    } else {
      setSelection(prefill.selection)
      setDurationError(undefined)
    }
  }, [
    initialDurationDays,
    initialDurationYears,
    initialTargetDate,
    names,
    isSubmitting,
    open,
  ])

  const chooseDuration = (next: Selection) => {
    setSelection(next)
    setDurationError(undefined)
  }

  const chooseDate = (date: Date) => {
    const target = new Date(date)
    if (initialTargetDate) target.setHours(23, 59, 59, 0)
    chooseDuration({
      kind: 'custom',
      targetMs: target.getTime(),
      ...(initialTargetDate && { exactTarget: true }),
    })
  }

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
      submit.reset()
    }
    onOpenChange(next)
  }

  const handleConfirm = () => {
    if (effectiveDurationError) return
    setReceipt({ rows: summaryRows, total: grandTotal })
    submit.submit({ items: renewItems, token: selectedToken, sumPriceRaw })
  }

  const receiptSummary = receipt ?? { rows: summaryRows, total: grandTotal }

  // No smart-account gate: bulk renewal takes the direct-wallet route (the
  // registrar charges `msg.sender`, and the scoped HCA session does not
  // allowlist `renew`), so it works wherever a wallet is connected — including
  // the EOA fork. Each name is its own transaction rather than one atomic batch.
  const renderBody = (): ReactNode => {
    if (submit.phase === 'success') {
      return (
        <SuccessStep
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
          rows={receiptSummary.rows}
          statuses={submit.statuses}
          total={receiptSummary.total}
        />
      )
    }
    if (effectiveDurationError) {
      return (
        <>
          <DialogHeader>
            <DialogTitle className={dialogTitleClassName}>
              <Trans>Review requested renewal</Trans>
            </DialogTitle>
          </DialogHeader>
          {initialTargetDate && (
            <p className="text-ens-quartz-900 text-sm">
              <Trans>
                Requested expiry date:{' '}
                {selection.kind === 'custom'
                  ? format(new Date(selection.targetMs), 'MMM d, yyyy')
                  : initialTargetDate}{' '}
                (end of your local day)
              </Trans>
            </p>
          )}
          <p className="text-destructive text-sm" role="alert">
            {effectiveDurationError}
          </p>
          {initialTargetDate && (
            <div className="flex justify-end">
              <RenewToDatePopover
                minSelectableDate={minSelectableDate}
                onPickDate={chooseDate}
                selection={selection}
              />
            </div>
          )}
          <Button onClick={() => handleOpenChange(false)} type="button">
            <Trans>Close</Trans>
          </Button>
        </>
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

          <NamesBreakdown rows={summaryRows} total={grandTotal} />

          <PaymentMethodSection
            isConnected={payment.isConnected}
            isLoadingBalances={payment.isLoadingBalances}
            onSelectCoin={setSelectedToken}
            priceUSD={grandTotal}
            selectedToken={selectedToken}
            stablecoinBalances={payment.stablecoinBalances}
          />

          <Button
            className="w-full uppercase"
            disabled={!payment.canConfirm || Boolean(effectiveDurationError)}
            onClick={handleConfirm}
            size="lg"
            type="button"
          >
            <Trans>Confirm</Trans>
          </Button>
        </>
      )
    }
    return (
      <>
        <DialogHeader>
          <DialogTitle className={dialogTitleClassName}>
            {selection.kind === 'custom' ? (
              <Plural
                one="Renew # name to"
                other="Renew # names to"
                value={count}
              />
            ) : (
              <Plural
                one="Renew # name for"
                other="Renew # names for"
                value={count}
              />
            )}{' '}
            <span className="text-ens-lapis-core">{durationLabel}</span>
          </DialogTitle>
        </DialogHeader>

        <DurationPresets
          onSelectPreset={(years) => chooseDuration({ kind: 'preset', years })}
          presetSummaries={presetSummaries}
          selection={selection}
        />

        <div className="flex justify-end">
          <RenewToDatePopover
            minSelectableDate={minSelectableDate}
            onPickDate={chooseDate}
            selection={selection}
          />
        </div>

        <NamesBreakdown rows={summaryRows} total={grandTotal} />

        <Button
          className="w-full uppercase"
          disabled={Boolean(effectiveDurationError)}
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
  )
}
