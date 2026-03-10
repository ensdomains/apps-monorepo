import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { isAddress, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { DeployRegistryForm } from '@/features/registry/components/DeployRegistryForm'
import { DeployRegistryHeader } from '@/features/registry/components/DeployRegistryHeader'
import { useDeploySubregistry } from '@/features/registry/hooks/useDeploySubregistry'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { useSetSubregistry } from '@/features/registry/hooks/useSetSubregistry'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import {
  namechainUserRegistryAddress,
  sepoliaUserRegistryAddress,
} from '@/lib/constants/userRegistry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'

const DEPLOY_SUBREGISTRY_TX_ID = 'tx-deploy-subregistry'
const SET_SUBREGISTRY_TX_ID = 'tx-set-subregistry'

const SUCCESS_LABEL_DURATION_MS = 5000

export const Route = createFileRoute('/$name/deploy-registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/deploy-registry' })
  const { address: connectedAddress } = useConnection()
  const [useCustomRegistry, setUseCustomRegistry] = useState(false)
  const [contractAddress, setContractAddress] = useState('')
  const [showSuccessButtonLabel, setShowSuccessButtonLabel] = useState(false)

  const {
    openModal: openTransactionModal,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  const {
    data: registryData,
    isLoading,
    error: registryError,
  } = useQuery(
    getNameRegistriesQueryOptions({ name, network: 'namechainSepolia' }),
  )

  const network = registryData?.network ?? 'sepolia'
  const isNamechain = network === 'namechainSepolia'

  const label = name.split('.')[0]
  const parentRegistry = registryData?.registries.at(1) ?? null

  const { data: hasSetSubregistryRole, isLoading: isLoadingRoleCheck } =
    useQuery({
      ...getHasRolesQueryOptions({
        registryAddress: parentRegistry ?? zeroAddress,
        label,
        roles: ['ROLE_SET_SUBREGISTRY'],
        account: connectedAddress ?? zeroAddress,
        network,
      }),
      enabled:
        !!connectedAddress &&
        !!parentRegistry &&
        parentRegistry !== zeroAddress &&
        !isLoading,
    })

  const factoryAddress = isNamechain
    ? namechainVerifiableFactory
    : sepoliaVerifiableFactory

  const implAddress = isNamechain
    ? namechainUserRegistryAddress
    : sepoliaUserRegistryAddress

  const customSubregistryAddress =
    useCustomRegistry && isAddress(contractAddress)
      ? (contractAddress as Address)
      : null

  const isDeployPath = !customSubregistryAddress

  const {
    deploySubregistryAsync,
    deployedSubregistryAddress,
    isConfirming: isDeployConfirming,
    hasWallet: hasDeployWallet,
  } = useDeploySubregistry({
    name,
    network,
    factoryAddress,
    implAddress,
  })

  const {
    setSubregistry,
    isPending: isSetSubregistryPending,
    hasWallet: hasSetWallet,
  } = useSetSubregistry({
    name,
    network,
    label,
    parentRegistry: parentRegistry ?? zeroAddress,
    id: SET_SUBREGISTRY_TX_ID,
  })

  const walletOk = isDeployPath ? hasDeployWallet : hasSetWallet

  const handleDeploySubregistryStart = () => {
    deploySubregistryAsync({ id: DEPLOY_SUBREGISTRY_TX_ID })
  }

  const handleDeploySubregistryDone = () => {
    if (!deployedSubregistryAddress) return
    setSubregistry(deployedSubregistryAddress)
  }

  const handleSetSubregistryStart = () => {
    if (!customSubregistryAddress) return
    setSubregistry(customSubregistryAddress)
  }

  const handleSetSubregistryDone = () => {
    closeTransactionModal()
    clearTransaction()
    setContractAddress('')
    setShowSuccessButtonLabel(true)
    setTimeout(
      () => setShowSuccessButtonLabel(false),
      SUCCESS_LABEL_DURATION_MS,
    )
  }

  const handleSubmit = () => {
    if (useCustomRegistry && !isAddress(contractAddress)) return
    openTransactionModal()
  }

  const isSubmitDisabled =
    (useCustomRegistry && !isAddress(contractAddress)) || !walletOk

  const buttonText = match({
    isDeployConfirming,
    isSetSubregistryPending,
    showSuccessButtonLabel,
  })
    .with({ isDeployConfirming: true }, () => 'Deploying...')
    .with({ isSetSubregistryPending: true }, () => 'Setting subregistry...')
    .with({ showSuccessButtonLabel: true }, () => 'Complete!')
    .otherwise(() => 'Deploy subregistry')

  if (isLoading) {
    return <LoadingSpinner title="Loading registry information" />
  }

  if (registryError) {
    const errorMessage =
      registryError instanceof Error
        ? registryError.message
        : 'Failed to load registry information'

    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <DeployRegistryHeader name={name} />
        <Alert variant="destructive" className="max-w-full">
          <AlertCircle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            {errorMessage}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (registryData?.protocolVersion === 'ENSv1') {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <DeployRegistryHeader name={name} />
        <Alert className="max-w-full">
          <AlertCircle />
          <AlertTitle>Not Available for V1 Names</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            V1 names (like {name}) don't support custom subregistries. Only V2
            names can deploy and manage their own subregistries.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoadingRoleCheck) {
    return <LoadingSpinner title="Checking permissions..." />
  }

  if (connectedAddress && !hasSetSubregistryRole) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <DeployRegistryHeader name={name} />
        <ErrorMessage
          title="Permission Denied"
          description={
            <>
              You don't have the required{' '}
              <code className="font-mono text-sm bg-quartz-50 px-1 py-0.5 rounded">
                ROLE_SET_SUBREGISTRY
              </code>{' '}
              permission to change the registry for <strong>{name}</strong>.
              Please contact the registry administrator to request access.
            </>
          }
        />
      </div>
    )
  }

  if (!connectedAddress) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <DeployRegistryHeader name={name} />
        <ErrorMessage
          title="Wallet Not Connected"
          description="Please connect your wallet to deploy or change a registry."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <DeployRegistryHeader name={name} />

      <DeployRegistryForm
        useCustomRegistry={useCustomRegistry}
        setUseCustomRegistry={setUseCustomRegistry}
        contractAddress={contractAddress}
        setContractAddress={setContractAddress}
        onSubmit={handleSubmit}
        isSubmitDisabled={isSubmitDisabled}
        buttonText={buttonText}
      />

      <TransactionModal
        transactions={
          isDeployPath
            ? [
                {
                  id: DEPLOY_SUBREGISTRY_TX_ID,
                  title: 'Deploy subregistry',
                  transactionName: `Deploy subregistry for ${name}`,
                  estimatedGasCost: 0.0008,
                  onStart: handleDeploySubregistryStart,
                  onDone: handleDeploySubregistryDone,
                },
                {
                  id: SET_SUBREGISTRY_TX_ID,
                  title: 'Set subregistry',
                  transactionName: `Set subregistry for ${name}`,
                  estimatedGasCost: 0.0001,
                  onStart: handleDeploySubregistryDone,
                  onDone: handleSetSubregistryDone,
                },
              ]
            : [
                {
                  id: SET_SUBREGISTRY_TX_ID,
                  title: 'Set subregistry',
                  transactionName: `Set custom subregistry for ${name}`,
                  estimatedGasCost: 0.0001,
                  onStart: handleSetSubregistryStart,
                  onDone: handleSetSubregistryDone,
                },
              ]
        }
      />
    </div>
  )
}
