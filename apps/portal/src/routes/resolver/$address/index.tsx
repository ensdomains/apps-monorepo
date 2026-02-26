import { createFileRoute } from '@tanstack/react-router'
import { GridIcon, SplitIcon, UserRoundCog } from 'lucide-react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import {
  CounterCard,
  CounterCardChevron,
  CounterCardLink,
  CounterCardRow,
} from '@/components/CounterCard'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { DedicatedResolverBanner } from '@/features/resolver/components/DedicatedResolverBanner'
import { ResolverDetails } from '@/features/resolver/components/ResolverDetails'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Route = createFileRoute('/resolver/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const sepoliaUrl = sepolia.blockExplorers.default.url

function RouteComponent() {
  const { address } = Route.useParams()

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-[28px] font-medium leading-none">
        Resolver {truncateAddress(address, 6, 4, '...')}
      </h1>

      <DedicatedResolverBanner resolverAddress={address as Address} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CounterCard>
          <CounterCardRow icon={GridIcon} action={<CounterCardChevron />}>
            <span className="font-medium">0</span> nodes
          </CounterCardRow>
        </CounterCard>

        <CounterCard>
          <CounterCardRow
            icon={UserRoundCog}
            action={
              <CounterCardLink
                to="/resolver/$address/roles"
                params={{ address }}
              />
            }
          >
            <span className="font-medium">0</span> roles
          </CounterCardRow>
        </CounterCard>

        <CounterCard>
          <CounterCardRow
            icon={SplitIcon}
            action={
              <CounterCardLink
                to="/resolver/$address/aliases"
                params={{ address }}
              />
            }
          >
            <span className="font-medium">0</span> aliases
          </CounterCardRow>
        </CounterCard>
      </div>

      <ResolverDetails
        resolverAddress={address as Address}
        data={[
          {
            label: 'Contract',
            value: address,
            href: `${sepoliaUrl}/address/${address}` as `https://${string}`,
          },
        ]}
      />
    </div>
  )
}
