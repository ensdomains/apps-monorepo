import { match } from 'ts-pattern'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useRegistryRepairCase } from '../../hooks/useRegistryRepairCase'
import {
  type RegistryUpdateStatus,
  useRegistryUpdate,
} from '../../hooks/useRegistryUpdate'
import type { RegistryRepairCase } from '../../utils/registryRepairCase'
import { RegistryPanel } from './RegistryPanel'

const CAN_UPDATE_CASES: readonly RegistryRepairCase[] = ['owns-all', 'shared']

const updateLabel = (status: RegistryUpdateStatus) =>
  match(status.type)
    .with('planning', () => 'Preparing update…')
    .with('incomplete', () => 'Continue update')
    .otherwise(() => 'Update registry')

/** Asks an account that can update the name's registry to do so. */
export const RegistryUpdateNotice = ({ name }: { readonly name: string }) => {
  const { repairCase, registryAddress, parentRegistry } =
    useRegistryRepairCase(name)
  const { start, status, transactions } = useRegistryUpdate({
    name,
    registryAddress,
    parentRegistry,
  })

  if (!CAN_UPDATE_CASES.includes(repairCase)) return null

  return (
    <RegistryPanel>
      <Alert className="p-5 gap-2" variant="warning">
        <AlertTitle>Update required</AlertTitle>
        <AlertDescription>
          This registry runs on an older version that has since been fixed.
          Update it to create subnames or change roles. The existing subnames
          and their settings will carry over.
        </AlertDescription>
      </Alert>
      {status.type === 'plan-failed' && (
        <ErrorMessage
          compact
          description="Couldn't prepare the update. Refresh the page and try again."
        />
      )}
      {status.type === 'incomplete' && (
        <ErrorMessage
          compact
          description="The update stopped before every subname was copied. Continue to pick up where it left off."
        />
      )}
      <Button
        className="w-full"
        disabled={status.type === 'planning' || status.type === 'running'}
        onClick={() => void start()}
      >
        {updateLabel(status)}
      </Button>
      {transactions.length > 0 && (
        <TransactionModal transactions={transactions} />
      )}
    </RegistryPanel>
  )
}
