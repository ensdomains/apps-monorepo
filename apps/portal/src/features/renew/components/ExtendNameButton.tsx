import { transactionManager } from '@ens-apps/transaction-manager'
import { FastForward } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { chain } from '@/config'
import { usePageCommands } from '@/features/command-palette/usePageCommands'
import { usePaletteHandoff } from '@/features/command-palette/usePaletteHandoff'
import { ExtendNameModal } from '@/features/renew/components/ExtendNameModal'
import { useCanExtend } from '@/features/renew/hooks/useCanExtend'
import { useRenewalTransactions } from '@/features/renew/hooks/useRenewalTransactions'
import { getRenewalPaletteState } from '@/features/renew/utils/paletteHandoff'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import {
  isTransactionInFlight,
  useActiveTransactionState,
} from '@/features/transaction-manager/hooks/useActiveTransactionState'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { ProtocolVersion } from '@/utils/types'

type ExtendNameButtonProps = {
  name: string
  protocolVersion: ProtocolVersion
}

// V1 names use "Renew", the manager app's word for this action.
const ACTION_LABELS = {
  ENSv1: 'Renew',
  ENSv2: 'Extend',
} as const satisfies Record<ProtocolVersion, string>

/**
 * Extend/renew entry point on the name page. v1 and v2 names share the same
 * ERC-20 renewal flow (approve + `renew(label,duration,token,referrer)`); they
 * differ only in the renewer contract (v2 `ETHRegistrar` vs `ETHRenewerV1` for
 * unmigrated v1 names) and where the current expiry is read from. The renewer is
 * resolved from `isV2` inside the flow.
 */
export const ExtendNameButton = ({
  name,
  protocolVersion,
}: ExtendNameButtonProps) => {
  const [open, setOpen] = useState(false)

  const { canExtend, selectedName, isChecking, hasCheckError } = useCanExtend({
    name,
    protocolVersion,
  })
  const { address } = useConnection()

  const { transactions, startFlow, clearIncompatibleRenewalState, openModal } =
    useRenewalTransactions({
      onComplete: () => {
        setOpen(false)
      },
    })

  const activeTxState = useActiveTransactionState()
  const { isOpen: isTransactionModalOpen } = useTransactionModal()
  const paletteState = getRenewalPaletteState({
    name,
    isChecking,
    canExtend,
    hasCheckError,
    isOperationInFlight: isTransactionInFlight(activeTxState),
    activeTransactionId: activeTxState?.txId,
    transactionIds: transactions.map((transaction) => transaction.id),
  })
  const pageCommands = useMemo(
    () =>
      paletteState.canViewActiveOperation
        ? [
            {
              id: 'renewal.view-active-operation',
              title: 'View active operation',
              description:
                'Open the existing renewal progress shown by this page.',
              keywords: ['active', 'pending', 'transaction', 'progress'],
              onSelect: openModal,
            },
          ]
        : [],
    [paletteState.canViewActiveOperation, openModal],
  )
  usePageCommands(pageCommands)

  const openRenewal = () => {
    if (isTransactionInFlight(activeTxState)) {
      openModal()
      return
    }
    // A terminal attempt is stale; the existing flow owns its cleanup.
    if (activeTxState) transactionManager.cancelTransaction(activeTxState.txId)
    clearIncompatibleRenewalState('single')
    setOpen(true)
  }

  usePaletteHandoff({
    kind: 'renew',
    name,
    chainId: chain.id,
    account: address,
    readiness: paletteState.readiness,
    onOpen: openRenewal,
  })

  if (!canExtend) return null

  return (
    <>
      <Button variant="default" onClick={openRenewal}>
        <FastForward className="size-4" />
        {ACTION_LABELS[protocolVersion]}
      </Button>
      <ExtendNameModal
        open={open && !isTransactionModalOpen}
        onClose={() => {
          setOpen(false)
        }}
        selectedName={selectedName}
        onExtend={(config) => {
          // `startFlow` names the attempt; it also opens the modal, since the
          // step ids it builds are scoped to that attempt.
          startFlow(selectedName, config)
        }}
      />
      <TransactionModal transactions={transactions} />
    </>
  )
}
