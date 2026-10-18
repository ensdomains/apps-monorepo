import { TaggedError } from '@ens-apps/utils/neverthrow'
import { type Config, getConnection, switchChain } from '@wagmi/core'

export class WalletChainError extends TaggedError('WalletChainError')<{
  chainId: number
}> {}

const inFlight = new Map<number, Promise<void>>()

/**
 * Move the connected wallet to `chainId` if it is elsewhere. A declined switch
 * rethrows the wallet's rejection, so callers treat it as a cancel. Concurrent
 * calls share one prompt. Chains outside the config are left to the wallet,
 * which rejects a request for another chain itself.
 *
 * A chain the wallet doesn't know gets wagmi's add-chain prompt (4902). One it
 * lists but has turned off answers 4901, which only the user can fix.
 */
export const ensureWalletChain = (
  config: Config,
  chainId: number,
): Promise<void> => {
  const pending = inFlight.get(chainId)
  if (pending) return pending
  const run = moveWallet(config, chainId).finally(() =>
    inFlight.delete(chainId),
  )
  inFlight.set(chainId, run)
  return run
}

// wagmi passes the wallet's own answer on as the cause of its error.
const isChainTurnedOff = (error: unknown): boolean => {
  let current = error as { code?: unknown; cause?: unknown } | undefined
  for (let depth = 0; current && depth < 4; depth++) {
    if (current.code === 4901) return true
    current = current.cause as typeof current
  }
  return false
}

const moveWallet = async (config: Config, chainId: number): Promise<void> => {
  const chain = config.chains.find(({ id }) => id === chainId)
  if (!chain) return
  // Without a connection wagmi's `switchChain` repoints the app's default
  // chain instead, which every unpinned hook would follow.
  const { connector } = getConnection(config)
  if (!connector) {
    throw new WalletChainError({
      chainId,
      message: 'Connect your wallet to continue.',
    })
  }
  if ((await connector.getChainId()) === chainId) return
  try {
    await switchChain(config, { chainId, connector })
  } catch (error) {
    if (!isChainTurnedOff(error)) throw error
    throw new WalletChainError({
      chainId,
      message: `Turn on ${chain.name} in your wallet, then try again.`,
      cause: error,
    })
  }
}
