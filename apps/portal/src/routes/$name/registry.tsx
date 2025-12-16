import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { EditIcon } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/molecules/ErrorMessage'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
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
    enabled: name.split('.').length === 2,
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
    <>
      <h2 className="text-[28px] font-medium leading-none">Parent registry</h2>
      <RegistryCardsGrid
        label={tld}
        owner={data.owner}
        network={data.network}
      />
    </>
  )
}

const ETHRegistry = ({ name, network }: WithEnsNetwork<{ name: string }>) => {
  // biome-ignore lint/style/noNonNullAssertion: tld is always defined for 2ld
  const tld = name.split('.').at(-1)!

  if (network === 'sepolia') return <V1ETHRegistry tld={tld} />
  else
    return (
      <>
        <h2 className="text-[28px] font-medium leading-none">
          Parent registry
        </h2>
        <RegistryCardsGrid label={tld} network={network} />
      </>
    )
}

const RegistryInfo = ({
  name,
  ownerData,
}: {
  name: string
  ownerData: NonNullable<GetEnsOwnerReturnType>
}) => {
  const firstLabel = name.split('.')[0]

  const { data, isLoading, error } = useQuery(
    getNameRegistriesQueryOptions({ name, ownerData }),
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

  const showVerifiedBanner = subregistryAddress !== zeroAddress

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-4 gap-4 md:p-6 md:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-medium leading-none">Registry</h1>
        {ethRegistryAddress && account && (
          <DeploySubregistryButton
            name={name}
            registryAddress={ethRegistryAddress}
            label={firstLabel}
            account={account}
          />
        )}
      </div>

      {showVerifiedBanner && <VerifiedRegistryCard />}

      <RegistryCardsGrid
        label={firstLabel}
        owner={ownerData.owner}
        network={data.network}
      />

      {subregistryAddress && (
        <>
          {subregistryAddress === zeroAddress ? null : (
            <RegistryCard
              registry={{
                address: subregistryAddress as Address,
                protocol: data.protocolVersion,
                factory: namechainVerifiableFactory,
              }}
            />
          )}
          <ETHRegistry name={name} network={data.network} />
          <RegistryCard
            registry={{
              address: data.registries.at(-2) as Address,
              protocol: data.protocolVersion,
            }}
          />
        </>
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
