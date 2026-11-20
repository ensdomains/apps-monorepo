import { msg } from '@lingui/core/macro'

/** The wallet's session signature doesn't recover to the account owner. */
export const SESSION_SIGNER_MISMATCH_MESSAGE = msg`Your wallet signed a different request than the one shown, so this authorization can't be used. Try again, or use another wallet app with the same account.`
