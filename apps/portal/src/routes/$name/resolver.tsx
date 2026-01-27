import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { GetUnderlyingResolverReturnType } from '@ensdomains/ensjs/public/v2'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { EditIcon } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection, useEnsResolver } from 'wagmi'
import { useQuery } from 'wagmi/query'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import { Button } from '@/components/ui/button'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { DedicatedResolverBanner } from '@/features/resolver/components/DedicatedResolverBanner'
import { ResolverDetails } from '@/features/resolver/components/ResolverDetails'
import { ResolverNetwork } from '@/features/resolver/components/ResolverNetwork'
import { ResolverPrimaryName } from '@/features/resolver/components/ResolverPrimaryName'
import { ResolverType } from '@/features/resolver/components/ResolverType'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import { namechainSepolia } from '@/lib/wagmi'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'

export const Route = createFileRoute('/$name/resolver')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

interface EditButtonsProps {
  address: Address
  name: string
}

const EditButtons = ({ address, name }: EditButtonsProps) => {
  const { data } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (data?.owner !== address) return null

  return (
    <div className="flex flex-row gap-2">
      {/* <button
        type="button"
        className="text-base font-medium flex flex-row gap-1 items-center px-4 py-2 bg-secondary hover:bg-gray-400 cursor-pointer h-[38px] rounded-sm"
      >
        <XIcon className="w-4 h-4" />
        <span>Clear records</span>
      </button> */}
      <Button variant="outline" className="flex items-center gap-2" asChild>
        <Link to="/$name/change-resolver" params={{ name }}>
          <EditIcon className="size-4" />
          Change resolver
        </Link>
      </Button>
    </div>
  )
}

const sepoliaUrl = sepolia.blockExplorers.default.url

const factoryAddress = getChainContractAddress({
  chain: namechainSepolia,
  contract: 'ensVerifiableFactory',
})

interface UnderlyingResolverInfoProps {
  underlyingResolverData: GetUnderlyingResolverReturnType
  resolverAddress: Address
}

const UnderlyingResolverInfo = ({
  underlyingResolverData: data,
  resolverAddress: _resolverAddress,
}: UnderlyingResolverInfoProps) => {
  if (!data) {
    return <div>Introspection of non .eth names is not supported yet</div>
  } else if (Array.isArray(data)) {
    if (data[0] === zeroAddress) return <div>This name has no resolver set</div>
    // resolver is on L2

    if (data[1]) {
      return (
        <div className="flex flex-col gap-4 sm:gap-6">
          <DedicatedResolverBanner resolverAddress={data[0]} />
          <h2 className="font-medium text-2xl">L2 Resolver</h2>
          <div className="flex flex-row flex-wrap gap-y-4 gap-x-6">
            <ResolverPrimaryName resolverAddress={data[0]} />
            <ResolverType resolverAddress={data[0]} />
            <ResolverNetwork resolverAddress={data[0]} />
          </div>
          <ResolverDetails
            resolverAddress={data[0]}
            data={[
              {
                label: 'Chain ID',
                value: 'TBD',
              },
              {
                label: 'Protocol',
                value: 'ENSv2',
              },
              {
                label: 'Contract',
                value: data[0],
                href: `${sepoliaUrl}/address/${data[0]}`,
              },
              {
                label: 'Factory',
                value: factoryAddress,
                href: `${sepoliaUrl}/address/${factoryAddress}`,
              },
            ]}
          />
        </div>
      )
    } else {
      return (
        <div className="flex flex-col gap-6">
          <h2 className="font-medium text-2xl">L1 Resolver</h2>
          <div className="flex flex-row gap-6">
            <ResolverType resolverAddress={data[0]} />
            <ResolverNetwork resolverAddress={data[0]} />
          </div>
          <ResolverDetails
            resolverAddress={data[0]}
            data={[
              {
                label: 'Chain ID',
                value: '11155111',
              },
              {
                label: 'Protocol',
                value: 'ENSv1',
              },
              {
                label: 'Contract',
                value: data[0],
                href: `${sepoliaUrl}/address/${data[0]}`,
              },
            ]}
          />
        </div>
      )
    }
  }

  return null
}

interface ResolverViewProps {
  name: string
  resolverAddress: Address
}

const ResolverView = ({ name, resolverAddress }: ResolverViewProps) => {
  const { address } = useConnection()

  const {
    data: underlyingResolverData,
    isLoading,
    error,
  } = useQuery(getUnderlyingAddressQueryOptions({ resolverAddress, name }))

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <LoadingSpinner title="Loading..." />

  return (
    <div className="max-w-360 mx-auto w-full flex flex-col p-6 gap-6">
      <div className="flex flex-row gap-4 justify-between items-center">
        <h1 className="text-[28px] font-medium">Resolver</h1>
        {address && <EditButtons address={address} name={name} />}
      </div>
      {underlyingResolverData && (
        <UnderlyingResolverInfo
          underlyingResolverData={underlyingResolverData}
          resolverAddress={resolverAddress}
        />
      )}
      <h2 className="font-medium text-2xl">Universal Resolver</h2>
      <ResolverDetails
        resolverAddress={resolverAddress}
        data={[
          {
            label: 'Contract',
            value: resolverAddress,
            href: `${sepoliaUrl}/address/${resolverAddress}`,
          },
          {
            label: 'Chain ID',
            value: '11155111',
          },
        ]}
      />
      {!underlyingResolverData?.[1] && <NameSubgraphHistory name={name} />}
    </div>
  )
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/resolver' })

  const {
    data: resolverAddress,
    isLoading,
    error,
  } = useEnsResolver({
    name,
    universalResolverAddress: '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce',
  })

  if (error) {
    if (error.name === 'ChainDoesNotSupportContract')
      return <ErrorMessage title="Chain does not have UniversalResolver" />
    return (
      <ErrorMessage
        title="Error loading resolver"
        description={extractErrorMessage(error, '')}
      />
    )
  }

  if (isLoading) return <LoadingMessage />

  if (!resolverAddress)
    return (
      <ErrorMessage
        title="Resolver not found"
        description="Could not find resolver address."
      />
    )

  return <ResolverView {...{ name, resolverAddress }} />
}
