import {
  scopeTransactionId,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Info, UserRoundPen } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
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
import { Label } from '@/components/ui/label'
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change manager</DialogTitle>
          <DialogDescription>
            The manager controls this name’s records, resolver and subnames. The
            owner stays the same.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <Label htmlFor="new-manager">New manager</Label>
          <AddressNameInput
            id="new-manager"
            value={managerInput}
            onChange={setManagerInput}
            resolution={resolution}
            className="h-9"
            resolvedContent={
              issue ? (
                <p className="text-p mt-1.5 text-destructive">
                  {CANDIDATE_ISSUE_MESSAGES[issue]}
                </p>
              ) : undefined
            }
          />
        </div>

        {gate.authority === 'controller' ? (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              You’ll stop managing this name. After this, only the new manager
              or the owner can change it.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="neutral">
            <Info className="size-4" />
            <AlertDescription>
              You stay the owner, so you can take the manager role back at any
              time.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!address || isResolving || issue !== null}
            onClick={() => address && onConfirm(address)}
          >
            Change manager
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Hands an unwrapped `.eth` 2LD's manager role to another wallet in one transaction; the owner stays. */
export const ChangeManagerButton = ({
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
  const id = scopeTransactionId(`change-manager-${name}`, attempt.scope)
  const changeTxState = useActiveTransactionState(id)
  const { mutate: changeManager } = useChangeManagerMutation({
    name,
    id,
    description: `Change manager - ${name}`,
  })

  const gate = getV1ManagerChangeGate(v1State, account)
  // A manager who hands the role on loses the gate once it lands; the modal stays until they close it.
  if (!account || (!gate && !change)) return null

  return (
    <>
      {gate && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            isTransactionInFlight(changeTxState)
              ? openModal()
              : setIsDialogOpen(true)
          }
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
            // Same stale-entry guard as ReclaimManagerButton.
            if (changeTxState && !isTransactionInFlight(changeTxState))
              transactionManager.cancelTransaction(changeTxState.txId)
            setChange({ manager, authority: gate.authority })
            setIsDialogOpen(false)
            attempt.start(account)
          }}
        />
      )}
      {/* Mounted only during a change: the modal's open state is shared with Reclaim manager's. */}
      {change && attempt.scope && (
        <TransactionModal
          transactions={[
            {
              id,
              title: 'Change manager',
              transactionName: `Change manager - ${name}`,
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
