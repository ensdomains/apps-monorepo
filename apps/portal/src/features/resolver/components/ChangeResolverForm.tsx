import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ChevronDown, CircleCheckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { isAddress } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DeployTransactionStatus } from '@/features/registry/components/DeployTransactionStatus'
import { useChangeResolver } from '@/features/resolver/hooks/useChangeResolver'
import { useDeployDedicatedResolver } from '@/features/resolver/hooks/useDeployDedicatedResolver'
import { useUserDedicatedResolvers } from '@/features/resolver/hooks/useUserDedicatedResolvers'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { ChangeResolverTransactionStatus } from './ChangeResolverTransactionStatus'

const CHANGE_RESOLVER_TX_ID = 'tx-change-resolver'

function useAutoSelectFirstResolver(
  deployNewResolver: boolean,
  selectedExistingResolver: string,
  existingResolvers: Address[],
  setSelectedExistingResolver: (value: string) => void,
) {
  useEffect(() => {
    if (deployNewResolver) return
    if (selectedExistingResolver) return
    if (existingResolvers.length === 0) return
    setSelectedExistingResolver(existingResolvers[0])
  }, [
    deployNewResolver,
    selectedExistingResolver,
    existingResolvers,
    setSelectedExistingResolver,
  ])
}

const SUCCESS_LABEL_DURATION_MS = 5000

interface ChangeResolverFormProps {
  readonly name: string
  readonly registryAddress: Address
}

