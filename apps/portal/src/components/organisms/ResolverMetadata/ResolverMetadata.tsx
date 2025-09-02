import { useChains } from 'wagmi'
import {
  CCIPGatewayURLView,
  ResolverField,
} from '@/components/resolver/ResolverField'
import type { wagmiConfig } from '@/lib/wagmi'

export const ResolverMetadata = () => {
  const [chain] = useChains<typeof wagmiConfig>()

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <ResolverField
        label="Verifier contract address"
        value="0x5FB27553ee1e7C86C9fD4863a94A9f755B688bB8"
      />
      <CCIPGatewayURLView />
      <ResolverField label="Chain ID" value={chain.id} />

      <ResolverField label="Subgraph URL" value={chain.subgraphs.ens.url} />
    </div>
  )
}
