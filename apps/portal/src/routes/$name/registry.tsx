import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { Button } from '@/components/ui/button'
import {
  type GetEnsOwnerReturnType,
  getEnsOwnerQueryOptions,
} from '@/features/profile/hooks/useEnsOwner'
import { RegistryCardsGrid } from '@/features/registry/components/RegistryCardsGrid'
import { VerifiedRegistryCard } from '@/features/registry/components/VerifiedRegistryCard'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { sepoliaWithEns } from '@/lib/wagmi'
import { EditNoteIcon } from '../../assets/icons'
import { NotFoundMessage } from '../../components/NotFoundMessage'

const namechainVerifiableFactory = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
})

const v1LegacyRegistryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

const chainId = sepoliaWithEns.id

export const Route = createFileRoute('/$name/registry')({
  component: RouteComponent,
})

const DeploySubregistryButton = ({
  registryAddress,
  label,
  name,
  account,
}: {
  registryAddress: Address
  label: string
  name: string
  account: Address
}) => {
  const { data: hasSetSubregistryRole } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress,
      label,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account,
    }),
  })

  if (hasSetSubregistryRole)
    return (
      <Button variant="default" className="flex items-center gap-2" asChild>
        <Link to="/$name/deploy-registry" params={{ name }}>
          <EditNoteIcon className="size-4" />
          Deploy registry
        </Link>
      </Button>
    )
  else return null
}

const V1RegistryInfo = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const labels = name.split('.')
  const firstLabel = labels[0]

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 sm:p-6 sm:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-medium leading-none">Registry</h1>
      </div>

      {/* V1 names have no per-name subregistry contract */}
      <RegistryCardsGrid
        label={firstLabel}
        protocol={ownerData.protocolVersion}
        owner={ownerData.owner}
      />
      <h2 className="leading-none text-heading font-medium">Parent Registry</h2>
      <RegistryCardsGrid
        label={labels[1]}
        protocol={ownerData.protocolVersion}
        contractAddress={v1LegacyRegistryAddress}
        chainId={chainId}
      />

      <NameSubgraphHistory name={name} category="registration" />
    </div>
  )
}

export const V2RegistryInfo = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const labels = name.split('.')
  const firstLabel = labels[0]

  const {
    data: registries,
    isLoading,
    error,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  const { address: account } = useConnection()

  if (isLoading) return <LoadingSpinner title="Loading registry info" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.message || error.cause.message}
      />
    )

  if (!registries) return null

  // findRegistries returns `[name's subregistry, ...ancestors..., root]`
  // per LibRegistry.sol. For any depth ≥ 2LD:
  //   - registries[0] is the name's own subregistry slot (may be zero).
  //   - registries[1] is the immediate parent registry — the one that
  //     holds this name's label and that the role check / deploy flow
  //     target. The .eth registry happens to be at registries[1] for
  //     2LDs; for deeper names it sits further along the array.
  const nameSubregistry = registries.at(0)
  const parentRegistry = registries.at(1)

  const hasNameSubregistry =
    nameSubregistry !== undefined && nameSubregistry !== zeroAddress

  // TLDs are redirected to /tld/$tld before this route, so labels.length is
  // always ≥ 2 here. 2LDs get the VerifiedRegistryCard above the grid; deeper
  // names use the same layout but without the verified-card highlight.
  const is2LD = labels.length === 2

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 sm:p-6 sm:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-medium leading-none">Registry</h1>
        {parentRegistry &&
          parentRegistry !== zeroAddress &&
          account &&
          nameSubregistry !== undefined && ( // as long as it returns one, even if zero
            <DeploySubregistryButton
              name={name}
              registryAddress={parentRegistry}
              label={firstLabel}
              account={account}
            />
          )}
      </div>

      {is2LD && hasNameSubregistry && <VerifiedRegistryCard />}

      <RegistryCardsGrid
        label={firstLabel}
        protocol={ownerData.protocolVersion}
        owner={ownerData.owner}
        contractAddress={
          hasNameSubregistry ? (nameSubregistry as Address) : undefined
        }
        factoryAddress={
          hasNameSubregistry ? namechainVerifiableFactory : undefined
        }
        chainId={chainId}
      />

      {parentRegistry && (
        <>
          <h2 className="leading-none text-heading font-medium">
            Parent Registry
          </h2>
          <RegistryCardsGrid
            label={labels[1]}
            protocol={ownerData.protocolVersion}
            contractAddress={parentRegistry}
            chainId={chainId}
          />
        </>
      )}
    </div>
  )
}

const RegistryInfo = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  if (ownerData.protocolVersion === 'ENSv1') {
    return <V1RegistryInfo name={name} ownerData={ownerData} />
  }
  return <V2RegistryInfo name={name} ownerData={ownerData} />
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/registry' })

  const {
    isLoading,
    error,
    data: ownerData,
  } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.cause.message}
      />
    )
  if (isLoading) return <LoadingSpinner title="Loading owner info" />
  if (!ownerData)
    return (
      <NotFoundMessage
        title="Name not registered"
        description={
          <>
            <strong>{name}</strong> is not registered, so there is no registry
            data to display.
          </>
        }
      />
    )

  return <RegistryInfo name={name} ownerData={ownerData} />
}
