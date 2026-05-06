import { graphql, useOmnigraphQuery } from 'enskit/react/omnigraph'
import { asInterpretedName } from 'enssdk'

// NOTE: Omnigraph's `Domain.subdomains` returns subdomains of the protocol-specific domain only,
// so selecting an ENSv2 Domain's subdomains yields only ENSv2 subdomains.
// To count subdomains by protocol version, the parent must be filtered:
//   domain(by: { name: $name }, where: { version: ENSv1 | ENSv2 }) { subdomains { totalCount } }
// That `where` argument is not yet implemented, tracked at:
// https://github.com/namehash/ensnode/issues/2035?issue=namehash%7Censnode%7C2060
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
    // Route params are already-canonical names; subsequent migrations should
    // adopt `EnsureInterpretedName` from enskit/react instead of casting.
    variables: { name: asInterpretedName(name) },
  })

  return { ...query, data: query.data?.domain?.subdomains?.totalCount }
}
