import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans, useLingui } from '@lingui/react/macro'
import { format } from 'date-fns'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DurationPresets } from './DurationPresets'
import { NamesBreakdown } from './NamesBreakdown'
import { PaymentMethodSection } from './PaymentMethodSection'
import { RenewToDatePopover } from './RenewToDatePopover'
import type { BulkRenewName, Selection } from './types'
import { useBulkRenew } from './useBulkRenew'

type Step = 'summary' | 'confirm'

interface BulkRenewDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly names: readonly BulkRenewName[]
}

const dialogTitleClassName =
  'text-left font-sans text-ens-quartz-900 text-xl tracking-[-0.4px] font-normal'

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
    summaryRows,
    presetSummaries,
    payment,
  } = useBulkRenew({ names, selection, selectedToken, open })

  const count = names.length
  const durationLabel =
    selection.kind === 'preset'
      ? selection.years === 1
        ? t`1 year`
        : t`${selection.years} years`
      : format(new Date(selection.targetMs), 'MMM d, yyyy')

  const handleOpenChange = (next: boolean) => {
    if (!next) setStep('summary')
    onOpenChange(next)
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-5 overflow-hidden px-6 py-4 sm:max-w-[588px] sm:px-11 sm:py-8"
        showCloseButton
      >
        {step === 'summary' ? (
          <>
            <DialogHeader>
              <DialogTitle className={dialogTitleClassName}>
                <Trans>Renew {count} names for </Trans>
                <span className="text-ens-lapis-core">{durationLabel}</span>
              </DialogTitle>
            </DialogHeader>

            <DurationPresets
              onSelectPreset={(years) =>
                setSelection({ kind: 'preset', years })
              }
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
        ) : (
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
              size="lg"
              type="button"
            >
              <Trans>Confirm</Trans>
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
