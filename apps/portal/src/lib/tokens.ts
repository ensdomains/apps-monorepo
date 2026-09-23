import { getTokens } from '@ens-apps/config'
import { config } from '@/config'

/**
 * The payment tokens, bound to the network this build targets. Addresses come
 * from ensjs; the decimals and symbols live in `@ens-apps/config` so the apps
 * and the transaction manager read one definition.
 *
 * The registrar's settleable subset is `@/lib/constants/tokens`, which owns
 * the portal's `SUPPORTED_TOKENS`.
 */
export const TOKENS = getTokens(config.chain.id)
