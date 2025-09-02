import { AccordionItem } from '@radix-ui/react-accordion'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { EditIcon, XIcon } from 'lucide-react'
import { useEnsResolver } from 'wagmi'
import { NameHistory } from '@/components/organisms/NameHistory/NameHistory'
import { ResolverMetadata } from '@/components/organisms/ResolverMetadata/ResolverMetadata'
import { ResolverDetails } from '@/components/resolver/ResolverDetails'
import {
  Accordion,
  AccordionContent,
  AccordionTrigger,
} from '@/components/ui/accordion'

export const Route = createFileRoute('/$name/resolver')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/resolver' })

  const { data: resolverAddress } = useEnsResolver({ name })

  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col p-6 gap-6">
      <div className="flex flex-row gap-4 justify-between items-center">
        <h1 className="text-[28px] font-medium">Resolver</h1>
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
      </div>
      <div className="flex flex-col sm:flex-row gap-6 w-full">
        <div className="flex flex-col gap-1 p-6 border border-secondary rounded-lg w-full">
          <div className="text-gray-400">Resolver network</div>
          <div className="text-[26px] font-medium">Mainnet</div>
        </div>
        <div className="flex flex-col gap-1 p-6 border border-secondary rounded-lg w-full">
          <h2 className="text-gray-400">Resolver version</h2>
          <div className="text-[26px] font-medium">Latest</div>
        </div>
      </div>
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
