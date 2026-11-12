import {
  scopeTransactionId,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { UserRoundPen } from 'lucide-react'
import { useState } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { ShieldPersonIcon } from '@/assets/icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AddressNameInput } from '@/features/address/components/AddressNameInput'
import { useAddressResolution } from '@/features/address/hooks/useAddressResolution'
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
import {
  canReclaimV1Manager,
  getV1ManagerCandidateIssue,
  getV1ManagerChangeGate,
  type V1ManagerCandidateIssue,
  type V1ManagerChangeGate,
} from '@/features/transfer/v1/rules'
import type { ProtocolVersion } from '@/utils/types'

const CANDIDATE_ISSUE_MESSAGES = {
  'zero-address': 'The manager can’t be the zero address.',
  'already-manager': 'This address already manages this name.',
} as const satisfies Record<V1ManagerCandidateIssue, string>

const ChangeManagerDialog = ({
  onClose,
  gate,
  onConfirm,
}: {
  readonly onClose: () => void
  readonly gate: V1ManagerChangeGate
  readonly onConfirm: (manager: Address) => void
}) => {
  const [managerInput, setManagerInput] = useState('')
  const resolution = useAddressResolution(managerInput)
  const { address, isResolving } = resolution
  const issue = address
    ? getV1ManagerCandidateIssue(address, gate.currentManager)
    : null
  const manager = address && !isResolving && !issue ? address : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change manager</DialogTitle>
          <DialogDescription>
            The manager controls this name’s records, resolver and subnames.{' '}
            {gate.authority === 'registrant'
              ? 'You stay the owner and can take the role back at any time.'
              : 'The owner stays the same.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (manager) onConfirm(manager)
          }}
        >
          <div>
            <AddressNameInput
              aria-label="New manager"
              value={managerInput}
              onChange={setManagerInput}
              resolution={resolution}
              resolvedContent={
                issue ? (
                  <p className="text-p mt-1.5 text-danger">
                    {CANDIDATE_ISSUE_MESSAGES[issue]}
                  </p>
                ) : undefined
              }
            />
          </div>
          {gate.authority === 'controller' && (
            <Alert variant="warning">
              <AlertDescription>
                You’ll stop managing this name. After this, only the new manager
                or the owner can change it.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!manager}>
              Change manager
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The Ownership page's manager actions for an unwrapped `.eth` 2LD: Reclaim (the
 * way out of the transfer flow's "Reclaim the parent first" refusal) and Change.
 * One flow and one modal, since the modal's open state is app-wide.
 */
export const ManagerActions = ({
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

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [change, setChange] = useState<V1ManagerChange | null>(null)

  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const attempt = useFlowAttempt()
  const id = scopeTransactionId(`manager-${name}`, attempt.scope)
  // Scoped to this flow's own id: the cancel below must never reach another
  // flow's entry in the manager.
  const txState = useActiveTransactionState(id)
  const title =
    change && account && isAddressEqual(change.manager, account)
      ? 'Reclaim manager role'
      : 'Change manager'
  const { mutate: changeManager } = useChangeManagerMutation({
    name,
    id,
    description: `${title} - ${name}`,
  })

  const gate = getV1ManagerChangeGate(v1State, account)
  // A manager who hands the role on loses the gate once it lands; the modal stays until they close it.
  if (!account || (!gate && !change)) return null

  const isInFlight = isTransactionInFlight(txState)
  const start = (next: V1ManagerChange) => {
    // A stale terminal-state transaction under this id blocks the modal; drop
    // just that entry so a fresh change can start (same guard as ExtendNameButton).
    if (txState && !isInFlight)
      transactionManager.cancelTransaction(txState.txId)
    setChange(next)
    attempt.start(account)
  }

  return (
    <>
      {canReclaimV1Manager(v1State, account) && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            isInFlight
              ? openModal()
              : start({ manager: account, authority: 'registrant' })
          }
        >
          <ShieldPersonIcon className="size-4" />
          Reclaim manager
        </Button>
      )}
      {gate && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => (isInFlight ? openModal() : setIsDialogOpen(true))}
        >
          <UserRoundPen className="size-4" />
          Change manager
        </Button>
      )}
      {/* Mounted only while open, so each change starts from an empty field. */}
      {gate && isDialogOpen && (
        <ChangeManagerDialog
          onClose={() => setIsDialogOpen(false)}
          gate={gate}
          onConfirm={(manager) => {
            setIsDialogOpen(false)
            start({ manager, authority: gate.authority })
          }}
        />
      )}
      {change && attempt.scope && (
        <TransactionModal
          transactions={[
            {
              id,
              title,
              transactionName: `${title} - ${name}`,
              // Fixed once confirmed, so the modal can estimate gas the moment it opens.
              intent: {
                prepare: (ctx) =>
                  prepareChangeManagerTransaction({ ...ctx, ...change, name }),
              },
              onStart: () => changeManager(change),
              onDone: () => {
                closeModal()
                clearTransaction()
                attempt.end()
                setChange(null)
              },
            },
          ]}
        />
      )}
    </>
  )
}
