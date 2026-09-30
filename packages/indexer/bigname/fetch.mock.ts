import { vi } from 'vitest'
import { createBignameClient } from './client'

export const json = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

export const envelope = (data: unknown, page?: unknown) =>
  json({ data, ...(page !== undefined && { page }), meta: { as_of: {} } })

export const apiError = (code: string, status: number) =>
  json({ error: { code, message: `${code} happened`, details: {} } }, status)

/** A client whose fetch replays the given responses in order. */
export const clientWith = (...responses: Response[]) => {
  const fetch = vi.fn(async () => responses.shift() ?? json({}, 500))
  const client = createBignameClient('https://bigname.example/', {
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { client, fetch }
}

export const requestOf = (fetch: ReturnType<typeof vi.fn>, call = 0) => {
  const [url, init] = fetch.mock.calls[call] as [string, RequestInit]
  return { url, init }
}
