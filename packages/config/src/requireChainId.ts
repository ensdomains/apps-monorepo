import type { Chain, Client } from 'viem'

/**
 * The chain a client is bound to, or a thrown error.
 *
 * Deliberately has no default. Substituting a network when one is missing
 * produces well-formed calldata aimed at another chain's contracts, which the
 * signer will happily sign: a silent wrong-network transaction is a worse
 * outcome than a failed one. It also turns viem's bare `Cannot read properties
 * of undefined` into something that names the caller.
 */
export const requireEnsChain = (
  client: Pick<Client, 'chain'> | undefined,
  context: string,
): Chain => {
  const chain = client?.chain
  if (!chain) {
    throw new Error(
      `${context}: the public client has no chain. Refusing to guess a network, ` +
        `because signing calldata built for the wrong chain is unrecoverable.`,
    )
  }
  return chain
}

export const requireChainId = (
  client: Pick<Client, 'chain'> | undefined,
  context: string,
): number => requireEnsChain(client, context).id
