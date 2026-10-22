import { isTimeTravelEnabled } from '@ens-apps/dev-time-travel'
import { scopeTransactionId } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeftIcon,
  Clock,
  Loader2,
  Lock,
  ShieldX,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { match, P } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { normalize } from 'viem/ens'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MessageCard } from '@/components/ui/message-card'
import { AddressNameInput } from '@/features/address/components/AddressNameInput'
import { useAddressResolution } from '@/features/address/hooks/useAddressResolution'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getIsSubnameTakenQueryOptions } from '@/features/profile/hooks/useSubnames'
import { prepareCreateSubnameSubmit } from '@/features/registry/helpers/prepareCreateSubnameSubmit'
import { useCreateSubname } from '@/features/registry/hooks/useCreateSubname'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import {
  type CreateSubnameTarget,
  type CreateSubnameWrite,
  getV1SubnameCreateGate,
  prepareCreateSubnameTransaction,
} from '@/features/registry/utils/create-subname.helpers'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { getLabelRegistrationError } from '@/utils/token/isNormalized'

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
        className="flex items-center gap-1 -ml-2 text-muted-foreground"
      >
        <ArrowLeftIcon className="size-6" />
        Back
      </Button>
    </Link>
    <PageHeading parent={{ type: 'name', name }}>Create subname</PageHeading>
  </div>
)

function useSyncOwnerWithConnectedAddress(
  connectedAddress: Address | undefined,
  hasUserEdited: React.RefObject<boolean>,
  setOwnerInput: (value: string) => void,
) {
  useEffect(() => {
    if (connectedAddress && !hasUserEdited.current) {
      setOwnerInput(connectedAddress)
    }
  }, [connectedAddress, hasUserEdited, setOwnerInput])
}

interface CreateSubnameFormProps {
  readonly name: string
  readonly target: CreateSubnameTarget
}

const CREATE_SUBNAME_TRANSACTION_ID = 'tx-create-ens-subname'
const LABEL_LOOKUP_DEBOUNCE_MS = 300

// One-year (in seconds) default expiry, matching ensjs'
// `createSubnameWriteParameters` default. When time-travel is active Anvil's
// block time can be far ahead of `Date.now()`, so use a 100-year window to
// ensure the expiry is never stale on-chain.
const ONE_YEAR_SECONDS = 31536000n
const HUNDRED_YEARS_SECONDS = 3153600000n

const computeSubnameExpires = (): bigint => {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  return isTimeTravelEnabled()
    ? nowSeconds + HUNDRED_YEARS_SECONDS
    : nowSeconds + ONE_YEAR_SECONDS
}

