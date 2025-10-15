import { createFileRoute, useParams } from '@tanstack/react-router'
import { EditIcon, FocusIcon, XIcon } from 'lucide-react'
import type { Address } from 'viem'
import { useAccount, useEnsResolver } from 'wagmi'
import { useQuery } from 'wagmi/query'
import { NameHistory } from '@/components/organisms/NameHistory/NameHistory'
import { DedicatedResolverBanner } from '@/components/resolver/DedicatedResolverBanner'
import { ResolverDetails } from '@/components/resolver/ResolverDetails'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import {
  getResolverNameQueryOptions,
} from '@/features/profile/hooks/useResolverName'
import {
  getSupportsInterfacesQueryOptions,
} from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'

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

const ResolverPrimaryName = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  const { data, isLoading, error } = useQuery(
    getResolverNameQueryOptions({ resolverAddress }),
  )

  if (isLoading) return <>Loading...</>

  if (error) return <>{error.cause?.message}</>

  if (!data) return null

  return (
    <div className="flex flex-row p-6 gap-6 rounded-2xl border border-secondary w-full flex-1">
      <NameAvatar name={data} height="40px" width="40px" />
      <div className="flex flex-col">
        <span className="font-medium">Primary Name</span>
        <span>{data}</span>
      </div>
    </div>
  )
}

const ResolverType = ({ resolverAddress }: { resolverAddress: Address }) => {
  const {
    data: supportsInterfaces,
    isLoading,
    error,
  } = useQuery(
    getSupportsInterfacesQueryOptions({
      address: resolverAddress,
      interfaces: [RESOLVER_INTERFACE_IDS.DedicatedResolver],
    }),
  )

  if (isLoading) return <>Loading...</>

  if (error) return <>{error.cause?.message}</>

  if (!supportsInterfaces || supportsInterfaces.every((v) => v === false))
    return null

  if (supportsInterfaces[0]) {
    return (
      <div className="flex flex-row p-6 gap-6 rounded-2xl border border-secondary w-full flex-1 items-center">
        <FocusIcon height={40} width={40} />
        <div className="flex flex-col">
          <span className="font-medium">Type</span>
          <span>DedicatedResolver</span>
        </div>
      </div>
    )
  }
}

function RouteComponent() {
  const { name } = useParams({ from: '/$name/resolver' })

  const { data: resolverAddress } = useEnsResolver({ name, universalResolverAddress: '0x4d2afc61b84e3475ec19ad9392ee09e9a7b01226' })

  const { address } = useAccount()

  if (!resolverAddress) return <div>Resolver not found</div>

  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col p-6 gap-6">
      <div className="flex flex-row gap-4 justify-between items-center">
        <h1 className="text-[28px] font-medium">Resolver</h1>
        {address && <EditButtons address={address} name={name} />}
      </div>
      <DedicatedResolverBanner resolverAddress={resolverAddress} />
      <h2 className="font-medium text-2xl">L2 Resolver</h2>
      <div className="flex flex-row gap-6">
        <ResolverPrimaryName resolverAddress={resolverAddress} />
        <ResolverType resolverAddress={resolverAddress} />
      </div>
      <ResolverDetails resolverAddress={resolverAddress} />
      <NameHistory name={name} />
    </div>
  )
}
