import { okAsync } from 'neverthrow'
import { expect, it, vi } from 'vitest'

const sendMailV3 = vi.hoisted(() => vi.fn())
vi.mock('./utils.js', () => ({ sendMailV3 }))

import { EMAIL_OTP_TTL_MS } from './challenges.js'
import { sendVerificationEmail } from './verification.js'

it('sends a code and wallet context in both email parts without a verification link', async () => {
  sendMailV3.mockReturnValue(okAsync({ statusCode: 202 }))
  const result = await sendVerificationEmail(
    'test-api-key',
    'ens@example.com',
    'recipient@example.com',
    '004219',
    '0xabc123',
  )
  expect(result.isOk()).toBe(true)
  const mail = sendMailV3.mock.calls[0]?.[1] as {
    subject: string
    content: Array<{ type: string; value: string }>
  }
  expect(mail.subject).toBe('Your ENS email verification code')
  expect(mail.content.map((part) => part.type)).toEqual([
    'text/plain',
    'text/html',
  ])
  for (const part of mail.content) {
    expect(part.value).toContain('004219')
    expect(part.value).toContain('0xabc123')
    expect(part.value).toContain(`${EMAIL_OTP_TTL_MS / 60_000} minutes`)
    expect(part.value).not.toContain('/notifications/channels/email/verify')
    expect(part.value).not.toContain('href=')
  }
})
