import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { EditIcon } from 'lucide-react'
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
import { RegistryCard } from '@/features/registry/components/RegistryCard'
import { RegistryCardsGrid } from '@/features/registry/components/RegistryCardsGrid'
import { VerifiedRegistryCard } from '@/features/registry/components/VerifiedRegistryCard'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { namechainVerifiableFactory } from '@/lib/constants/verifiableFactory'
import type { WithEnsNetwork } from '@/utils/types'

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
      <Button variant="outline" className="flex items-center gap-2" asChild>
        <Link to="/$name/deploy-registry" params={{ name }}>
          <EditIcon className="size-4" />
          Deploy registry
        </Link>
      </Button>
    )
  else return null
}

const V1ETHRegistry = ({ tld }: { tld: string }) => {
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

  if (!data) return <div>No V1 ETH Registry data</div>

  return (
    <RegistryCardsGrid label={tld} owner={data.owner} network={data.network} />
  )
}

const ETHRegistry = ({ name, network }: WithEnsNetwork<{ name: string }>) => {
  // biome-ignore lint/style/noNonNullAssertion: tld is always defined for 2ld
  const tld = name.split('.').at(-1)!

  if (network === 'sepolia') return <V1ETHRegistry tld={tld} />
  else return <RegistryCardsGrid label={tld} network={network} />
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
    getNameRegistriesQueryOptions({ name, network: ownerData.network }),
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

  if (!data) return <div>No data</div>

  const subregistryAddress = data.registries.at(-3)

  const ethRegistryAddress = data.registries.at(-2)

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 md:p-6 md:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
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
          return <ETHRegistry name={name} network={data.network} />
        })
        .with(
          { registries: [P.string, P.string, P.string], protocol: 'ENSv2' },
          () => {
            // ["2ld.eth"] on V2
            return (
              <>
                {subregistryAddress !== zeroAddress && <VerifiedRegistryCard />}
                <RegistryCardsGrid
                  label={firstLabel}
                  network={data.network}
                  owner={ownerData.owner}
                />
                {subregistryAddress === zeroAddress ? (
                  <RegistryCard
                    registry={{
                      protocol: data.protocolVersion,
                    }}
                  />
                ) : (
                  <RegistryCard
                    registry={{
                      address: subregistryAddress as Address,
                      protocol: data.protocolVersion,
                      factory: namechainVerifiableFactory,
                    }}
                  />
                )}
                <h2 className="leading-none text-[28px] font-medium">
                  Parent Registry
                </h2>
                <RegistryCardsGrid label={labels[1]} network={data.network} />
                <RegistryCard
                  registry={{
                    address: data.registries.at(-2) as Address,
                    protocol: data.protocolVersion,
                  }}
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
                  network={data.network}
                  owner={ownerData.owner}
                />
                <h2 className="leading-none text-[28px] font-medium">
                  Parent Registry
                </h2>
                <RegistryCardsGrid label={labels[1]} network={data.network} />
                <RegistryCard
                  registry={{
                    address: data.registries.at(-2) as Address,
                    protocol: data.protocolVersion,
                  }}
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
            // ["sub.2ld.eth"] on V2
            return (
              <>
                <RegistryCardsGrid
                  label={firstLabel}
                  network={data.network}
                  owner={ownerData.owner}
                />
                {subsubRegistryAddress === zeroAddress ? null : (
                  <RegistryCard
                    registry={{
                      address: subsubRegistryAddress as Address,
                      protocol: data.protocolVersion,
                      factory: namechainVerifiableFactory,
                    }}
                  />
                )}
                <h2 className="leading-none text-[28px] font-medium">
                  Parent Registry
                </h2>

                <RegistryCardsGrid label={labels[1]} network={data.network} />
                <RegistryCard
                  registry={{
                    address: data.registries.at(-3) as Address,
                    protocol: data.protocolVersion,
                  }}
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
                  network={data.network}
                  owner={ownerData.owner}
                />
                <h2 className="leading-none text-[28px] font-medium">
                  Parent Registry
                </h2>
                <RegistryCardsGrid label={labels[1]} network={data.network} />
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
  if (!ownerData) return <div>No owner data</div>

  return <RegistryInfo name={name} ownerData={ownerData} />
}
