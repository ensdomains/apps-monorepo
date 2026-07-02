import { transactionManager } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { FastForward } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import { ExtendNameModal } from '@/features/renew/components/ExtendNameModal'
import { V1ExtendModal } from '@/features/renew/components/V1ExtendModal'
import { useRenewalTransactions } from '@/features/renew/hooks/useRenewalTransactions'
import { useV1RenewalTransactions } from '@/features/renew/hooks/useV1RenewalTransactions'
import { isExtendable2LD } from '@/features/renew/utils/nameExtension'
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

/**
 * Extend/renew entry point on the name page. ENSv1 and ENSv2 names use entirely
 * different renewal mechanics (legacy ETH `renew` vs. ENSv2 ERC-20 `renew`), so
 * each protocol has its own self-contained button + modal below.
 */
export const ExtendNameButton = ({
  name,
  protocolVersion,
}: ExtendNameButtonProps) =>
  protocolVersion === 'ENSv1' ? (
    <V1ExtendButton name={name} />
  ) : (
    <V2ExtendButton name={name} />
  )

/** Opens the tx modal for an in-flight tx, else clears stale terminal state. */
const useOpenExtendFlow = () => {
  const activeTxState = useActiveTransactionState()
  const { isOpen: isTransactionModalOpen, openModal } = useTransactionModal()

  const beginFlow = (openSettings: () => void) => {
    if (isTransactionInFlight(activeTxState)) {
      openModal()
      return
    }
    // Stale terminal-state transactions (success/error) block the modal;
    // remove only that entry so a fresh extend flow can start without
    // touching any other in-flight transactions in the manager.
    if (activeTxState) {
      transactionManager.cancelTransaction(activeTxState.txId)
    }
    openSettings()
  }

  return { beginFlow, isTransactionModalOpen, openModal }
}

const V1ExtendButton = ({ name }: { name: string }) => {
  const [open, setOpen] = useState(false)

  const { data: v1Expiry } = useQuery(getV1ExpiryQueryOptions({ name }))
  const expiryDate = v1Expiry?.expiry
    ? new Date(Number(v1Expiry.expiry) * 1000)
    : undefined

  const { transactions, startFlow } = useV1RenewalTransactions({
    onComplete: () => setOpen(false),
  })

  const { beginFlow, isTransactionModalOpen, openModal } = useOpenExtendFlow()

  if (!isExtendable2LD({ name, isV2: false, expiryDate })) return null

  return (
    <>
      <Button variant="default" onClick={() => beginFlow(() => setOpen(true))}>
        <FastForward className="size-4" />
        Extend
      </Button>
      <V1ExtendModal
        open={open && !isTransactionModalOpen}
        onClose={() => setOpen(false)}
        name={name}
        expiryDate={expiryDate}
        onExtend={(config) => {
          startFlow(name, config)
          openModal()
        }}
      />
      <TransactionModal transactions={transactions} />
    </>
  )
}

const V2ExtendButton = ({ name }: { name: string }) => {
  const [open, setOpen] = useState(false)

  const { data: v2Data } = useQuery(getV2RegistrationDataQueryOptions({ name }))
  const expirySeconds = v2Data?.expiry ?? null
  const expiryDate =
    expirySeconds !== null ? new Date(expirySeconds * 1000) : undefined

  const selectedName = { name, isV2: true, expiryDate }

  const { transactions, startFlow, clearIncompatibleRenewalState } =
    useRenewalTransactions({
      onComplete: () => setOpen(false),
    })

  const { beginFlow, isTransactionModalOpen, openModal } = useOpenExtendFlow()

  if (!isExtendable2LD(selectedName)) return null

  return (
    <>
      <Button
        variant="default"
        onClick={() =>
          beginFlow(() => {
            clearIncompatibleRenewalState('single')
            setOpen(true)
          })
        }
      >
        <FastForward className="size-4" />
        Extend
      </Button>
      <ExtendNameModal
        open={open && !isTransactionModalOpen}
        onClose={() => setOpen(false)}
        selectedName={selectedName}
        onExtend={(config) => {
          startFlow(selectedName, config)
          openModal()
        }}
      />
      <TransactionModal transactions={transactions} />
    </>
  )
}
