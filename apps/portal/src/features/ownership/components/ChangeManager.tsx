import {
  scopeTransactionId,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Info, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { LoadingMessage } from '@/components/LoadingMessage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MessageCard } from '@/components/ui/message-card'
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
import { RecipientPreview } from '@/features/transfer/components/SendNameForm'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import {
  getV1ManagerCandidateIssue,
  getV1ManagerChangeGate,
  type V1ManagerCandidateIssue,
  type V1ManagerChangeGate,
} from '@/features/transfer/v1/rules'

const CANDIDATE_ISSUE_MESSAGES = {
  'zero-address': 'The manager can’t be the zero address.',
  'already-manager': 'This address already manages this name.',
} as const satisfies Record<V1ManagerCandidateIssue, string>

const ChangeManagerForm = ({
  gate,
  onConfirm,
}: {
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
    <div className="flex flex-col gap-6 max-w-2xl w-full">
      {gate.authority === 'controller' ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            The manager controls this name’s records, resolver and subnames.
            Once you hand the role on, only the new manager or the owner can
            change it again.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="neutral">
          <Info className="size-4" />
          <AlertDescription>
            The manager controls this name’s records, resolver and subnames. You
            stay the owner and can take the role back at any time.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1">
        <span className="font-medium">New manager</span>
        <AddressNameInput
          aria-label="New manager"
          value={managerInput}
          onChange={setManagerInput}
          resolution={resolution}
          className="h-9"
          resolvedContent={match({ issue, address })
            .with({ issue: P.nonNullable }, ({ issue }) => (
              <p className="text-p mt-1.5 text-destructive">
                {CANDIDATE_ISSUE_MESSAGES[issue]}
              </p>
            ))
            .with({ address: P.nonNullable }, ({ address }) => (
              <RecipientPreview address={address} />
            ))
            .otherwise(() => null)}
        />
      </div>

      <Button
        variant="default"
        onClick={() => manager && onConfirm(manager)}
        disabled={!manager}
        className="flex items-center justify-center gap-2 w-fit"
      >
        Change manager
      </Button>
    </div>
  )
}

/** Hands an unwrapped `.eth` 2LD's manager role to another wallet in one transaction; the owner stays. */
export const ChangeManager = ({
  name,
  account,
}: {
  readonly name: string
  readonly account: Address
}) => {
  // `staleTime: 0`: the Ownership page primes this entry, and a name that has
  // lapsed since must not pass the gate on a cached read.
  const stateQuery = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    staleTime: 0,
  })
  const [change, setChange] = useState<V1ManagerChange | null>(null)

  const navigate = useNavigate()
  const { openModal, closeModal, clearTransaction } = useTransactionModal()
  const attempt = useFlowAttempt()
  const id = scopeTransactionId(`change-manager-${name}`, attempt.scope)
  // Scoped to this flow's own id: the cancel below must never reach another
  // flow's entry in the manager.
  const txState = useActiveTransactionState(id)
  const { mutate: changeManager } = useChangeManagerMutation({
    name,
    id,
    description: `Change manager - ${name}`,
  })

  if (stateQuery.isLoading) return <LoadingMessage />

  if (stateQuery.isError)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Couldn’t check this name"
        description={
          <p>
            We couldn’t read how this name is held, so we can’t tell who may
            change its manager. Refresh and try again.
          </p>
        }
      />
    )

  return (
    <>
      {match({ gate: getV1ManagerChangeGate(stateQuery.data, account), change })
        .with({ gate: P.nonNullable }, ({ gate }) => (
          <ChangeManagerForm
            gate={gate}
            onConfirm={(manager) => {
              if (isTransactionInFlight(txState)) return openModal()
              // A stale terminal-state transaction under this id blocks the
              // modal; drop just that entry (same guard as ExtendNameButton).
              if (txState) transactionManager.cancelTransaction(txState.txId)
              setChange({ manager, authority: gate.authority })
              attempt.start(account)
            }}
          />
        ))
        // A manager who hands the role on loses the gate once it lands; the modal stays until Done.
        .with({ change: P.nonNullable }, () => null)
        .otherwise(() => (
          <MessageCard
            icon={<ShieldX className="size-8" />}
            title="You can’t change this name’s manager"
            description={
              <p>
                Only the owner or the manager of an unwrapped .eth name can
                change its manager. A wrapped name has no separate manager, and
                a name in its grace period has to be renewed first.
              </p>
            }
            actionButton={{
              label: 'Go to ownership',
              href: `/${name}/ownership`,
              variant: 'outline',
            }}
          />
        ))}
      {change && attempt.scope && (
        <TransactionModal
          transactions={[
            {
              id,
              title: 'Change manager',
              transactionName: `Change manager - ${name}`,
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
                void navigate({ to: '/$name/ownership', params: { name } })
              },
            },
          ]}
        />
      )}
    </>
  )
}
