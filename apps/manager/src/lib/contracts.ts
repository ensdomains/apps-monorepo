import { getSupportedTokens, getTokens } from '@ens-apps/config'
import { config } from '@/config'

/**
 * ENS contracts for the network this build targets.
 *
 * ensjs's own map, bound to the resolved chain. The keys and addresses are
 * ensjs's, so there is no second vocabulary to keep in sync.
 */
export const ENS_CONTRACTS = config.chain.contracts

export const SUPPORTED_TOKENS = getSupportedTokens(config.chain.id)
export const TOKENS = getTokens(config.chain.id)

export type { SUPPORTED_TOKEN, TOKEN_SYMBOL } from '@ens-apps/config'
export { EMPTY_ADDRESS, REFERER_ADDRESS } from '@ens-apps/transaction-manager'
