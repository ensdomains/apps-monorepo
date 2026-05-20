import { useQuery } from '@tanstack/react-query'
import { zeroAddress } from 'viem'
import { NameSubgraphHistory } from '@/components/table/NameSubgraphHistory/NameSubgraphHistory'
import type { SubgraphEvent } from '@/utils/history/groupEventsByTransactionId'
import { getNameRegistriesQueryOptions } from '../../hooks/useNameRegistryDiscovery'
import { getRegistryEventsQueryOptions } from '../../hooks/useRegistryEvents'

/**
 * History table for the name's own registry contract. Reuses
 * `NameSubgraphHistory` by mapping indexer `RegistryEvent`s onto the
 * `SubgraphEvent` shape it consumes via the `v2Events` prop — the events
 * already carry timestamps, so only the transaction sender ("From") is
 * fetched downstream.
 */
export const RegistryHistory = ({ name }: { name: string }) => {
  // `getNameRegistriesQueryOptions` returns registries ordered
  // `[name, ...ancestors, root]`, so the name's own registry is at index 0.
  const { data: registries } = useQuery(getNameRegistriesQueryOptions({ name }))
  const address = registries?.at(0) ?? null
  const hasRegistry = !!address && address !== zeroAddress

  const { data: page } = useQuery({
    ...getRegistryEventsQueryOptions({ address: address ?? zeroAddress }),
    enabled: hasRegistry,
  })

  if (!hasRegistry || !page || page.events.length === 0) return null

  const v2Events: SubgraphEvent[] = page.events.map((event) => ({
    transactionID: event.transactionHash,
    blockNumber: event.blockNumber,
    id: event.id,
    type: event.type,
    timestamp: BigInt(event.timestamp),
  }))

  return <NameSubgraphHistory name={name} v2Events={v2Events} />
}
