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

const moveWallet = async (config: Config, chainId: number): Promise<void> => {
  if (!config.chains.some(({ id }) => id === chainId)) return
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
  await switchChain(config, { chainId, connector })
}
