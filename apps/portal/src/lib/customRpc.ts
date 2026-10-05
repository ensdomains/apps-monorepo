import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { envConfig } from '@/config'

const STORAGE_KEY = 'custom-rpc-url'
const CHECK_TIMEOUT_MS = 10_000
const PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])

export class InvalidRpcUrlError extends TaggedError('CustomRpc/InvalidUrl')<{
  reason: 'empty' | 'malformed' | 'protocol' | 'credentials'
}> {}

export class RpcCheckError extends TaggedError('CustomRpc/CheckFailed')<{
  reason: 'unreachable' | 'wrong-chain'
}> {}

export const validateRpcUrl = (
  input: string,
): Result<string, InvalidRpcUrlError> => {
  const trimmed = input.trim()
  if (!trimmed) return err(new InvalidRpcUrlError({ reason: 'empty' }))

  return fromSync(
    () => new URL(trimmed),
    () => new InvalidRpcUrlError({ reason: 'malformed' }),
  ).andThen((url) => {
    if (!PROTOCOLS.has(url.protocol))
      return err(new InvalidRpcUrlError({ reason: 'protocol' }))
    if (url.username || url.password)
      return err(new InvalidRpcUrlError({ reason: 'credentials' }))
    return ok(url.toString())
  })
}

// Read once at startup (wagmi clients are built once). Anything unreadable or
// invalid falls back to the default RPC.
export const getCustomRpcUrl = (): string | null => {
  const result = fromSync(
    (): string | null => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return null
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed !== 'string') return null
      const validated = validateRpcUrl(parsed)
      return validated.isOk() ? validated.value : null
    },
    () => null,
  )
  return result.isOk() ? result.value : null
}

// wagmi builds its clients once, so a reload is what applies the change.
export const saveCustomRpcUrl = (url: string): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(url))
  window.location.reload()
}

export const resetCustomRpcUrl = (): void => {
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

export const isWebSocketUrl = (url: string): boolean => /^wss?:/.test(url)

const REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'eth_chainId',
  params: [],
})

const fetchChainId = async (url: string, signal: AbortSignal) => {
  if (!isWebSocketUrl(url)) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: REQUEST,
      signal,
    })
    return ((await res.json()) as { result?: unknown }).result
  }

  return new Promise<unknown>((resolve, reject) => {
    const socket = new WebSocket(url)
    const done = (fn: () => void) => {
      signal.removeEventListener('abort', onAbort)
      socket.close()
      fn()
    }
    const onAbort = () => done(() => reject(new Error('aborted')))
    signal.addEventListener('abort', onAbort)
    socket.onopen = () => socket.send(REQUEST)
    socket.onerror = () => done(() => reject(new Error('socket error')))
    socket.onmessage = (event) => {
      // Parse before done(): it removes the abort listener, so a throw here
      // would leave the promise unsettled and the check hanging forever.
      const parsed = fromSync(
        () => JSON.parse(event.data) as { result?: unknown },
        () => new Error('non-JSON response'),
      )
      if (parsed.isErr()) return done(() => reject(parsed.error))
      return done(() => resolve(parsed.value.result))
    }
  })
}

export const checkRpcEndpoint = async (
  url: string,
): Promise<Result<void, RpcCheckError>> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  const result = await ResultAsync.fromPromise(
    fetchChainId(url, controller.signal),
    (cause) => new RpcCheckError({ reason: 'unreachable', cause }),
  ).andThen((chainId): Result<void, RpcCheckError> => {
    if (typeof chainId !== 'string' || !/^0x[0-9a-f]+$/i.test(chainId))
      return err(new RpcCheckError({ reason: 'unreachable' }))
    return BigInt(chainId) === BigInt(envConfig.chain.id)
      ? ok()
      : err(new RpcCheckError({ reason: 'wrong-chain' }))
  })
  clearTimeout(timer)
  return result
}
