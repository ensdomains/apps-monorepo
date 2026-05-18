import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { match, P } from 'ts-pattern'
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

  // The name's own subregistry slot. Always at(0) — may be zeroAddress when
  // not yet deployed. Defined for 2LD, 3LD, 4LD shapes (i.e. anything where
  // the user could deploy a subregistry for this name).
  const nameSubregistry = registries.at(0)

  // Immediate parent registry — the registry that holds the label for this
  // name. Same value used by /$name/deploy-registry (deploy-registry.tsx:61)
  // so the deploy button targets the registry that the role check authorises.
  const parentRegistry = registries.at(1)

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 sm:p-6 sm:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-medium leading-none">Registry</h1>
        {parentRegistry &&
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

      {match(registries)
        .with([P.string, P.string, P.string], () => {
          // ["2ld.eth"] on V2
          const hasSubregistry = nameSubregistry !== zeroAddress
          return (
            <>
              {hasSubregistry && <VerifiedRegistryCard />}
              <RegistryCardsGrid
                label={firstLabel}
                protocol={ownerData.protocolVersion}
                owner={ownerData.owner}
                contractAddress={
                  hasSubregistry ? (nameSubregistry as Address) : undefined
                }
                factoryAddress={
                  hasSubregistry ? namechainVerifiableFactory : undefined
                }
                chainId={chainId}
              />
              <h2 className="leading-none text-heading font-medium">
                Parent Registry
              </h2>
              <RegistryCardsGrid
                label={labels[1]}
                protocol={ownerData.protocolVersion}
                contractAddress={registries.at(-2) as Address}
                chainId={chainId}
              />
            </>
          )
        })
        .with([P.string, P.string, P.string, P.string], () => {
          // ["sub.2ld.eth"] on V2 — 3LD
          const hasNameSubregistry =
            nameSubregistry !== undefined && nameSubregistry !== zeroAddress
          return (
            <>
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
              <h2 className="leading-none text-heading font-medium">
                Parent Registry
              </h2>
              <RegistryCardsGrid
                label={labels[1]}
                protocol={ownerData.protocolVersion}
                contractAddress={registries.at(-3) as Address}
                chainId={chainId}
              />
            </>
          )
        })
        .with([P.string, P.string, P.string, P.string, P.string], () => {
          // ["subsub.sub.2ld.eth"] on V2 — 4LD
          const hasNameSubregistry =
            nameSubregistry !== undefined && nameSubregistry !== zeroAddress
          return (
            <>
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
              <h2 className="leading-none text-heading font-medium">
                Parent Registry
              </h2>
              <RegistryCardsGrid
                label={labels[1]}
                protocol={ownerData.protocolVersion}
                contractAddress={registries.at(-4) as Address}
                chainId={chainId}
              />
            </>
          )
        })
        .otherwise(() => null)}
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
