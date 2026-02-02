import { transactionManager } from '@ens-apps/transaction-manager'
import { getResolver } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, Loader2 } from 'lucide-react'
import { ResultAsync } from 'neverthrow'
import { useDeferredValue, useState } from 'react'
import { match, P } from 'ts-pattern'
import { isAddress, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useAccount, useEnsAddress, useWalletClient } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  type GetEnsOwnerReturnType,
  getEnsOwnerQueryOptions,
} from '@/features/profile/hooks/useEnsOwner'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { prepareCreateSubnameTransaction } from '@/features/registry/utils/create-subname.helpers'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

export const Route = createFileRoute('/$name/create-subname')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

// --- Page Header (shared across states) ---

interface PageHeaderProps {
  readonly name: string
}

const PageHeader = ({ name }: PageHeaderProps) => (
  <div className="flex flex-col gap-2">
    <Link to="/$name/subnames" params={{ name }}>
      <Button
        variant="ghost"
        className="flex items-center gap-1 -ml-2 text-gray-500"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Button>
    </Link>
    <h1 className="text-[30px] font-medium leading-tight">Create subname</h1>
  </div>
)

// --- Form Component (fetches registriesData, handles form) ---

interface CreateSubnameFormProps {
  readonly name: string
}

const CreateSubnameForm = ({ name }: CreateSubnameFormProps) => {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  const [label, setLabel] = useState('')
  const [ownerInput, setOwnerInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const deferredOwnerInput = useDeferredValue(ownerInput)

  // Fetch registries (we know it's v2 at this point)
  const {
    data: registriesData,
    isLoading: registriesLoading,
    error: registriesError,
  } = useQuery(
    getNameRegistriesQueryOptions({ name, network: 'namechainSepolia' }),
  )

  // Resolve owner address (independent, user-input driven)
  const isOwnerInputAddress = isAddress(deferredOwnerInput)
  const {
    data: ensResolvedAddress,
    isLoading: isResolvingOwner,
    error: resolveError,
  } = useEnsAddress({
    name: deferredOwnerInput,
    query: {
      enabled: !!deferredOwnerInput && !isOwnerInputAddress,
    },
  })
  const resolvedOwner = isOwnerInputAddress
    ? deferredOwnerInput
    : ensResolvedAddress

  const subregistryAddress = registriesData?.registries[0]
  const hasSubregistry =
    subregistryAddress && subregistryAddress !== zeroAddress

  const isFormValid =
    label.trim() !== '' && resolvedOwner !== null && !resolveError

  const handleSubmit = async () => {
    if (!hasSubregistry || !resolvedOwner || !walletClient) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    const clientResult = safeGetNamechainSepoliaClient()
    if (clientResult.isErr()) {
      setSubmitError('Failed to get client')
      setIsSubmitting(false)
      return
    }

    const resolverResult = await ResultAsync.fromPromise(
      getResolver(clientResult.value, { name }),
      () => new Error('Failed to get resolver'),
    )

    if (resolverResult.isErr()) {
      setSubmitError(resolverResult.error.message)
      setIsSubmitting(false)
      return
    }

    if (!resolverResult.value) {
      setSubmitError('No resolver found for parent name')
      setIsSubmitting(false)
      return
    }

    const resolverAddress = resolverResult.value

    const intentResult = await prepareCreateSubnameTransaction({
      registryAddress: subregistryAddress,
      label: label.trim(),
      owner: resolvedOwner,
      resolverAddress,
      walletClient,
      chainId: sepolia.id,
    })

    if (intentResult.isErr()) {
      setSubmitError(intentResult.error.message)
      setIsSubmitting(false)
      return
    }

    const signer = createEOASigner(walletClient)
    transactionManager.startTransaction(intentResult.value, signer, {
      chainId: sepolia.id,
      description: `Create subname ${label.trim()}.${name}`,
    })

    navigate({ to: '/$name/subnames', params: { name } })
  }

  if (registriesLoading) {
    return <LoadingMessage title="Loading registry..." />
  }

  if (registriesError) {
    return (
      <ErrorMessage
        title="Failed to load registry data"
        description={registriesError.cause?.message || registriesError.message}
      />
    )
  }

  if (!hasSubregistry) {
    return (
      <div className="flex flex-col gap-6 p-6 w-full max-w-[640px] mx-auto">
        <PageHeader name={name} />
        <p className="text-gray-600">
          This name does not have a subregistry. You must deploy one first to
          create subnames.
        </p>
        <Button asChild variant="secondary" className="w-fit">
          <Link to="/$name/registry" params={{ name }}>
            Deploy subregistry
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 w-full max-w-[640px] mx-auto">
      <PageHeader name={name} />

      <Field>
        <FieldLabel htmlFor="label">Subname</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="label"
            name="label"
            placeholder="subname"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1"
            disabled={isSubmitting}
          />
          <span className="text-base">.{name}</span>
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="owner">Owner</FieldLabel>
        <Input
          id="owner"
          name="owner"
          placeholder="ENS name or HEX address"
          value={ownerInput}
          onChange={(e) => setOwnerInput(e.target.value)}
          disabled={isSubmitting}
        />
        {match({ isResolvingOwner, resolveError, resolvedOwner, ownerInput })
          .with({ isResolvingOwner: true }, () => (
            <p className="text-sm text-gray-500 mt-1">Resolving...</p>
          ))
          .with({ resolveError: P.not(P.nullish) }, () => (
            <p className="text-sm text-red-500 mt-1">
              Could not resolve address
            </p>
          ))
          .with(
            {
              resolvedOwner: P.when(
                (addr) => addr !== null && addr !== ownerInput,
              ),
            },
            ({ resolvedOwner }) => (
              <p className="text-sm text-gray-500 mt-1">
                Resolved to: {resolvedOwner}
              </p>
            ),
          )
          .otherwise(() => null)}
      </Field>

      {match({ isConnected, submitError })
        .with({ isConnected: false }, () => (
          <p className="text-sm text-amber-600">
            Please connect your wallet to create a subname.
          </p>
        ))
        .with({ submitError: P.string.minLength(1) }, ({ submitError }) => (
          <p className="text-sm text-red-500">Error: {submitError}</p>
        ))
        .otherwise(() => null)}

      <Button
        disabled={!isFormValid || isSubmitting || !walletClient || !isConnected}
        className="w-fit"
        onClick={handleSubmit}
      >
        {match(isSubmitting)
          .with(true, () => (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Creating...
            </>
          ))
          .otherwise(() => 'Create subname')}
      </Button>
    </div>
  )
}

// --- Content Component (fetches ownerData, renders form for v2) ---

interface CreateSubnameContentProps {
  readonly name: string
  readonly ownerData: NonNullable<GetEnsOwnerReturnType>
}

const CreateSubnameContent = ({
  name,
  ownerData,
}: CreateSubnameContentProps) => {
  if (ownerData.network !== 'namechainSepolia') {
    return (
      <div className="flex flex-col gap-6 p-6 w-full max-w-[640px] mx-auto">
        <PageHeader name={name} />
        <p className="text-gray-600">
          This feature is only available for ENSv2 names.
        </p>
      </div>
    )
  }

  return <CreateSubnameForm name={name} />
}

// --- Route Component (fetches ownerData) ---

function RouteComponent() {
  const { name } = Route.useParams()

  const {
    data: ownerData,
    isLoading,
    error,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (isLoading) {
    return <LoadingMessage title="Loading..." />
  }

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load name data"
        description={error.cause?.message || error.message}
      />
    )
  }

  if (!ownerData) {
    return <NotFoundMessage />
  }

  return <CreateSubnameContent name={name} ownerData={ownerData} />
}
