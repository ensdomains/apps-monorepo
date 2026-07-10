import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DurationPresets } from './DurationPresets'
import { FailureStep } from './FailureStep'
import { NamesBreakdown } from './NamesBreakdown'
import { PaymentMethodSection } from './PaymentMethodSection'
import { RenewingStep } from './RenewingStep'
import { RenewToDatePopover } from './RenewToDatePopover'
import { SuccessStep } from './SuccessStep'
import type { BulkRenewName, Selection } from './types'
import { useBulkRenew } from './useBulkRenew'
import { useBulkRenewSubmit } from './useBulkRenewSubmit'

type Step = 'summary' | 'confirm'

interface BulkRenewDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly names: readonly BulkRenewName[]
}

const dialogTitleClassName =
  'text-left font-normal font-sans text-ens-quartz-900 text-xl tracking-[-0.4px]'

export const BulkRenewDialog = ({
  open,
  onOpenChange,
  names,
}: BulkRenewDialogProps) => {
  const { t } = useLingui()
  const [step, setStep] = useState<Step>('summary')
  const [selection, setSelection] = useState<Selection>({
    kind: 'preset',
    years: 1,
  })
  const [selectedToken, setSelectedToken] = useState<SUPPORTED_TOKEN>('USDC')

  const {
    minSelectableDate,
    grandTotal,
    sumPriceRaw,
    summaryRows,
    renewItems,
    presetSummaries,
    payment,
  } = useBulkRenew({ names, selection, selectedToken, open })

  const submit = useBulkRenewSubmit()

  const count = names.length
  const durationLabel =
    selection.kind === 'preset'
      ? selection.years === 1
        ? t`1 year`
        : t`${selection.years} years`
      : format(new Date(selection.targetMs), 'MMM d, yyyy')

  const isSubmitting =
    submit.phase === 'preparing' ||
    submit.phase === 'authorizing' ||
    submit.phase === 'renewing'

  // Drives both which body renders and the crossfade key.
  const view =
    submit.phase === 'success'
      ? 'success'
      : submit.phase === 'error'
        ? 'error'
        : isSubmitting
          ? 'renewing'
          : step

  const handleOpenChange = (next: boolean) => {
    // Allow closing while renewing (the txs continue), but only reset the flow
    // when it isn't mid-transaction.
    if (!next && !isSubmitting) {
      setStep('summary')
      submit.reset()
    }
    onOpenChange(next)
  }

  const handleConfirm = () =>
    submit.submit({ items: renewItems, token: selectedToken, sumPriceRaw })

  const renderBody = (): ReactNode => {
    if (submit.phase === 'success') {
      return (
        <SuccessStep
          onDone={() => handleOpenChange(false)}
          rows={summaryRows}
          total={grandTotal}
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
          rows={summaryRows}
          statuses={submit.statuses}
          total={grandTotal}
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
            disabled={!payment.canConfirm}
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
            <Trans>Renew {count} names for </Trans>
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

        <NamesBreakdown rows={summaryRows} total={grandTotal} />

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
