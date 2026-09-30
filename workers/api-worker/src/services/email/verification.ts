import { ResultFn } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { createIntoError } from '#utils/result.js'
import { EMAIL_OTP_TTL_MS } from './challenges.js'
import { sendRenderedEmail } from './send.js'
import { renderVerificationEmail } from './templates/VerificationEmail.js'

export const sendVerificationEmail = ResultFn(async function* (
  apiKey: string,
  fromEmail: string,
  toEmail: string,
  otp: string,
  accountAddress: string,
) {
  const email = yield* fromPromise(
    renderVerificationEmail({
      otp,
      accountAddress,
      expiresInMinutes: EMAIL_OTP_TTL_MS / 60_000,
    }),
    createIntoError('EMAIL_RENDER_ERROR'),
  )

  return ok(
    yield* sendRenderedEmail(apiKey, { from: fromEmail, to: toEmail, email }),
  )
})
