import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeftIcon, CircleCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { isAddress, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { ChangeResolverTransactionStatus } from '@/features/resolver/components/ChangeResolverTransactionStatus'
import { useChangeResolver } from '@/features/resolver/hooks/useChangeResolver'

export const Route = createFileRoute('/$name/change-resolver')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { address: connectedAddress } = useConnection()
  const [resolverAddress, setResolverAddress] = useState('')

  const {
    data: registryData,
    isLoading,
    error: registryError,
  } = useQuery(
    getNameRegistriesQueryOptions({ name, network: 'namechainSepolia' }),
  )

  const label = name.split('.')[0]
  const currentNameRegistry = registryData?.registries.at(-2) ?? null

  // Check if connected user has ROLE_SET_RESOLVER permission
  const { data: hasSetResolverRole, isLoading: isLoadingRoleCheck } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: currentNameRegistry ?? zeroAddress,
      label,
      roles: ['ROLE_SET_RESOLVER'],
      account: connectedAddress ?? zeroAddress,
    }),
    enabled:
      !!connectedAddress &&
      !!currentNameRegistry &&
      currentNameRegistry !== zeroAddress &&
      !isLoading,
  })

  // Change resolver mutation
  const {
    changeResolver,
    txHash,
    isWriting,
    isConfirming,
    isConfirmed,
    isReverted,
    writeError,
    receiptError,
  } = useChangeResolver({
    name,
    registryAddress: currentNameRegistry ?? zeroAddress,
  })

  const handleSubmit = async () => {
    if (!isAddress(resolverAddress)) {
      return
    }
    try {
      await changeResolver(resolverAddress as Address)
    } catch (error) {
      console.error('Failed to change resolver:', error)
    }
  }

  const isSubmitDisabled =
    resolverAddress.trim() === '' ||
    !isAddress(resolverAddress) ||
    isWriting ||
    isConfirming

  const getButtonText = () =>
    match({ isWriting, isConfirming, isConfirmed })
      .with({ isWriting: true }, () => 'Submitting transaction...')
      .with({ isConfirming: true }, () => 'Confirming...')
      .with({ isConfirmed: true }, () => 'Resolver changed!')
      .otherwise(() => 'Change resolver')

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
        <Link to="/$name/resolver" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium leading-none">
          Change resolver
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

  // V1 names cannot change resolver through this flow
  if (registryData?.protocolVersion === 'ENSv1') {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <Link to="/$name/resolver" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium leading-none">
          Change resolver
        </h1>
        <Alert className="max-w-full">
          <AlertCircle />
          <AlertTitle>Not Available for V1 Names</AlertTitle>
          <AlertDescription className="break-all whitespace-normal max-w-full overflow-wrap-anywhere">
            V1 names (like {name}) use a different resolver management system.
            Please use the V1 ENS interface to change the resolver.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Check if user has permission to change resolver
  if (isLoadingRoleCheck) {
    return <LoadingSpinner title="Checking permissions..." />
  }

  if (connectedAddress && !hasSetResolverRole) {
    return (
      <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
        <Link to="/$name/resolver" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium leading-none">
          Change resolver
        </h1>
        <ErrorMessage
          title="Permission Denied"
          description={
            <>
              You don't have the required{' '}
              <code className="font-mono text-sm bg-gray-100 px-1 py-0.5 rounded">
                ROLE_SET_RESOLVER
              </code>{' '}
              permission to change the resolver for <strong>{name}</strong>.
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
        <Link to="/$name/resolver" params={{ name }}>
          <Button variant="ghost" className="flex items-center gap-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-[28px] font-medium leading-none">
          Change resolver
        </h1>
        <ErrorMessage
          title="Wallet Not Connected"
          description="Please connect your wallet to change the resolver."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/resolver" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-[28px] font-medium leading-none">Change resolver</h1>

      {/* Resolver Address Input */}
      <div className="flex flex-col gap-3">
        <Label
          htmlFor="resolver-address"
          info="The address of the resolver contract"
        >
          Resolver address
        </Label>
        <Input
          id="resolver-address"
          placeholder="0x... or ENS name"
          value={resolverAddress}
          onChange={(e) => setResolverAddress(e.target.value)}
        />
      </div>

      {/* Submit Button */}
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

      {/* Transaction Status */}
      <ChangeResolverTransactionStatus
        txHash={txHash}
        isConfirming={isConfirming}
        isConfirmed={isConfirmed}
        isReverted={isReverted}
        txError={writeError}
        receiptError={receiptError}
      />
    </div>
  )
}
