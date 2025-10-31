import { ensContracts } from '@ensdomains/ensjs/chain'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { EditIcon, XIcon } from 'lucide-react'
import { type Address, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useAccount, useEnsResolver } from 'wagmi'
import { useQuery } from 'wagmi/query'
import { NameHistory } from '@/components/organisms/NameHistory/NameHistory'
import { DedicatedResolverBanner } from '@/components/resolver/DedicatedResolverBanner'
import { ResolverDetails } from '@/components/resolver/ResolverDetails'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { ResolverNetwork } from '@/features/resolver/components/ResolverNetwork'
import { ResolverPrimaryName } from '@/features/resolver/components/ResolverPrimaryName'
import { ResolverType } from '@/features/resolver/components/ResolverType'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import { wagmiConfig } from '@/lib/wagmi'

export const Route = createFileRoute('/$name/resolver')({
  component: RouteComponent,
})

const EditButtons = ({ address, name }: { address: Address; name: string }) => {
  const { data: owner } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (owner?.owner !== address) return null

  return (
    <div className="flex flex-row gap-2">
      <button
        type="button"
        className="text-base font-medium flex flex-row gap-1 items-center px-4 py-2 bg-secondary hover:bg-gray-400 cursor-pointer h-[38px] rounded-sm"
      >
        <XIcon className="w-4 h-4" />
        <span>Clear records</span>
      </button>
      <a
        href="#change"
        className="text-base font-medium flex flex-row gap-1 items-center px-4 py-2 bg-secondary hover:bg-gray-400 cursor-pointer h-[38px] rounded-sm"
      >
        <EditIcon className="w-4 h-4" />
        <span>Change resolver</span>
      </a>
    </div>
  )
}

const sepoliaUrl = sepolia.blockExplorers.default.url
const factoryAddress = ensContracts[11155111].ensVerifiableFactory.address

const UnderlyingResolverInfo = ({
  name,
  resolverAddress,
}: {
  resolverAddress: Address
  name: string
}) => {
  const { data, isLoading, error } = useQuery(
    getUnderlyingAddressQueryOptions({ resolverAddress, name }),
  )

  if (error) return <div>Error: {error.cause?.message}</div>
  if (isLoading) return <div>Loading...</div>

  if (!data) {
    return <div>Introspection of non .eth names is not supported yet</div>
  } else if (Array.isArray(data)) {
    if (data[0] === zeroAddress) return <div>This name does not exist</div>
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
            resolverAddress={resolverAddress}
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

const ResolverView = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => {
  const { address } = useAccount()

  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col p-6 gap-6">
      <div className="flex flex-row gap-4 justify-between items-center">
        <h1 className="text-[28px] font-medium">Resolver</h1>
        {address && <EditButtons address={address} name={name} />}
      </div>
      <UnderlyingResolverInfo {...{ name, resolverAddress }} />
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
      <NameHistory name={name} />
    </div>
  )
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/resolver' })

  const {
    data: tempResolverAddress,
    isLoading,
    error,
  } = useEnsResolver({
    name,
    universalResolverAddress:
      wagmiConfig.chains[0].contracts.ensUniversalResolver.address,
  })

  // TODO: remove this hack for when devnet and namechain is ready
  const resolverAddress =
    tempResolverAddress === '0xb5c0FF6c84d352e896d1026193809b8FF248dCdF'
      ? '0x352d7aA7a8bd0F6f31635BE5ceCb6Cebb6929A15'
      : tempResolverAddress

  if (error) {
    if (error.name === 'ChainDoesNotSupportContract')
      return <div>Chain does not have UniversalResolver</div>
    return <div>{error.message}</div>
  }

  if (isLoading) return <div>Loading...</div>

  if (!resolverAddress) return <div>Resolver not found</div>

  return <ResolverView {...{ name, resolverAddress }} />
}
