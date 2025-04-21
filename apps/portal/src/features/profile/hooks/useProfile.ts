import { getRecords, type GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { getSubgraphRecords } from '@ensdomains/ensjs/subgraph'
import type { ClientWithEns } from '@ensdomains/ensjs/contracts'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi'

export const getProfile = async (client: ClientWithEns, name: string) => {
  if (!name) {
    return null
  }

  const subgraphRecords = await getSubgraphRecords(client, { name })
  const records = (await getRecords(client, {
    name,
    ...subgraphRecords,
  })) as GetRecordsReturnType

  return {
    records,
    subgraphRecords,
  }
}

export const profileQueryOptions = (client: ClientWithEns, name: string) =>
  queryOptions({
    queryKey: ['profile', name],
    queryFn: () => getProfile(client, name),
  })

export const useProfile = (name: string, client?: ClientWithEns) => {
  const _client = client ?? wagmiConfig.getClient()

  return useQuery(profileQueryOptions(_client, name))
}
