/**
 * Thrown whenever configuration cannot be resolved. Always fail here rather
 * than falling back to a network: a wrong-network fallback produces valid
 * calldata against the wrong contracts, which is far worse than not starting.
 */
export class NetworkConfigError extends Error {
  override readonly name = 'NetworkConfigError'
}
