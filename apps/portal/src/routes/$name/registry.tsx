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
import type { ProtocolVersion } from '@/utils/types'
import { EditNoteIcon } from '../../assets/icons'
import { NotFoundMessage } from '../../components/NotFoundMessage'

const namechainVerifiableFactory = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
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

const V1ETHRegistry = ({
  tld,
  protocolVersion,
}: {
  tld: string
  protocolVersion: ProtocolVersion
}) => {
  const { data, isLoading, error } = useQuery(
    getEnsOwnerQueryOptions({ name: tld }),
  )

  if (isLoading) return <LoadingSpinner title="Loading ETH registry data" />

  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.cause.message}
      />
    )

  if (!data) return null

  return (
    <RegistryCardsGrid
      label={tld}
      protocol={protocolVersion}
      owner={data.owner}
    />
  )
}

const ETHRegistry = ({
  name,
  protocolVersion,
}: {
  name: string
  protocolVersion: ProtocolVersion
}) => {
  // biome-ignore lint/style/noNonNullAssertion: tld is always defined for 2ld
  const tld = name.split('.').at(-1)!

  if (protocolVersion === 'ENSv1')
    return <V1ETHRegistry tld={tld} protocolVersion={protocolVersion} />
  else return <RegistryCardsGrid label={tld} protocol={protocolVersion} />
}

const RegistryInfo = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const labels = name.split('.')
  const firstLabel = labels[0]

  const { data, isLoading, error } = useQuery(
    getNameRegistriesQueryOptions({ name }),
  )

  const { address: account } = useConnection()

  if (isLoading) return <LoadingSpinner title="Loading registry info" />
  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.message || error.cause.message}
      />
    )

  if (!data) return null

  const subregistryAddress = data.registries.at(-3)

  const ethRegistryAddress = data.registries.at(-2)

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 sm:p-6 sm:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-medium leading-none">Registry</h1>
        {ethRegistryAddress &&
          account &&
          labels.length === 2 &&
          subregistryAddress && ( // as long as it returns one, even if zero
            <DeploySubregistryButton
              name={name}
              registryAddress={ethRegistryAddress}
              label={firstLabel}
              account={account}
            />
          )}
      </div>

      {match({
        registries: data.registries,
        protocol: data.protocolVersion,
      })
        .with({ registries: [P.string, P.string] }, () => {
          // ["eth"]
          return (
            <ETHRegistry name={name} protocolVersion={data.protocolVersion} />
          )
        })
        .with(
          { registries: [P.string, P.string, P.string], protocol: 'ENSv2' },
          () => {
            // ["2ld.eth"] on V2
            const hasSubregistry = subregistryAddress !== zeroAddress
            return (
              <>
                {hasSubregistry && <VerifiedRegistryCard />}
                <RegistryCardsGrid
                  label={firstLabel}
                  protocol={data.protocolVersion}
                  owner={ownerData.owner}
                  contractAddress={
                    hasSubregistry ? (subregistryAddress as Address) : undefined
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
                  protocol={data.protocolVersion}
                  contractAddress={data.registries.at(-2) as Address}
                  chainId={chainId}
                />
              </>
            )
          },
        )
        .with(
          { registries: [P.string, P.string, P.string], protocol: 'ENSv1' },
          () => {
            return (
              <>
                <RegistryCardsGrid
                  label={firstLabel}
                  protocol={data.protocolVersion}
                  owner={ownerData.owner}
                />
                <h2 className="leading-none text-heading font-medium">
                  Parent Registry
                </h2>
                <RegistryCardsGrid
                  label={labels[1]}
                  protocol={data.protocolVersion}
                  contractAddress={data.registries.at(-2) as Address}
                  chainId={chainId}
                />
              </>
            )
          },
        )
        .with(
          {
            registries: [P.string, P.string, P.string, P.string],
            protocol: 'ENSv2',
          },
          () => {
            const subsubRegistryAddress = data.registries.at(-4)
            const hasSubsubRegistry =
              subsubRegistryAddress && subsubRegistryAddress !== zeroAddress
            // ["sub.2ld.eth"] on V2
            return (
              <>
                <RegistryCardsGrid
                  label={firstLabel}
                  protocol={data.protocolVersion}
                  owner={ownerData.owner}
                  contractAddress={
                    hasSubsubRegistry
                      ? (subsubRegistryAddress as Address)
                      : undefined
                  }
                  factoryAddress={
                    hasSubsubRegistry ? namechainVerifiableFactory : undefined
                  }
                  chainId={chainId}
                />
                <h2 className="leading-none text-heading font-medium">
                  Parent Registry
                </h2>
                <RegistryCardsGrid
                  label={labels[1]}
                  protocol={data.protocolVersion}
                  contractAddress={data.registries.at(-3) as Address}
                  chainId={chainId}
                />
              </>
            )
          },
        )
        .with(
          {
            registries: [P.string, P.string, P.string, P.string],
            protocol: 'ENSv1',
          },
          () => {
            // ["sub.2ld.eth"]
            return (
              <>
                <RegistryCardsGrid
                  label={firstLabel}
                  protocol={data.protocolVersion}
                  owner={ownerData.owner}
                />
                <h2 className="leading-none text-heading font-medium">
                  Parent Registry
                </h2>
                <RegistryCardsGrid
                  label={labels[1]}
                  protocol={data.protocolVersion}
                />
              </>
            )
          },
        )
        .run()}
      {data.protocolVersion === 'ENSv1' && (
        <NameSubgraphHistory name={name} category="registration" />
      )}
    </div>
  )
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
