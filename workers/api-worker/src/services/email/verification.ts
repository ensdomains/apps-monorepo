import { ResultFn } from '@ens-apps/utils/neverthrow'
import { ok } from 'neverthrow'
import { type MailJSONRequired, sendMailV3 } from './utils.js'

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character] ?? character
  })

export const sendVerificationEmail = ResultFn(async function* (
  apiKey: string,
  fromEmail: string,
  toEmail: string,
  otp: string,
  accountAddress: string,
) {
  const emailContent: MailJSONRequired = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail },
    subject: 'Your ENS email verification code',
    content: [
      {
        type: 'text/plain',
        value: `Your ENS email verification code is ${otp}.

Enter this code in Notification Settings while signed in as ${accountAddress}.
The code expires in 10 minutes. If you did not request it, you can safely ignore this email.`,
      },
      {
        type: 'text/html',
        value: `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#202124">
<h1>Verify your email for ENS notifications</h1>
<p>Enter this code in Notification Settings:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:0.2em">${otp}</p>
<p>Requested for wallet <strong>${escapeHtml(accountAddress)}</strong>.</p>
<p>This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
</body></html>`,
      },
    ],
  }

  return ok(yield* sendMailV3(apiKey, emailContent))
})
