import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import type { RenderedEmail } from './render.js'
import { sendMailV3 } from './utils.js'

/** SendGrid transport: submits an already-rendered email. */
export const sendRenderedEmail = ResultFn(async function* (
  apiKey: string,
  {
    from,
    to,
    email,
  }: {
    from: string
    to: string
    email: RenderedEmail
  },
) {
  const result = yield* sendMailV3(apiKey, {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from },
    subject: email.subject,
    // SendGrid requires text/plain to precede text/html.
    content: [
      { type: 'text/plain', value: email.text },
      { type: 'text/html', value: email.html },
    ],
  })

  return ok(result)
})
