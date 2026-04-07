import { expect } from '@playwright/test'

const MAILINATOR_API_KEY = process.env.MAILINATOR_API_KEY
const MAILINATOR_DOMAIN = process.env.MAILINATOR_DOMAIN
const MAILINATOR_V2_BASE = 'https://api.mailinator.com/v2'

function checkApiKey() {
  if (!MAILINATOR_API_KEY) {
    throw new Error('MAILINATOR_API_KEY is required in environment for mailinator helpers')
  }
}

function checkDomain() {
    if (!MAILINATOR_DOMAIN) {
        throw new Error('MAILINATOR_DOMAIN is required in environment for mailinator helpers')
    }
}

async function authFetch(endpoint: string) {
    checkApiKey()

    const res = await fetch(`${MAILINATOR_V2_BASE}${endpoint}`, {
        headers: {
            Authorization: `Bearer ${MAILINATOR_API_KEY}`,
            Accept: 'application/json',
        },
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Mailinator API request failed (${res.status}): ${text}`)
    }

    return res.json()
}

export async function getInboxMessages(inbox: string): Promise<Record<string, unknown>> {
    checkDomain()
    return authFetch(`/domains/${MAILINATOR_DOMAIN}/inboxes/${inbox}`)
}

export async function getMessageById(messageId: string) {
    checkDomain()
    return authFetch(`/domains/${MAILINATOR_DOMAIN}/messages/${messageId}`)
export async function waitForMessage(inbox: string, predicate: (message: MailinatorMessage) => boolean, timeoutMs = 60_000) {

export async function waitForMessage(inbox: string, predicate: (message: Record<string, unknown>) => boolean, timeoutMs = 60_000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const inboxData = await getInboxMessages(inbox)
    const candidate = messages.find(predicate)

        const candidate = (messages as any[]).find(predicate)
        if (candidate) return candidate

        await new Promise((resolve) => setTimeout(resolve, 1_000))
export function findVerifyLink(message: MailinatorMessage): string {
  // Check clickthrough links first
  const clickable = message.clickablelinks?.find((link) =>
    (link.text || '').includes('Verify Email Address') || (link.link || '').includes('/notifications/channels/email/verify'),
  )
    // Check clickthrough links first
    const clickable = message.clickablelinks?.find((link: any) =>
        (link.text || '').includes('Verify Email Address') || (link.link || '').includes('/notifications/channels/email/verify'),
    )
    if (clickable?.link) return clickable.link
  const bodies = [message.parts?.map((p) => p.body).join('\n')].filter(Boolean)
    // fallback to body text
    const bodies = [message.parts?.map((p: any) => p.body).join('\n')].filter(Boolean)
    for (const body of bodies) {
        const match = body.match(/https?:\/\/[^\s]+\/(notifications\/channels\/email\/verify\?token=[A-Za-z0-9._%=-]+)/)
        if (match) {
            return match[0]
        }
    }

    throw new Error('Could not find email verification link in message content')
}

export function createRandomInbox() {
    return `e2e-${Date.now()}-${Math.floor(Math.random() * 9_000_000).toString().padStart(7, '0')}`
}

export function createEmailAddress(inbox: string) {
    checkDomain()
    return `${inbox}@${MAILINATOR_DOMAIN}`
}

export async function expectMessageWithSubject(inbox: string, expectedSubject: string, timeoutMs = 60_000) {
    const msg = await waitForMessage(
        inbox,
        (m) => (m.subject || '').toLowerCase() === expectedSubject.toLowerCase(),
        timeoutMs,
    )
    expect(msg.subject).toBe(expectedSubject)
    return msg
}
