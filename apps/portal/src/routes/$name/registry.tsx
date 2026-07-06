import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import {
  type GetEnsOwnerReturnType,
  getEnsOwnerQueryOptions,
} from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { RegistryCardsGrid } from '@/features/registry/components/RegistryCardsGrid'
import { V2RegistryInfo } from '@/features/registry/components/v2/RegistryInfo'
import { sepoliaWithEns } from '@/lib/wagmi'
import { isRegistrable } from '@/utils/ens/tldHelpers'
import { NotFoundMessage } from '../../components/NotFoundMessage'

const v1LegacyRegistryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

const chainId = sepoliaWithEns.id

export const Route = createFileRoute('/$name/registry')({
  component: RouteComponent,
})

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

  const availabilityQuery = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: isRegistrable(name),
  })

  if (error)
    return (
      <ErrorMessage
        title={error.cause.name}
        description={error.cause.message}
      />
    )
  if (isLoading || (availabilityQuery.isLoading && isRegistrable(name)))
    return <LoadingSpinner title="Loading owner info" />

  if (availabilityQuery.error)
    return (
      <ErrorMessage
        title="Error checking availability"
        description={
          availabilityQuery.error.cause?.message ||
          availabilityQuery.error.message
        }
      />
    )
  if (availabilityQuery.data?.isAvailable || !ownerData)
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
