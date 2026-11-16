import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useRegistryRepairCase } from '../../hooks/useRegistryRepairCase'
import {
  type RegistryUpgradeState,
  useRegistryUpdate,
} from '../../hooks/useRegistryUpdate'
import type { RegistryRepairCase } from '../../utils/registryRepairCase'
import { RegistryPanel } from './RegistryPanel'

const CAN_UPDATE_CASES: readonly RegistryRepairCase[] = ['owns-all', 'shared']

const updateLabel = (state: RegistryUpgradeState) =>
  match(state)
    .with('planning', () => 'Preparing upgrade…')
    .with('incomplete', () => 'Continue upgrade')
    .otherwise(() => 'Upgrade registry')

/** Asks an account that can update the name's registry to do so. */
export const RegistryUpdateNotice = ({ name }: { readonly name: string }) => {
  const { repairCase, registryAddress, parentRegistry } =
    useRegistryRepairCase(name)

  if (!CAN_UPDATE_CASES.includes(repairCase)) return null

  return (
    <RegistryUpdateCard
      name={name}
      registryAddress={registryAddress}
      parentRegistry={parentRegistry}
    />
  )
}

const RegistryUpdateCard = ({
  name,
  registryAddress,
  parentRegistry,
}: {
  readonly name: string
  readonly registryAddress: Address | undefined
  readonly parentRegistry: Address | undefined
}) => {
  const { start, state, canStart, transactions } = useRegistryUpdate({
    name,
    registryAddress,
    parentRegistry,
  })

  return (
    <RegistryPanel>
      <Alert className="p-5 gap-2" variant="warning">
        <AlertTitle>Upgrade required</AlertTitle>
        <AlertDescription>
          This registry runs on an older version that has since been fixed.
          Upgrade it to start creating subnames or change roles. Your subnames,
          their owners and their roles will be copied to the new registry.
        </AlertDescription>
      </Alert>
      {state === 'planFailed' && (
        <ErrorMessage
          compact
          description="Couldn't prepare the upgrade. Refresh the page and try again."
        />
      )}
      {state === 'incomplete' && (
        <ErrorMessage
          compact
          description="The upgrade stopped before every subname was copied. Continue to pick up where it left off."
        />
      )}
      <Button className="w-full" disabled={!canStart} onClick={start}>
        {updateLabel(state)}
      </Button>
      {transactions.length > 0 && (
        <TransactionModal transactions={transactions} />
      )}
    </RegistryPanel>
  )
}