export const ChangeResolverForm = ({
  name,
  registryAddress,
}: ChangeResolverFormProps) => {
  const { address: connectedAddress } = useConnection()
  const [useCustomResolver, setUseCustomResolver] = useState(true)
  const [deployNewResolver, setDeployNewResolver] = useState(true)
  const [resolverAddress, setResolverAddress] = useState('')
  const [selectedExistingResolver, setSelectedExistingResolver] = useState('')
  const [showSuccessButtonLabel, setShowSuccessButtonLabel] = useState(false)

  const {
    openModal: openTransactionModal,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  const {
    data: existingResolvers = [],
    isLoading: isLoadingExistingResolvers,
    error: existingResolversError,
  } = useUserDedicatedResolvers({
    senderAddress: connectedAddress,
  })

  const {
    changeResolver,
    changeResolverAsync,
    isPending: isChangeResolverPending,
    isSuccess: isChangeResolverSuccess,
    error: changeResolverError,
    data: changeResolverData,
    hasWallet,
  } = useChangeResolver({
    name,
    registryAddress,
    id: CHANGE_RESOLVER_TX_ID,
  })

  const {
    deployDedicatedResolverAsync,
    txHash: deployTxHash,
    isConfirming: isDeployConfirming,
    isConfirmed: isDeployConfirmed,
    error: deployError,
    hasWallet: hasDeployWallet,
  } = useDeployDedicatedResolver({ name })

  useAutoSelectFirstResolver(
    deployNewResolver,
    selectedExistingResolver,
    existingResolvers,
    setSelectedExistingResolver,
  )

  const isBusy =
    (isChangeResolverPending && !useCustomResolver) || isDeployConfirming

  const handleStartTransaction = () => {
    const resolverToUse = match({ useCustomResolver })
      .with({ useCustomResolver: true }, () =>
        isAddress(resolverAddress) ? (resolverAddress as Address) : null,
      )
      .with({ useCustomResolver: false }, () =>
        isAddress(selectedExistingResolver)
          ? (selectedExistingResolver as Address)
          : null,
      )
      .exhaustive()

    if (!resolverToUse) {
      return
    }

    changeResolver(resolverToUse, {
      onSuccess: () => setShowSuccessButtonLabel(true),
    })
  }

  const handleTransactionDone = () => {
    closeTransactionModal()
    clearTransaction()
    setResolverAddress('')
    setShowSuccessButtonLabel(false)
  }

  const handleSubmit = async () => {
    if (isBusy) return

    try {
      if (useCustomResolver) {
        if (!isAddress(resolverAddress)) return
        openTransactionModal()
        return
      }

      // TODO: use multi step tx modal once the pattern is implemented
      if (deployNewResolver) {
        const deployment = await deployDedicatedResolverAsync()

        await changeResolverAsync(deployment.resolverAddress, {
          onSuccess: () => setShowSuccessButtonLabel(true),
        })

        setTimeout(() => {
          setShowSuccessButtonLabel(false)
        }, SUCCESS_LABEL_DURATION_MS)
        return
      }

      if (!isAddress(selectedExistingResolver)) return
      openTransactionModal()
    } catch (err) {
      console.error('Failed to update resolver:', err)
    }
  }

  const isSubmitDisabled = (() => {
    const walletOk = useCustomResolver ? hasWallet : hasDeployWallet
    if (isBusy || !walletOk) return true

    if (useCustomResolver) {
      return resolverAddress.trim() === '' || !isAddress(resolverAddress)
    }

    if (deployNewResolver) return false

    return (
      selectedExistingResolver.trim() === '' ||
      !isAddress(selectedExistingResolver)
    )
  })()

  const buttonText = match({
    isDeployConfirming,
    isChangeResolverPending,
    showSuccessButtonLabel,
  })
    .with({ isDeployConfirming: true }, () => 'Deploying resolver...')
    .with({ isChangeResolverPending: true }, () => 'Changing resolver...')
    .with({ showSuccessButtonLabel: true }, () => 'Resolver changed!')
    .otherwise(() => 'Save changes')

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/resolver" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-heading font-medium leading-none">Change resolver</h1>

      <div className="flex items-center gap-3">
        <Switch
          checked={useCustomResolver}
          onCheckedChange={setUseCustomResolver}
          id="use-custom-resolver"
        />
        <Label htmlFor="use-custom-resolver" className="cursor-pointer">
          Use custom resolver
        </Label>
      </div>

      {useCustomResolver ? (
        <div className="flex flex-col gap-3">
          <Label
            htmlFor="resolver-address"
            info="Address of the resolver contract to set on this name"
          >
            Contract address
          </Label>
          <Input
            id="resolver-address"
            placeholder="0x..."
            value={resolverAddress}
            onChange={(event) => setResolverAddress(event.target.value)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Switch
              checked={deployNewResolver}
              onCheckedChange={setDeployNewResolver}
              id="deploy-new-dedicated-resolver"
            />
            <Label
              htmlFor="deploy-new-dedicated-resolver"
              className="cursor-pointer"
            >
              Deploy new dedicated resolver
            </Label>
          </div>

          {!deployNewResolver && (
            <div className="flex flex-col gap-3">
              <Label htmlFor="existing-dedicated-resolver">
                Existing dedicated resolver
              </Label>
              <div className="relative">
                <select
                  id="existing-dedicated-resolver"
                  value={selectedExistingResolver}
                  onChange={(event) =>
                    setSelectedExistingResolver(event.target.value)
                  }
                  className="h-9 w-full appearance-none rounded-sm border border-input bg-white px-3 pr-8 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    isLoadingExistingResolvers || existingResolvers.length === 0
                  }
                >
                  <option value="">
                    {isLoadingExistingResolvers
                      ? 'Loading resolvers...'
                      : existingResolvers.length > 0
                        ? 'Select a resolver...'
                        : 'No deployed resolvers found'}
                  </option>
                  {existingResolvers.map((address) => (
                    <option key={address} value={address}>
                      {address}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-quartz-500" />
              </div>
            </div>
          )}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        variant="secondary"
        disabled={isSubmitDisabled}
        className="w-fit"
      >
        <span className="flex items-center gap-2">
          <CircleCheckIcon className="size-4" />
          {buttonText}
        </span>
      </Button>

      {existingResolversError && !deployNewResolver && !useCustomResolver && (
        <ChangeResolverTransactionStatus
          txHash={undefined}
          isConfirming={false}
          isConfirmed={false}
          isReverted={false}
          txError={existingResolversError}
          receiptError={null}
        />
      )}

      <DeployTransactionStatus
        txHash={deployTxHash}
        isConfirming={isDeployConfirming}
        isConfirmed={isDeployConfirmed}
        txError={deployError}
        pendingTitle="Deploying Dedicated Resolver"
        successTitle="Dedicated Resolver Deployed"
        pendingDescription="Waiting for deployment confirmation..."
        successDescription="Dedicated resolver deployed successfully."
        txHashLabel="Deploy tx hash:"
      />

      {deployNewResolver && !useCustomResolver && (
        <ChangeResolverTransactionStatus
          txHash={changeResolverData?.hash}
          isConfirming={isChangeResolverPending}
          isConfirmed={isChangeResolverSuccess}
          isReverted={false}
          txError={changeResolverError}
          receiptError={null}
        />
      )}

      {(useCustomResolver || !deployNewResolver) && (
        <TransactionModal
          transactions={[
            {
              id: CHANGE_RESOLVER_TX_ID,
              title: 'Change resolver',
              transactionName: `Set resolver for ${name}`,
              estimatedGasCost: 0.0001,
              onStart: handleStartTransaction,
              onDone: handleTransactionDone,
            },
          ]}
        />
      )}
    </div>
  )
}