const CreateSubnameForm = ({ name, target }: CreateSubnameFormProps) => {
  const navigate = useNavigate()
  const { address: connectedAddress, isConnected } = useConnection()

  const [label, setLabel] = useState('')
  const [ownerInput, setOwnerInput] = useState(connectedAddress ?? '')
  const [prepareError, setPrepareError] = useState<string | null>(null)
  // Settled at submit: V1 after the label recheck, V2 with the parent's resolver.
  const [write, setWrite] = useState<CreateSubnameWrite | null>(null)
  // A stable expiry for the pre-start gas estimate. Gas is independent of the
  // expiry value, so this need not match the fresh one the submit computes — it
  // just has to be stable across renders so the estimate query doesn't churn.
  const estimateExpires = useMemo(() => computeSubnameExpires(), [])
  const hasUserEditedOwner = useRef(false)

  const ownerResolution = useAddressResolution(ownerInput)
  const ownerAddress = ownerResolution.address
  const ownerInvalid =
    ownerResolution.status === 'invalid' ||
    ownerResolution.status === 'unresolved' ||
    ownerResolution.status === 'error'

  useSyncOwnerWithConnectedAddress(
    connectedAddress,
    hasUserEditedOwner,
    setOwnerInput,
  )

  const { closeModal: closeTransactionModal, clearTransaction } =
    useTransactionModal()

  // Names the attempt the modal is showing, so a run abandoned mid-flight can't
  // leave a settled actor under the fixed id the next attempt would look up.
  const attempt = useFlowAttempt()
  const createSubnameTxId = scopeTransactionId(
    CREATE_SUBNAME_TRANSACTION_ID,
    attempt.scope,
  )

  const {
    createSubname,
    isPending: isSubmitting,
    isSuccess,
  } = useCreateSubname()

  const trimmedLabel = label.trim()
  const labelError = getLabelRegistrationError(trimmedLabel)
  // One lookup per pause in typing, not per keystroke.
  const lookupLabel = useDebouncedValue(trimmedLabel, LABEL_LOOKUP_DEBOUNCE_MS)
  const isLookupCurrent = lookupLabel === trimmedLabel

  // Asked about the one label rather than read off the list: a name can hold
  // thousands of subnames, and the list is only ever loaded a page at a time.
  const labelTakenQuery = useQuery({
    ...getIsSubnameTakenQueryOptions({
      name,
      label: lookupLabel,
      protocolVersion: target.protocol,
    }),
    enabled: Boolean(lookupLabel) && !getLabelRegistrationError(lookupLabel),
  })
  const isLabelTaken = isLookupCurrent && labelTakenQuery.data === true
  const hasLookupFailed = isLookupCurrent && labelTakenQuery.isError
  // V1 `setSubnodeRecord` overwrites an existing subname, so it waits for a
  // settled answer; a taken V2 label just reverts.
  const isAvailabilityUnknown =
    target.protocol === 'ENSv1' &&
    !(isLookupCurrent && labelTakenQuery.isSuccess)

  const handleStartTransaction = () => {
    if (!ownerAddress || !write || labelError) {
      return
    }

    createSubname({
      write,
      label: label.trim(),
      owner: ownerAddress,
      parentName: name,
      id: createSubnameTxId,
      expires: computeSubnameExpires(),
    })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!e.currentTarget.reportValidity()) {
      return
    }

    if (!ownerAddress) {
      return
    }

    setPrepareError(null)

    const writeResult = await prepareCreateSubnameSubmit({
      name,
      label: trimmedLabel,
      target,
    })
    if (writeResult.isErr()) {
      setPrepareError(writeResult.error.message)
      return
    }

    setWrite(writeResult.value)
    if (connectedAddress) attempt.start(connectedAddress)
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-160 mx-auto">
      <PageHeader name={name} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field data-invalid={isLabelTaken || Boolean(labelError)}>
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
          {isLabelTaken && (
            <p className="text-p text-danger">
              {trimmedLabel}.{name} is already registered.
            </p>
          )}
          {labelError && <p className="text-p text-danger">{labelError}</p>}
          {hasLookupFailed && (
            <div className="flex items-center gap-2">
              <p className="text-p text-danger">
                Could not check whether {trimmedLabel}.{name} is already
                registered.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => labelTakenQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
        </Field>

        <Field data-invalid={ownerInvalid}>
          <FieldLabel htmlFor="owner">Owner</FieldLabel>
          <AddressNameInput
            id="owner"
            name="owner"
            placeholder="ENS name or HEX address"
            required
            disabled={isSubmitting || isSuccess}
            value={ownerInput}
            onChange={(value) => {
              hasUserEditedOwner.current = true
              setOwnerInput(value)
            }}
            resolution={ownerResolution}
          />
        </Field>

        {match({ isConnected, prepareError })
          .with({ isConnected: false }, () => (
            <p className="text-p text-warning">
              Please connect your wallet to create a subname.
            </p>
          ))
          .with({ prepareError: P.string.minLength(1) }, ({ prepareError }) => (
            <p className="text-p text-danger">Error: {prepareError}</p>
          ))
          .otherwise(() => null)}

        <Button
          type="submit"
          disabled={
            !ownerAddress ||
            !isConnected ||
            isLabelTaken ||
            isAvailabilityUnknown ||
            Boolean(labelError)
          }
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
            id: createSubnameTxId,
            title: 'Create subname',
            transactionName: `Create ${label.trim()}.${name}`,
            // The prepared createSubname transaction for the pre-start gas
            // estimate. Undefined until the form is ready (write settled,
            // owner set) — the modal shows "Estimating…" until then.
            intent: {
              prepare:
                ownerAddress && write
                  ? ({ walletClient, chainId }) =>
                      prepareCreateSubnameTransaction({
                        write,
                        parentName: name,
                        label: label.trim(),
                        owner: ownerAddress,
                        walletClient,
                        chainId,
                        expires: estimateExpires,
                      })
                  : undefined,
            },
            onStart: handleStartTransaction,
            onDone: () => {
              closeTransactionModal()
              clearTransaction()
              attempt.end()
              navigate({
                to: '/$name',
                params: { name: `${trimmedLabel}.${name}` },
              })
            },
          },
        ]}
      />
    </div>
  )
}

