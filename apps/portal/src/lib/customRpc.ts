import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { envConfig } from '@/config'
import {
  CUSTOM_RPC_CANDIDATE_COOKIE,
  CUSTOM_RPC_COOKIE,
  readCookie,
  toCspOrigin,
} from './customRpcOrigin'

const CHECK_TIMEOUT_MS = 10_000
// Chrome's cap on cookie lifetime: 400 days.
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60
const PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])
export const WEBSOCKET_URL = /^wss?:/

export class InvalidRpcUrlError extends TaggedError('CustomRpc/InvalidUrl')<{
  readonly reason: 'empty' | 'malformed' | 'protocol' | 'credentials' | 'host'
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
    // The worker can only allow what a CSP source expresses (worker/csp.ts).
    if (toCspOrigin(url.href) === null)
      return err(
        new InvalidRpcUrlError({ reason: 'host', cause: url.hostname }),
      )
    return ok(url.toString())
  })
}

// Each setting is a URL in localStorage plus its origin in a cookie, which is
// what the worker allows in connect-src. The candidate holds a newly entered
// URL until a load that can reach it has checked it.
type Slot = { readonly storageKey: string; readonly cookie: string }
const ACTIVE: Slot = { storageKey: 'custom-rpc-url', cookie: CUSTOM_RPC_COOKIE }
const CANDIDATE: Slot = {
  storageKey: 'custom-rpc-candidate',
  cookie: CUSTOM_RPC_CANDIDATE_COOKIE,
}

// Null when unreadable, invalid, or its origin cookie is gone: the page's CSP
// only allows the origins those cookies carried at load.
const readSlot = (slot: Slot): string | null => {
  const result = fromSync(
    (): string | null => {
      const stored = localStorage.getItem(slot.storageKey)
      if (!stored) return null
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed !== 'string') return null
      const validated = validateRpcUrl(parsed)
      if (validated.isErr()) return null
      const allowed = readCookie(document.cookie, slot.cookie)
      return allowed === toCspOrigin(validated.value) ? validated.value : null
    },
    () => null,
  )
  return result.isOk() ? result.value : null
}

// Read once at startup (wagmi clients are built once); null means the default.
export const getCustomRpcUrl = (): string | null => readSlot(ACTIVE)

export const getCustomRpcCandidate = (): string | null => readSlot(CANDIDATE)

// Async so a missing Cookie Store API rejects instead of throwing past
// fromPromise. Cookie Store cookies are always Secure, as `__Host-` requires.
const writeOriginCookie = async (
  name: string,
  origin: string | null,
): Promise<void> =>
  origin === null
    ? cookieStore.delete({ name, path: '/' })
    : cookieStore.set({
        name,
        value: encodeURIComponent(origin),
        path: '/',
        sameSite: 'lax',
        expires: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
      })

const writeSlot = (
  slot: Slot,
  url: string | null,
): ResultAsync<void, RpcStorageError> =>
  fromSync(
    () =>
      url === null
        ? localStorage.removeItem(slot.storageKey)
        : localStorage.setItem(slot.storageKey, JSON.stringify(url)),
    (cause) => new RpcStorageError({ cause }),
  ).asyncAndThen(() =>
    ResultAsync.fromPromise(
      writeOriginCookie(slot.cookie, url === null ? null : toCspOrigin(url)),
      (cause) => new RpcStorageError({ cause }),
    ),
  )

// Read back, so blocked or full storage reports an error instead of
// reloading unchanged.
const confirmSlot = (slot: Slot, url: string): Result<void, RpcStorageError> =>
  readSlot(slot) === url
    ? ok()
    : err(new RpcStorageError({ cause: 'setting did not persist' }))

// The page can only reach origins it loaded with, so a new URL is stored as
// the candidate and the page reloads; that load checks it and promotes it if
// it passes. wagmi builds its clients once, so promotion reloads again.
export const proposeCustomRpcUrl = (
  url: string,
): ResultAsync<void, RpcStorageError> =>
  writeSlot(CANDIDATE, url)
    .andThen(() => confirmSlot(CANDIDATE, url))
    .map(() => window.location.reload())

export const promoteCustomRpcCandidate = (
  url: string,
): ResultAsync<void, RpcStorageError> =>
  writeSlot(ACTIVE, url)
    .andThen(() => writeSlot(CANDIDATE, null))
    .andThen(() => confirmSlot(ACTIVE, url))
    .map(() => window.location.reload())

export const discardCustomRpcCandidate = (): ResultAsync<
  void,
  RpcStorageError
> => writeSlot(CANDIDATE, null)

export const resetCustomRpcUrl = (): ResultAsync<void, RpcStorageError> =>
  writeSlot(ACTIVE, null)
    .andThen(() => writeSlot(CANDIDATE, null))
    .map(() => window.location.reload())

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
