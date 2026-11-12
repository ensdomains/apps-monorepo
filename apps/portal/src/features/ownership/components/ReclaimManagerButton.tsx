import {
  scopeTransactionId,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ShieldPersonIcon } from '@/assets/icons'
import { Button } from '@/components/ui/button'
import {
  prepareChangeManagerTransaction,
  useChangeManagerMutation,
  type V1ManagerChange,
} from '@/features/ownership/hooks/useChangeManagerMutation'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import {
  isTransactionInFlight,
  useActiveTransactionState,
} from '@/features/transaction-manager/hooks/useActiveTransactionState'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { canReclaimV1Manager } from '@/features/transfer/v1/rules'
import type { ProtocolVersion } from '@/utils/types'

/**
 * Takes the manager role back on an unwrapped `.eth` 2LD whose registry slot
 * points at a different wallet — the control the transfer flow's "Reclaim the
 * parent first" refusal sends the registrant of a subname's parent here to use.
 *
 * Renders nothing unless `canReclaimV1Manager` passes, which is the only case
 * where `BaseRegistrar.reclaim` both applies and would succeed.
 */
export const ReclaimManagerButton = ({
  name,
  protocolVersion,
  account,
}: {
  readonly name: string
  readonly protocolVersion: ProtocolVersion | undefined
  readonly account: Address | undefined
}) => {
  // Shares the entry `useCanTransfer` primes on this page, so it's a cache hit.
  const { data: v1State } = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    enabled: !!account && protocolVersion === 'ENSv1',
  })

  const { closeModal, clearTransaction } = useTransactionModal()
  const attempt = useFlowAttempt()
  const id = scopeTransactionId(`reclaim-manager-${name}`, attempt.scope)
  // Scoped to this flow's own id: the cancel below must never reach another
  // flow's entry in the manager.
  const reclaimTxState = useActiveTransactionState(id)
  const { mutate: changeManager } = useChangeManagerMutation({
    name,
    id,
    description: `Reclaim manager role - ${name}`,
  })

  if (!account || !canReclaimV1Manager(v1State, account)) return null

  const reclaim: V1ManagerChange = { manager: account, authority: 'registrant' }

  return (
    <>
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => {
          // A stale terminal-state transaction under this id blocks the modal;
          // drop just that entry so a fresh reclaim can start (same guard as
          // ExtendNameButton).
          if (reclaimTxState && !isTransactionInFlight(reclaimTxState))
            transactionManager.cancelTransaction(reclaimTxState.txId)
          attempt.start(account)
        }}
      >
        <ShieldPersonIcon className="size-4" />
        Reclaim manager
      </Button>
      {/* Mounted only during a reclaim: the modal's open state is shared with Change manager's. */}
      {attempt.scope && (
        <TransactionModal
          transactions={[
            {
              id,
              title: 'Reclaim manager role',
              transactionName: `Reclaim manager role - ${name}`,
              // Fully determined by the name and the connected wallet, so the
              // modal can estimate gas the moment it opens.
              intent: {
                prepare: (ctx) =>
                  prepareChangeManagerTransaction({ ...ctx, ...reclaim, name }),
              },
              onStart: () => changeManager(reclaim),
              onDone: () => {
                closeModal()
                clearTransaction()
                attempt.end()
              },
            },
          ]}
        />
      )}
    </>
  )
}
