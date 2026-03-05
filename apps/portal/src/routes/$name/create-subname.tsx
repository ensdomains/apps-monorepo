import { getResolver } from '@ensdomains/ensjs/public'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, Loader2 } from 'lucide-react'
import { ResultAsync } from 'neverthrow'
import { type FormEvent, useRef, useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, isAddress, zeroAddress } from 'viem'
import { getEnsAddress } from 'viem/actions'
import { useAccount } from 'wagmi'
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
import { useCreateSubname } from '@/features/registry/hooks/useCreateSubname'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { namechainSepolia, wagmiConfig } from '@/lib/wagmi'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'
import type { EnsNetworkName } from '@/utils/types'

const getClient = () => wagmiConfig.getClient({ chainId: namechainSepolia.id })

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
        className="flex items-center gap-1 -ml-2 text-quartz-500"
      >
        <ArrowLeftIcon className="size-6" />
        Back
      </Button>
    </Link>
    <h1 className="text-[30px] font-medium leading-[1.35]">Create subname</h1>
  </div>
)

// --- Form Component (fetches registriesData, handles form) ---

interface CreateSubnameFormProps {
  readonly name: string
  readonly network: EnsNetworkName
}

const CREATE_SUBNAME_TRANSACTION_ID = 'tx-create-ens-subname'

const CreateSubnameForm = ({ name, network }: CreateSubnameFormProps) => {
  const navigate = useNavigate()
  const { isConnected } = useAccount()

  const [label, setLabel] = useState('')
  const [ownerAddress, setOwnerAddress] = useState<Address | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const [resolverAddress, setResolverAddress] = useState<Address | null>(null)
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    openModal: openTransactionModal,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  const {
    createSubname,
    isPending: isSubmitting,
    isSuccess,
  } = useCreateSubname()

  // Fetch registries (we know it's v2 at this point)
  const {
    data: registriesData,
    isLoading: registriesLoading,
    error: registriesError,
  } = useQuery(getNameRegistriesQueryOptions({ name, network }))

  const subregistryAddress = registriesData?.registries[0]
  const hasSubregistry =
    subregistryAddress && subregistryAddress !== zeroAddress

  const handleStartTransaction = () => {
    if (!hasSubregistry || !ownerAddress || !resolverAddress) return

    createSubname({
      registryAddress: subregistryAddress,
      label: label.trim(),
      owner: ownerAddress,
      resolverAddress,
      parentName: name,
      network,
      id: CREATE_SUBNAME_TRANSACTION_ID,
    })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!e.currentTarget.reportValidity()) {
      return
    }

    if (!hasSubregistry || !ownerAddress) {
      return
    }

    setPrepareError(null)

    const clientResult = safeGetNamechainSepoliaClient()
    if (clientResult.isErr()) {
      setPrepareError('Failed to get client')
      return
    }

    const resolverResult = await ResultAsync.fromPromise(
      getResolver(clientResult.value, { name }),
      () => new Error('Failed to get resolver'),
    )

    if (resolverResult.isErr()) {
      setPrepareError(resolverResult.error.message)
      return
    }

    if (!resolverResult.value) {
      setPrepareError('No resolver found for parent name')
      return
    }

    setResolverAddress(resolverResult.value)
    openTransactionModal()
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
      <div className="flex flex-col gap-6 px-4 py-4 sm:py-6 w-full max-w-[640px] mx-auto">
        <PageHeader name={name} />
        <p className="text-quartz-500">
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
    <div className="flex flex-col gap-6 px-4 py-4 sm:py-6 w-full max-w-[640px] mx-auto">
      <PageHeader name={name} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
              disabled={isSubmitting || isSuccess}
              required
            />
            <span className="text-base">.{name}</span>
          </div>
        </Field>

        <Field data-invalid={!ownerAddress}>
          <FieldLabel htmlFor="owner">Owner</FieldLabel>
          <Input
            id="owner"
            name="owner"
            placeholder="ENS name or HEX address"
            required
            disabled={isSubmitting || isSuccess}
            pattern="(?:[\u002DA-Za-z0-9]+[.][A-Za-z]+|0x[a-fA-F0-9]{40})"
            onChange={(e) => {
              setResolveError(null)

              if (resolveTimeoutRef.current) {
                clearTimeout(resolveTimeoutRef.current)
              }

              if (e.currentTarget.checkValidity()) {
                const nameOrAddress = e.currentTarget.value as Address

                if (isAddress(nameOrAddress)) {
                  setOwnerAddress(nameOrAddress)
                } else {
                  setOwnerAddress(null)
                  resolveTimeoutRef.current = setTimeout(() => {
                    ResultAsync.fromPromise(
                      getEnsAddress(getClient(), {
                        name: nameOrAddress,
                        universalResolverAddress:
                          '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce',
                      }),
                      (error) =>
                        error instanceof Error
                          ? error
                          : new Error('Failed to resolve ENS name'),
                    ).match(
                      (address) => {
                        setOwnerAddress(address)
                        if (!address) {
                          setResolveError(
                            `Could not resolve address for ${nameOrAddress}`,
                          )
                        }
                      },
                      (error) => {
                        setOwnerAddress(null)
                        setResolveError(error.message)
                      },
                    )
                  }, 500)
                }
              } else {
                setOwnerAddress(null)
              }
            }}
          />
        </Field>

        {match({ isConnected, prepareError, resolveError })
          .with({ isConnected: false }, () => (
            <p className="text-sm text-amber-600">
              Please connect your wallet to create a subname.
            </p>
          ))
          .with({ resolveError: P.string.minLength(1) }, ({ resolveError }) => (
            <p className="text-sm text-red-500">Error: {resolveError}</p>
          ))
          .with({ prepareError: P.string.minLength(1) }, ({ prepareError }) => (
            <p className="text-sm text-red-500">Error: {prepareError}</p>
          ))
          .otherwise(() => null)}

        <Button
          type="submit"
          disabled={!ownerAddress || !isConnected}
          className="w-full sm:w-fit"
        >
          {match({ isSubmitting, isSuccess })
            .with({ isSubmitting: true }, () => (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Creating...
              </>
            ))
            .with({ isSuccess: true }, () => 'Transaction Complete')
            .otherwise(() => 'Create subname')}
        </Button>
      </form>

      <TransactionModal
        transactions={[
          {
            id: CREATE_SUBNAME_TRANSACTION_ID,
            title: 'Create subname',
            transactionName: `Create ${label.trim()}.${name}`,
            estimatedGasCost: 0.0002,
            onStart: handleStartTransaction,
            onDone: () => {
              closeTransactionModal()
              clearTransaction()
              navigate({ to: '/$name/subnames', params: { name } })
            },
          },
        ]}
      />
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
      <div className="flex flex-col gap-6 px-4 py-4 sm:py-6 w-full max-w-[640px] mx-auto">
        <PageHeader name={name} />
        <p className="text-quartz-500">
          This feature is only available for ENSv2 names.
        </p>
      </div>
    )
  }

  return <CreateSubnameForm name={name} network={ownerData.network} />
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
