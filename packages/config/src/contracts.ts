import { ensL1Contracts } from '@ensdomains/ensjs/chain'
import { NetworkConfigError } from './errors'
import { type EnsNetwork, NETWORKS } from './networks'

const NETWORK_BY_CHAIN_ID = new Map<number, EnsNetwork>(
  (Object.keys(NETWORKS) as EnsNetwork[]).map((network) => [
    NETWORKS[network].chainId,
    network,
  ]),
)

/**
 * ensjs's contract map for a chain.
 *
 * A typed lookup with a guard, not a wrapper: the keys and addresses are
 * ensjs's own, so there is one vocabulary and one source. Callers holding an
 * ENS-extended chain should read `chain.contracts` directly; this is for the
 * ones that only have a chain id.
 *
 * Throws for a chain with no ENS deployment rather than returning undefined.
 */
export const ensContractsFor = (chainId: number) => {
  const network = NETWORK_BY_CHAIN_ID.get(chainId)
  if (!network) {
    throw new NetworkConfigError(
      `Chain ${chainId} has no ENS deployment. Refusing to guess a network.`,
    )
  }
  return ensL1Contracts[NETWORKS[network].chainId]
}

/**
 * Token metadata the apps price and display.
 *
 * Addresses come from ensjs; the decimals and symbols do not exist there and
 * are what this adds. {@link getSupportedTokens} is the subset the v2
 * registrar actually accepts (its `PAYMENT_TOKEN` / `SECONDARY_PAYMENT_TOKEN`
 * slots). DAI is absent from it deliberately: offering it in a picker produces
 * quotes the registrar rejects at settlement.
 */
export const getTokens = (chainId: number) => {
  const ens = ensContractsFor(chainId)
  return {
    USDC: { address: ens.usdc.address, decimals: 6, symbol: 'USDC' },
    DAI: { address: ens.dai.address, decimals: 18, symbol: 'DAI' },
  } as const
}

export const getSupportedTokens = (chainId: number) =>
  ({ USDC: getTokens(chainId).USDC.address }) as const

export type TOKEN_SYMBOL = keyof ReturnType<typeof getTokens>
export type SUPPORTED_TOKEN = keyof ReturnType<typeof getSupportedTokens>
