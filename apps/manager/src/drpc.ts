/**
 * drpc's gateway for the manager's own key.
 *
 * Not a secret: the key ships in every browser bundle and identifies a quota
 * bucket, nothing more. It is kept per app so usage is attributed to the
 * manager rather than pooled with the portal, and shared by the L1 and L2
 * transports so a chain cannot drift onto a different key.
 */

/** The drpc network slugs this app uses. */
export type DrpcNetwork =
  | 'ethereum'
  | 'sepolia'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'base-sepolia'
  | 'arbitrum-sepolia'
  | 'optimism-sepolia'

const MANAGER_DRPC_KEY = 'AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j'

/**
 * The manager's attributed RPC for `network`.
 *
 * A chain must be enabled for the key in the drpc dashboard; until it is, the
 * gateway answers `Chain not allowed for this key` and the failover moves on.
 */
export const drpcRpcUrl = (network: DrpcNetwork): string =>
  `https://lb.drpc.live/${network}/${MANAGER_DRPC_KEY}`
