import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { AlertCircle, ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DeployRegistryForm } from '@/features/registry/components/DeployRegistryForm'
import { DeployTransactionStatus } from '@/features/registry/components/DeployTransactionStatus'
import { SetSubregistryTransactionStatus } from '@/features/registry/components/SetSubregistryTransactionStatus'
import { useDeployRegistryMutations } from '@/features/registry/hooks/useDeployRegistryMutations'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import {
  namechainUserRegistryAddress,
  sepoliaUserRegistryAddress,
} from '@/lib/constants/userRegistry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'

export const Route = createFileRoute('/$name/deploy-registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/deploy-registry' })
  const [useCustomRegistry, setUseCustomRegistry] = useState(false)
  const [contractAddress, setContractAddress] = useState('')
  const [migrateSubnames, setMigrateSubnames] = useState(false)

  const {
    data: registryData,
    isLoading,
    error: registryError,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  const network = registryData?.network ?? 'sepolia'
  const isNamechain = network === 'namechainSepolia'

  const factoryAddress = isNamechain
    ? namechainVerifiableFactory
    : sepoliaVerifiableFactory

  const implAddress = isNamechain
    ? namechainUserRegistryAddress
    : sepoliaUserRegistryAddress

  const currentNameRegistry = registryData?.registries.at(0) ?? null
  const finalFactoryAddress = useCustomRegistry
    ? (contractAddress as Address)
    : factoryAddress

  const {
    deploySubregistry,
    deployTxHash,
    isWriting,
    isConfirming,
    deployError,
    setSubregistryTxHash,
    isSettingSubregistry,
    isConfirmingSetSubregistry,
    isSetSubregistryConfirmed,
    isSetSubregistryReverted,
    setSubregistryError,
    setSubregistryReceiptError,
    hasWallet,
  } = useDeployRegistryMutations({
    name,
    factoryAddress: finalFactoryAddress,
    implAddress,
    currentNameRegistry,
    protocolVersion: registryData?.protocolVersion ?? null,
  })

  const isSubmitDisabled =
    (useCustomRegistry && contractAddress.trim() === '') ||
    isWriting ||
    isConfirming ||
    isSettingSubregistry ||
    isConfirmingSetSubregistry ||
    !hasWallet

  const getButtonText = () => {
    if (isWriting) return 'Submitting...'
    if (isConfirming) return 'Deploying...'
    if (isSettingSubregistry || isConfirmingSetSubregistry)
      return 'Setting subregistry...'
    if (isSetSubregistryConfirmed) return 'Complete!'
    return 'Update subregistry'
  }

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
        <Link to="/$name/registry" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium leading-none">
          Deploy registry
        </h1>
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

  // V1 names cannot deploy subregistries
  if (registryData?.protocolVersion === 'ENSv1') {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <Link to="/$name/registry" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium leading-none">
          Deploy registry
        </h1>
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

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/registry" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-[28px] font-medium leading-none">Deploy registry</h1>

      <DeployRegistryForm
        useCustomRegistry={useCustomRegistry}
        setUseCustomRegistry={setUseCustomRegistry}
        contractAddress={contractAddress}
        setContractAddress={setContractAddress}
        migrateSubnames={migrateSubnames}
        setMigrateSubnames={setMigrateSubnames}
        onSubmit={deploySubregistry}
        isSubmitDisabled={isSubmitDisabled}
        buttonText={getButtonText()}
      />

      <DeployTransactionStatus
        txHash={deployTxHash}
        isConfirming={isConfirming}
        txError={deployError}
      />

      <SetSubregistryTransactionStatus
        txHash={setSubregistryTxHash}
        isSettingSubregistry={isSettingSubregistry}
        isConfirming={isConfirmingSetSubregistry}
        isConfirmed={isSetSubregistryConfirmed}
        isReverted={isSetSubregistryReverted}
        txError={setSubregistryError}
        receiptError={setSubregistryReceiptError}
      />
    </div>
  )
}
