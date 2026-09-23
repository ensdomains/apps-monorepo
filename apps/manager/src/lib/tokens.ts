import { getSupportedTokens, getTokens } from '@ens-apps/config'
import { config } from '@/config'

/**
 * The payment tokens, bound to the network this build targets. Addresses come
 * from ensjs; the decimals and symbols live in `@ens-apps/config` so the apps
 * and the transaction manager read one definition.
 */
export const TOKENS = getTokens(config.chain.id)

export const SUPPORTED_TOKENS = getSupportedTokens(config.chain.id)

export type { SUPPORTED_TOKEN, TOKEN_SYMBOL } from '@ens-apps/config'
