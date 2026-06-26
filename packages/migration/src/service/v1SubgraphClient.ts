/**
 * Shape of a v1 ENS domain as returned by the v1 subgraph. The package keeps
 * only the type — each app owns its own fetching (by-address in the manager
 * dashboard, by-name in the portal explorer) and passes this shape into
 * {@link classifyName}.
 */
export type V1Domain = {
  id: string
  labelName: string | null
  labelhash: string
  name: string
  resolver: { address: string } | null
  owner: { id: string }
  registrant: { id: string } | null
  wrappedOwner: { id: string } | null
  parent: {
    name: string
    wrappedDomain: { fuses: number } | null
  } | null
  registration: {
    expiryDate: string
  } | null
  wrappedDomain: {
    expiryDate: string
    fuses: number
  } | null
}
