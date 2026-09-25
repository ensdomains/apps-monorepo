import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import indexerClient, { graphqlRequest } from '@ens-apps/indexer/urql'

// Records and registration often ask for the same indexer domain at the same
// time. Share only in-flight work so later reads can still observe new records.
const inflightDomains = new Map<string, Promise<DomainQuery['domain']>>()

export const getProfileIndexedDomain = (
  name: string,
): Promise<DomainQuery['domain']> => {
  const existing = inflightDomains.get(name)
  if (existing) return existing

  const request = graphqlRequest<DomainQuery>(indexerClient, DomainDocument, {
    id: name,
  })
    .then(({ domain }) => domain)
    .finally(() => {
      inflightDomains.delete(name)
    })

  inflightDomains.set(name, request)
  return request
}
