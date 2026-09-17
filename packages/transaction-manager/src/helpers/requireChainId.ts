import type { Client } from 'viem'

/**
 * Chain id of a client, or a thrown error.
 *
 * Deliberately has no default. Substituting a network when one is missing
 * produces well-formed calldata aimed at another chain's contracts, which the
 * signer will happily sign: a silent wrong-network transaction is a worse
 * outcome than a failed one. Callers that reach here without a chain have a
 * client-construction bug, and the throw names the caller so it is findable.
 */
export const requireChainId = (
  client: Pick<Client, 'chain'> | undefined,
  context: string,
): number => {
  const chainId = client?.chain?.id
  if (chainId === undefined) {
    throw new Error(
      `${context}: the public client has no chain. Refusing to guess a network, ` +
        `because signing calldata built for the wrong chain is unrecoverable.`,
    )
  }
  return chainId
}
