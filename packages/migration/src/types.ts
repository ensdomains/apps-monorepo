/**
 * Shape of a v1 ENS domain as returned by the v1 (subgraph) data source.
 *
 * This is the set of "fuse/wrap subgraph fields" the migration classifier needs
 * to decide whether a name can move from ENSv1 to ENSv2. Each consuming app is
 * responsible for fetching this shape (by-address in the manager dashboard,
 * by-name in the explorer) and passing it into {@link classifyName}.
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