// --- V2: the subname goes on the parent's subregistry ---

interface CreateSubnameContentProps {
  readonly name: string
}

const V2CreateSubname = ({ name }: CreateSubnameContentProps) => {
  const {
    data: registriesData,
    isLoading,
    error,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  if (isLoading) {
    return <LoadingMessage />
  }

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load registry data"
        description={error.cause?.message || error.message}
      />
    )
  }

  const subregistryAddress = registriesData?.[0]

  if (!subregistryAddress || subregistryAddress === zeroAddress) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-160 mx-auto">
        <PageHeader name={name} />
        <p className="text-muted-foreground">
          This name does not have a subregistry. You must deploy one first to
          create subnames.
        </p>
        <Button asChild variant="default" className="w-fit">
          <Link to="/$name/registry" params={{ name }}>
            Deploy subregistry
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <CreateSubnameForm
      name={name}
      target={{ protocol: 'ENSv2', registryAddress: subregistryAddress }}
    />
  )
}

// --- V1: setSubnodeRecord on the registry, or the NameWrapper if wrapped ---

const V1CreateSubname = ({ name: rawName }: CreateSubnameContentProps) => {
  const { address: connectedAddress } = useConnection()
  // `staleTime: 0`: the ownership pages prime this entry, and a name that has
  // since lapsed into grace must not pass the gate on a cached read.
  const stateQuery = useQuery({
    ...getV1NameStateQueryOptions({ name: rawName }),
    staleTime: 0,
  })

  if (stateQuery.isLoading) return <LoadingMessage />

  if (stateQuery.isError)
    return (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Couldn’t check this name"
        description={
          <p>
            We couldn’t read how this name is held, so we can’t tell whether
            subnames can be created under it. Refresh and try again.
          </p>
        }
      />
    )

  // Can't throw: the query already normalised the same input, and every V1
  // hash and write below must use the normalised form.
  const name = normalize(rawName)
  const gate = stateQuery.data
    ? getV1SubnameCreateGate(stateQuery.data, connectedAddress)
    : ({ reason: 'unowned' } as const)

  return match(gate)
    .with({ reason: 'ok' }, ({ target }) => (
      <CreateSubnameForm name={name} target={target} />
    ))
    .with({ reason: 'grace' }, () => (
      <MessageCard
        icon={<Clock className="size-8" />}
        title="This name is in its grace period"
        description={
          <p>
            Its registration has lapsed, so no subnames can be created under it
            until it is renewed.
          </p>
        }
        actionButton={{
          label: 'Go to ownership',
          href: `/${name}/ownership`,
          variant: 'outline',
        }}
      />
    ))
    .with({ reason: 'unowned' }, () => (
      <MessageCard
        icon={<AlertTriangle className="size-8" />}
        title="Nobody holds this name"
        description={
          <p>
            It has expired, so there is no owner who could create subnames under
            it.
          </p>
        }
      />
    ))
    .with({ reason: 'burned-fuse' }, () => (
      <MessageCard
        icon={<Lock className="size-8" />}
        title="Subnames are locked"
        description={
          <p>
            This name has burned{' '}
            <span className="font-mono">CANNOT_CREATE_SUBDOMAIN</span>, so no
            new subnames can be created under it.
          </p>
        }
      />
    ))
    .with({ reason: 'not-holder' }, () => (
      <MessageCard
        icon={<ShieldX className="size-8" />}
        title="Only its owner can create subnames"
        description={
          <p>
            The connected wallet doesn’t hold this name. Switch to the wallet
            that owns it to create subnames under it.
          </p>
        }
      />
    ))
    .exhaustive()
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
    return <LoadingMessage />
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

  return ownerData.protocolVersion === 'ENSv1' ? (
    <V1CreateSubname name={name} />
  ) : (
    <V2CreateSubname name={name} />
  )
}
