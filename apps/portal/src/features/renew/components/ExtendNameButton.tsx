import { transactionManager } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { FastForward } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import { ExtendNameModal } from '@/features/renew/components/ExtendNameModal'
import { useIsRenewable } from '@/features/renew/hooks/useIsRenewable'
import { useRenewalTransactions } from '@/features/renew/hooks/useRenewalTransactions'
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
  const isV2 = protocolVersion === 'ENSv2'

  const v1ExpiryQuery = useQuery({
    ...getV1ExpiryQueryOptions({ name }),
    enabled: protocolVersion === 'ENSv1',
  })
  const v2DataQuery = useQuery({
    ...getV2RegistrationDataQueryOptions({ name }),
    enabled: isV2,
  })

  const expirySeconds = isV2
    ? (v2DataQuery.data?.expiry ?? null)
    : v1ExpiryQuery.data?.expiry
      ? Number(v1ExpiryQuery.data.expiry)
      : null
  const expiryDate =
    expirySeconds !== null ? new Date(expirySeconds * 1000) : undefined

  const selectedName = { name, isV2, expiryDate }

  // v1 names renew via ETHRenewerV1, which only renews RESERVED (premigrated) or
  // in-grace names. Gate on its on-chain `isRenewable` so we don't offer Extend
  // (and then fail to load the price) for active/not-yet-migrated v1 names. v2
  // keeps the cheaper client-side `isExtendable2LD` gate.
  const { data: v1Renewable } = useIsRenewable({
    name,
    isV2,
    enabled: !isV2,
  })

  const { transactions, startFlow, clearIncompatibleRenewalState } =
    useRenewalTransactions({
      onComplete: () => {
        setOpen(false)
      },
    })

  const activeTxState = useActiveTransactionState()
  const { isOpen: isTransactionModalOpen, openModal } = useTransactionModal()

  if (!isExtendable2LD(selectedName)) return null
  // For v1, wait for and require on-chain renewability (hides while loading).
  if (!isV2 && !v1Renewable) return null

  return (
    <>
      <Button
        variant="default"
        onClick={() => {
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
          clearIncompatibleRenewalState('single')
          setOpen(true)
        }}
      >
        <FastForward className="size-4" />
        Extend
      </Button>
      <ExtendNameModal
        open={open && !isTransactionModalOpen}
        onClose={() => {
          setOpen(false)
        }}
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
