import { type ReactNode, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useRegistryRepairCase } from '../../hooks/useRegistryRepairCase'
import { useRegistryUpdate } from '../../hooks/useRegistryUpdate'
import type { RegistryUpgradeStage } from '../../state/registryUpgrade.machine'
import {
  carriedSubnamesText,
  isUpgradeCardForPage,
  shouldShowUpgradeCard,
} from '../../utils/registryRepairCase'
import type { RegistryUpdateFailure } from '../../utils/registryUpdate'
import { RegistryPanel } from './RegistryPanel'

const updateLabel = (stage: RegistryUpgradeStage) =>
  match(stage)
    .with('planning', () => 'Preparing upgrade…')
    .with('sending', 'checking', () => 'Finishing the current step…')
    .with('incomplete', () => 'Continue upgrade')
    .otherwise(() => 'Upgrade registry')

const FAILURE_MESSAGES: Readonly<Record<RegistryUpdateFailure, string>> = {
  'missing-roles':
    "Your account doesn't have all the roles on this registry needed to copy it.",
  'registry-replaced':
    'This name now points at a different registry. Refresh the page to see it.',
  'unknown-label':
    "This name's label isn't known, so the new registry can't be linked to it.",
  unavailable: "This registry can't be upgraded here.",
  'read-failed':
    "Couldn't read the registry to prepare the upgrade. Try again.",
}

/** Asks an account that can update the name's registry to do so; `fallback` shows to everyone else. */
export const RegistryUpdateNotice = ({
  name,
  pageRegistry,
  fallback = null,
  isInTree = false,
}: {
  readonly name: string
  /** On a page about one registry, the card shows only for that registry. */
  readonly pageRegistry?: Address
  readonly fallback?: ReactNode
  readonly isInTree?: boolean
}) => {
  const { repairCase, registryAddress, parentRegistry, subnameCount } =
    useRegistryRepairCase(name)
  const [wasShown, setWasShown] = useState(false)
  const isShown =
    shouldShowUpgradeCard({ repairCase, wasShown }) &&
    isUpgradeCardForPage({ pageRegistry, nameRegistry: registryAddress })
  if (isShown !== wasShown) setWasShown(isShown)

  if (!isShown) return fallback

  const card = (
    <RegistryUpdateCard
      name={name}
      registryAddress={registryAddress}
      parentRegistry={parentRegistry}
      subnameCount={subnameCount}
    />
  )
  return isInTree ? <RegistryPanel>{card}</RegistryPanel> : card
}

const RegistryUpdateCard = ({
  name,
  registryAddress,
  parentRegistry,
  subnameCount,
}: {
  readonly name: string
  readonly registryAddress: Address | undefined
  readonly parentRegistry: Address | undefined
  readonly subnameCount: number | undefined
}) => {
  const { start, stage, canStart, failure, transactions } = useRegistryUpdate({
    name,
    registryAddress,
    parentRegistry,
  })

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <Alert className="p-5 gap-2" variant="warning">
        <AlertTitle>Upgrade required</AlertTitle>
        <AlertDescription>
          This registry runs on an older version that has since been fixed.
          Upgrade it to create subnames or change roles.{' '}
          {carriedSubnamesText(subnameCount)} will carry over. Inform other
          users of the registry to use the newly upgraded registry going
          forward.
        </AlertDescription>
      </Alert>
      {stage === 'planFailed' && failure && (
        <ErrorMessage compact description={FAILURE_MESSAGES[failure]} />
      )}
      {stage === 'incomplete' && (
        <ErrorMessage
          compact
          description="The upgrade stopped before every subname was copied. Continue to pick up where it left off."
        />
      )}
      <Button className="w-full" disabled={!canStart} onClick={start}>
        {updateLabel(stage)}
      </Button>
      {transactions.length > 0 && (
        <TransactionModal transactions={transactions} />
      )}
    </div>
  )
}
