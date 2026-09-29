import { ResultFn } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { logger } from '#utils/logger.js'
import { createIntoError } from '#utils/result.js'
import { sendRenderedEmail } from './send.js'
import { renderWelcomeEmail } from './templates/WelcomeEmail.js'

/**
 * Sends a welcome email to the user after email verification
 */
export const sendWelcomeEmail = ResultFn(async function* (
  apiKey: string,
  fromEmail: string,
  toEmail: string,
) {
  const email = yield* fromPromise(
    renderWelcomeEmail(),
    createIntoError('EMAIL_RENDER_ERROR'),
  )

  const result = yield* sendRenderedEmail(apiKey, {
    from: fromEmail,
    to: toEmail,
    email,
  })

  logger.info('Welcome email sent', {
    to: toEmail,
  })

  return ok(result)
})
