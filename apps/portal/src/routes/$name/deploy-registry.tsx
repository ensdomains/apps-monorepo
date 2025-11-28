import type { ChainWithEns } from '@ensdomains/ensjs/chain'
import { deploySubregistry } from '@ensdomains/ensjs/wallet'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowLeftIcon,
  CheckCircle,
  CircleCheckIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { Address, Hash } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hash | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)

  const {
    data: registryData,
    isLoading,
    error: registryError,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  const network = registryData?.network ?? 'sepolia'
  const isNamechain = network === 'namechainSepolia'

  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })
  const ensChain = wagmiConfig.chains.find((c) => c.id === sepolia.id)

  const factoryAddress = isNamechain
    ? namechainVerifiableFactory
    : sepoliaVerifiableFactory

  const implAddress = isNamechain
    ? namechainUserRegistryAddress
    : sepoliaUserRegistryAddress

  const handleSubmit = async () => {
    setTxError(null)
    setTxHash(null)
    setIsConfirmed(false)

    if (!walletClient) {
      setTxError('Wallet not connected')
      return
    }

    if (!walletClient.account) {
      setTxError('No account connected')
      return
    }

    if (!implAddress) {
      setTxError('Implementation address not configured for this network')
      return
    }

    if (!ensChain) {
      setTxError('Chain configuration not found')
      return
    }

    setIsSubmitting(true)

    try {
      const finalFactoryAddress = useCustomRegistry
        ? (contractAddress as Address)
        : factoryAddress

      const client = {
        ...walletClient,
        chain: ensChain as ChainWithEns,
      }

      const hash = await deploySubregistry(client, {
        factoryAddress: finalFactoryAddress,
        implAddress,
        // TODO: Handle migrateSubnames logic
      })

      setTxHash(hash)
      setIsSubmitting(false)
      setIsWaitingConfirmation(true)

      const receipt = await waitForTransactionReceipt(client, {
        hash,
      })

      if (receipt.status === 'success') {
        setIsConfirmed(true)
      } else {
        setTxError('Transaction failed on-chain')
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unknown error occurred while deploying the subregistry'
      setTxError(errorMessage)
    } finally {
      setIsSubmitting(false)
      setIsWaitingConfirmation(false)
    }
  }

  const isSubmitDisabled =
    (useCustomRegistry && contractAddress.trim() === '') ||
    isSubmitting ||
    isWaitingConfirmation ||
    !walletClient

  const getButtonText = () => {
    if (isSubmitting) return 'Submitting...'
    if (isWaitingConfirmation) return 'Waiting for confirmation...'
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

      {txHash && !isConfirmed && !txError && (
        <Alert className="max-w-full">
          <CheckCircle className="animate-pulse" />
          <AlertTitle>Transaction Submitted</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            <div className="flex flex-col gap-2">
              <span>Waiting for confirmation...</span>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Tx hash:</span>
                <CopyableRecord
                  value={txHash}
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  className="text-xs"
                  truncate={false}
                />
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isConfirmed && txHash && (
        <Alert className="max-w-full">
          <CheckCircle />
          <AlertTitle>Transaction Confirmed</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            <div className="flex flex-col gap-2">
              <span>Subregistry successfully deployed!</span>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Tx hash:</span>
                <CopyableRecord
                  value={txHash}
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  className="text-xs"
                  truncate={false}
                />
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
