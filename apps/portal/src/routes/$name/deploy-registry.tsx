import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import {
  deploySubregistryWriteParameters,
  setSubregistryWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowLeftIcon,
  CheckCircle,
  CircleCheckIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import {
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import {
  namechainUserRegistryAddress,
  sepoliaUserRegistryAddress,
} from '@/lib/constants/userRegistry'
import {
  namechainVerifiableFactory,
  sepoliaVerifiableFactory,
} from '@/lib/constants/verifiableFactory'
import { wagmiConfig } from '@/lib/wagmi'

export const Route = createFileRoute('/$name/deploy-registry')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/deploy-registry' })
  const [useCustomRegistry, setUseCustomRegistry] = useState(false)
  const [contractAddress, setContractAddress] = useState('')
  const [migrateSubnames, setMigrateSubnames] = useState(false)

  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  const {
    data: registryData,
    isLoading,
    error: registryError,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  const network = registryData?.network ?? 'sepolia'
  const isNamechain = network === 'namechainSepolia'

  const ensChain = wagmiConfig.chains.find((c) => c.id === sepolia.id)

  const factoryAddress = isNamechain
    ? namechainVerifiableFactory
    : sepoliaVerifiableFactory

  const implAddress = isNamechain
    ? namechainUserRegistryAddress
    : sepoliaUserRegistryAddress

  const {
    writeContractAsync,
    data: deployTxHash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract()

  const {
    data: deployReceipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash: deployTxHash,
  })

  const {
    writeContractAsync: writeSetSubregistryAsync,
    data: setSubregistryTxHash,
    isPending: isSettingSubregistry,
    error: setSubregistryError,
  } = useWriteContract()

  const {
    data: setSubregistryReceipt,
    isLoading: isConfirmingSetSubregistry,
    isSuccess: isSetSubregistryReceiptReceived,
    error: setSubregistryReceiptError,
  } = useWaitForTransactionReceipt({
    hash: setSubregistryTxHash,
  })

  // Check if setSubregistry actually succeeded (not reverted)
  const isSetSubregistryConfirmed =
    isSetSubregistryReceiptReceived &&
    setSubregistryReceipt?.status === 'success'

  const isSetSubregistryReverted =
    isSetSubregistryReceiptReceived &&
    setSubregistryReceipt?.status === 'reverted'

  // Extract label and current name's registry from registryData
  const label = name.split('.')[0] // e.g., "flo" from "flo.eth"
  const currentNameRegistry = registryData?.registries.at(-2) ?? null // Current name's registry (where we have permission)

  const finalFactoryAddress = useCustomRegistry
    ? (contractAddress as Address)
    : factoryAddress

  const writeParams =
    walletClient && ensChain && implAddress
      ? deploySubregistryWriteParameters(
          {
            ...walletClient,
            chain: ensChain as ChainWithEns,
          },
          {
            factoryAddress: finalFactoryAddress,
            implAddress,
            // TODO: Handle migrateSubnames logic
          },
        )
      : null

  // Automatically call setSubregistry when deploy is confirmed
  useEffect(() => {
    if (
      !isConfirmed ||
      !deployReceipt ||
      !walletClient ||
      !ensChain ||
      !currentNameRegistry
    ) {
      return
    }

    const deployedAddress =
      deployReceipt.contractAddress || deployReceipt.logs[0]?.address

    if (!deployedAddress) {
      return
    }

    if (registryData?.protocolVersion === 'ENSv1') {
      return
    }

    // currentNameRegistry is the registry that actually holds the tokenId for `label`
    if (currentNameRegistry === zeroAddress) {
      return
    }

    const setSubregistryParams = setSubregistryWriteParameters(
      {
        ...walletClient,
        chain: ensChain as ChainWithEns,
      },
      {
        registryAddress: currentNameRegistry as Address,
        label,
        subregistryAddress: deployedAddress,
      },
    )

    writeSetSubregistryAsync({
      address: setSubregistryParams.address,
      abi: setSubregistryParams.abi,
      functionName: setSubregistryParams.functionName,
      args: setSubregistryParams.args,
      gas: 500000n,
    })
  }, [
    isConfirmed,
    deployReceipt,
    walletClient,
    ensChain,
    currentNameRegistry,
    label,
    writeSetSubregistryAsync,
    registryData?.protocolVersion,
  ])

  const handleSubmit = async () => {
    if (!writeParams) {
      return
    }
    await writeContractAsync({
      address: writeParams.address,
      abi: writeParams.abi,
      functionName: writeParams.functionName,
      args: writeParams.args,
    })
  }

  const isSubmitDisabled =
    (useCustomRegistry && contractAddress.trim() === '') ||
    isWriting ||
    isConfirming ||
    isSettingSubregistry ||
    isConfirmingSetSubregistry ||
    !walletClient

  const getButtonText = () => {
    if (isWriting) return 'Submitting...'
    if (isConfirming) return 'Deploying...'
    if (isSettingSubregistry || isConfirmingSetSubregistry)
      return 'Setting subregistry...'
    if (isSetSubregistryConfirmed) return 'Complete!'
    return 'Update subregistry'
  }

  const txError = writeError?.message ?? setSubregistryError?.message ?? null

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

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={useCustomRegistry}
            onCheckedChange={setUseCustomRegistry}
            id="use-custom-registry"
          />
          <Label htmlFor="use-custom-registry" className="cursor-pointer">
            Use custom registry
          </Label>
        </div>
        {!useCustomRegistry && (
          <span className="text-sm text-muted-foreground">
            Deploy a new verified subregistry.
          </span>
        )}
      </div>

      {useCustomRegistry && (
        <div className="flex flex-col gap-3">
          <Label
            htmlFor="contract-address"
            info="The address of the custom registry contract"
          >
            Contract address
          </Label>
          <Input
            id="contract-address"
            placeholder="HEX address or ENS name"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={migrateSubnames}
            onCheckedChange={setMigrateSubnames}
            className="shrink-0"
            id="migrate-subnames"
          />
          <Label htmlFor="migrate-subnames" className="cursor-pointer">
            Migrate subnames
          </Label>
        </div>
        <span className="text-sm text-muted-foreground">
          All subnames on your current subregistry will be lost.
        </span>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
        className="w-fit"
      >
        <span className="flex items-center gap-2">
          <CircleCheckIcon className="size-4" />
          {getButtonText()}
        </span>
      </Button>

      {txError && (
        <Alert variant="destructive" className="max-w-full">
          <AlertCircle />
          <AlertTitle>Transaction Failed</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            {txError}
          </AlertDescription>
        </Alert>
      )}

      {deployTxHash && !txError && (
        <Alert className="max-w-full">
          <CheckCircle className={isConfirming ? 'animate-pulse' : ''} />
          <AlertTitle>
            {isConfirming ? 'Deploying Subregistry' : 'Subregistry Deployed'}
          </AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            <div className="flex flex-col gap-2">
              <span>
                {isConfirming
                  ? 'Waiting for confirmation...'
                  : 'Deploy transaction confirmed!'}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  Deploy tx hash:
                </span>
                <CopyableRecord
                  value={deployTxHash}
                  href={`https://sepolia.etherscan.io/tx/${deployTxHash}`}
                  className="text-xs"
                  truncate={false}
                />
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {(isSettingSubregistry || setSubregistryTxHash) &&
        !setSubregistryError &&
        !setSubregistryReceiptError &&
        !isSetSubregistryReverted && (
          <Alert className="max-w-full">
            <CheckCircle
              className={
                isSettingSubregistry || isConfirmingSetSubregistry
                  ? 'animate-pulse'
                  : ''
              }
            />
            <AlertTitle>
              {isSettingSubregistry
                ? 'Setting Subregistry'
                : isConfirmingSetSubregistry
                  ? 'Confirming...'
                  : isSetSubregistryConfirmed
                    ? 'Subregistry Set'
                    : 'Setting Subregistry'}
            </AlertTitle>
            <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
              <div className="flex flex-col gap-2">
                <span>
                  {isSettingSubregistry
                    ? 'Please confirm the transaction in your wallet...'
                    : isConfirmingSetSubregistry
                      ? 'Waiting for confirmation...'
                      : isSetSubregistryConfirmed
                        ? 'Subregistry successfully set!'
                        : 'Processing...'}
                </span>
                {setSubregistryTxHash && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      Set subregistry tx hash:
                    </span>
                    <CopyableRecord
                      value={setSubregistryTxHash}
                      href={`https://sepolia.etherscan.io/tx/${setSubregistryTxHash}`}
                      className="text-xs"
                      truncate={false}
                    />
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

      {(setSubregistryError ||
        setSubregistryReceiptError ||
        isSetSubregistryReverted) && (
        <Alert variant="destructive" className="max-w-full">
          <AlertCircle />
          <AlertTitle>Set Subregistry Failed</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            <div className="flex flex-col gap-2">
              <span>
                {setSubregistryError?.message ||
                  setSubregistryReceiptError?.message ||
                  'Transaction reverted - you may not have permission to set the subregistry on this registry.'}
              </span>
              {setSubregistryTxHash && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Tx hash:
                  </span>
                  <CopyableRecord
                    value={setSubregistryTxHash}
                    href={`https://sepolia.etherscan.io/tx/${setSubregistryTxHash}`}
                    className="text-xs"
                    truncate={false}
                  />
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
