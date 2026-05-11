import { graphql, useOmnigraphQuery } from 'enskit/react/omnigraph'
import { asInterpretedName } from 'enssdk'

// NOTE: Omnigraph's `Domain.subdomains` returns subdomains of the protocol-specific domain only,
// so selecting an ENSv2 Domain's subdomains yields only ENSv2 subdomains. The `Query.domain` field
// identifies a Domain by name, preferring the ENSv2 Domain (if exists) over the ENSv1 Domain.
const SubnameCountQuery = graphql(`
  query SubnameCount($name: InterpretedName!) {
    domain(by: { name: $name }) {
      subdomains {
        totalCount
      }
    }
  }
`)

export function useSubnameCount({ name }: { name: string }) {
  const [query] = useOmnigraphQuery({
    query: SubnameCountQuery,
    // subsequent migrations should adopt `EnsureInterpretedName` from enskit/react to avoid the
    // casting and ensure that $name route params always conform to InterpretedName
    variables: { name: asInterpretedName(name) },
  })

  return { ...query, data: query.data?.domain?.subdomains?.totalCount }
}
