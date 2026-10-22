import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { envConfig } from '@/config'

const STORAGE_KEY = 'custom-rpc-url'
const CHECK_TIMEOUT_MS = 10_000
const PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])
export const WEBSOCKET_URL = /^wss?:/

export class InvalidRpcUrlError extends TaggedError('CustomRpc/InvalidUrl')<{
  readonly reason: 'empty' | 'malformed' | 'protocol' | 'credentials'
  readonly cause: unknown
}> {}

export class RpcCheckError extends TaggedError('CustomRpc/CheckFailed')<{
  readonly reason: 'unreachable' | 'wrong-chain'
  readonly cause: unknown
}> {}

export class RpcStorageError extends TaggedError('CustomRpc/StorageFailed')<{
  readonly cause: unknown
}> {}

export const validateRpcUrl = (
  input: string,
): Result<string, InvalidRpcUrlError> => {
  const trimmed = input.trim()
  if (!trimmed)
    return err(new InvalidRpcUrlError({ reason: 'empty', cause: input }))

  return fromSync(
    () => new URL(trimmed),
    (cause) => new InvalidRpcUrlError({ reason: 'malformed', cause }),
  ).andThen((url) => {
    if (!PROTOCOLS.has(url.protocol))
      return err(
        new InvalidRpcUrlError({ reason: 'protocol', cause: url.protocol }),
      )
    // The origin, so the error never carries the credentials themselves.
    if (url.username || url.password)
      return err(
        new InvalidRpcUrlError({ reason: 'credentials', cause: url.origin }),
      )
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
// Blocked or full storage throws; report it rather than reload unchanged.
export const saveCustomRpcUrl = (url: string): Result<void, RpcStorageError> =>
  fromSync(
    () => localStorage.setItem(STORAGE_KEY, JSON.stringify(url)),
    (cause) => new RpcStorageError({ cause }),
  ).map(() => window.location.reload())

export const resetCustomRpcUrl = (): Result<void, RpcStorageError> =>
  fromSync(
    () => localStorage.removeItem(STORAGE_KEY),
    (cause) => new RpcStorageError({ cause }),
  ).map(() => window.location.reload())

const isWebSocketUrl = (url: string): boolean => WEBSOCKET_URL.test(url)

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
      return err(new RpcCheckError({ reason: 'unreachable', cause: chainId }))
    return BigInt(chainId) === BigInt(envConfig.chain.id)
      ? ok()
      : err(new RpcCheckError({ reason: 'wrong-chain', cause: chainId }))
  })
  clearTimeout(timer)
  return result
}
