import { AccordionItem } from '@radix-ui/react-accordion'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { EditIcon, XIcon } from 'lucide-react'
import type { Address } from 'viem'
import { useAccount, useEnsResolver } from 'wagmi'
import { useQuery } from 'wagmi/query'
import { NameHistory } from '@/components/organisms/NameHistory/NameHistory'
import { ResolverMetadata } from '@/components/organisms/ResolverMetadata/ResolverMetadata'
import { DedicatedResolverBanner } from '@/components/resolver/DedicatedResolverBanner'
import { ResolverDetails } from '@/components/resolver/ResolverDetails'
import {
  Accordion,
  AccordionContent,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { findResolverChain } from '@/utils/resolver/findResolverChain'

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

function RouteComponent() {
  const { name } = useParams({ from: '/$name/resolver' })

  const { data: resolverAddress } = useEnsResolver({ name })

  const { address } = useAccount()

  const resolverChain = findResolverChain(resolverAddress!)

  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col p-6 gap-6">
      <div className="flex flex-row gap-4 justify-between items-center">
        <h1 className="text-[28px] font-medium">Resolver</h1>
        {address && <EditButtons address={address} name={name} />}
      </div>
      <DedicatedResolverBanner resolverAddress={resolverAddress} />
      {resolverAddress && (
        <>
          <ResolverDetails {...{ resolverAddress }} />
          <Accordion type="single" collapsible>
            <AccordionItem value="resolver-metadata">
              <AccordionTrigger>Resolver metadata</AccordionTrigger>
              <AccordionContent>
                <ResolverMetadata />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}

      <NameHistory name={name} />
    </div>
  )
}
