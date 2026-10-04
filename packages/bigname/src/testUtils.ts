import { vi } from 'vitest'

interface RecordedCall {
  readonly url: string
  readonly init: RequestInit | undefined
}

type Responder =
  | Response
  | ((call: RecordedCall) => Response | Promise<Response>)

export const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

export const errorResponse = (
  status: number,
  code: string,
  message = code,
  headers: Record<string, string> = {},
): Response =>
  jsonResponse(status, { error: { code, message, details: {} } }, headers)

export const pageOf = <T>(
  data: readonly T[],
  nextCursor: string | null,
  cursor: string | null = null,
) => ({
  data,
  page: {
    cursor,
    next_cursor: nextCursor,
    page_size: data.length,
    total_count: null,
    has_more: nextCursor !== null,
  },
  meta: {},
})

/** A fetch mock that answers calls in order and records each request. */
export const mockFetch = (...responders: Responder[]) => {
  const calls: RecordedCall[] = []
  const queue = [...responders]
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init }
      calls.push(call)
      const next = queue.shift()
      if (!next) throw new Error(`unexpected fetch: ${call.url}`)
      return typeof next === 'function' ? next(call) : next
    },
  )
  return { fetch: fetchMock as unknown as typeof fetch, calls }
}
