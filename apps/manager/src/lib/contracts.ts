import {
  getEnsContracts,
  getSupportedTokens,
  getTokens,
} from '@ens-apps/config'
import { config } from '@/config'

/**
 * ENS contracts and tokens for the network this build targets, bound once from
 * the resolved config. Feature code imports from here rather than reaching for
 * a chain id, so there is one place where the network enters.
 */
export const ENS_CONTRACTS = config.contracts

export const SUPPORTED_TOKENS = getSupportedTokens(config.chain.id)
export const TOKENS = getTokens(config.chain.id)

export type {
  SUPPORTED_TOKEN,
  SUPPORTED_TOKEN_ADDRESS,
  TOKEN_SYMBOL,
} from '@ens-apps/config'
export { EMPTY_ADDRESS, REFERER_ADDRESS } from '@ens-apps/transaction-manager'
export { getEnsContracts }
