import { scopeTransactionId } from '@ens-apps/transaction-manager'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatExpiry } from '@/features/names/components/NameExpiry'
import { ExtensionDurationOrExpiryPicker } from '@/features/renew/components/ExtensionDurationOrExpiryPicker'
import type { ExtensionSpan } from '@/features/renew/utils/extensionDurationPicker'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { ResourceId } from '@/lib/resource/resourceId'
import { useExtendSubnameExpiryMutation } from '../hooks/useExtendSubnameExpiryMutation'
import { prepareExtendSubnameExpiryTransaction } from '../utils/extend-subname-expiry.helpers'
import { getExtendedExpirySeconds } from '../utils/subnameExpiry'

const CHANGE_EXPIRATION_TRANSACTION_ID = 'tx-change-subname-expiration'

type ChangeSubnameExpiryProps = {
  /** The parent name, whose subnames refresh once the change lands */
  readonly parentName: string
  readonly registryAddress: Address
  readonly subname: {
    readonly name: string
    readonly resourceId: ResourceId
    readonly expiryDate: Date
  }
  readonly onClose: () => void
}

/** "Change expiration" for one subname: pick a later date, then sign its `renew`. */
export const ChangeSubnameExpiry = ({
  parentName,
  registryAddress,
  subname,
  onClose,
}: ChangeSubnameExpiryProps) => {
  const { address: connectedAccount } = useConnection()
  const [span, setSpan] = useState<ExtensionSpan>({ type: 'years', years: 1 })
  // Frozen on Save, so the estimate, the shown date and the send all match.
  const [expires, setExpires] = useState<bigint | null>(null)
  const {
    isOpen: isTransactionModalOpen,
    closeModal,
    clearTransaction,
  } = useTransactionModal()
  const attempt = useFlowAttempt()
  const txId = scopeTransactionId(
    CHANGE_EXPIRATION_TRANSACTION_ID,
    attempt.scope,
  )
  const { mutateAsync: extendExpiry } = useExtendSubnameExpiryMutation({
    name: parentName,
    registryAddress,
  })

  // Closing the transaction modal before it finishes ends the change.
  useEffect(() => {
    if (expires !== null && !isTransactionModalOpen) onClose()
  }, [expires, isTransactionModalOpen, onClose])

  if (expires === null)
    return (
      <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change expiration</DialogTitle>
            <DialogDescription>
              {subname.name}’s own expiration is{' '}
              {formatExpiry(subname.expiryDate)}. It can only move later.
            </DialogDescription>
          </DialogHeader>
          <ExtensionDurationOrExpiryPicker
            span={span}
            setSpan={setSpan}
            expiryDate={subname.expiryDate}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!connectedAccount}
              onClick={() => {
                if (!connectedAccount) return
                setExpires(getExtendedExpirySeconds(subname.expiryDate, span))
                attempt.start(connectedAccount)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

  return (
    <TransactionModal
      transactions={[
        {
          id: txId,
          title: 'Change expiration',
          transactionName: `Change the expiration of ${subname.name}`,
          details: [
            {
              label: 'New expiration',
              value: formatExpiry(new Date(Number(expires) * 1000)),
            },
          ],
          intent: {
            prepare: ({ walletClient, chainId }) =>
              prepareExtendSubnameExpiryTransaction({
                registryAddress,
                resourceId: subname.resourceId,
                expires,
                walletClient,
                chainId,
                subname: subname.name,
              }),
          },
          onStart: () => {
            void extendExpiry({
              subname: subname.name,
              resourceId: subname.resourceId,
              expires,
              id: txId,
            })
          },
          onDone: () => {
            closeModal()
            clearTransaction()
            attempt.end()
            onClose()
          },
        },
      ]}
    />
  )
}
