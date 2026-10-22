import { okAsync, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import {
  checkRpcEndpoint,
  type InvalidRpcUrlError,
  type RpcCheckError,
  type RpcStorageError,
  saveCustomRpcUrl,
  validateRpcUrl,
} from '@/lib/customRpc'

export type CustomRpcError =
  | InvalidRpcUrlError
  | RpcCheckError
  | RpcStorageError

const INVALID_MESSAGES: Record<InvalidRpcUrlError['reason'], string> = {
  empty: 'Enter an RPC URL.',
  malformed: 'That is not a valid URL.',
  protocol: 'Use an http(s):// or ws(s):// URL.',
  credentials: 'Remove the username and password from the URL.',
  host: 'Use a domain name or an IPv4 address.',
}

// Plaintext to anything but this machine is blocked as mixed content.
const isPlaintextRemote = (input: string) => {
  const url = input.trim().toLowerCase()
  return (
    /^(http|ws):/.test(url) &&
    !/^(http|ws):\/\/(localhost|127\.0\.0\.1)([:/?#]|$)/.test(url)
  )
}

// Validates and checks the URL, then saves it (which reloads the page) unless
// `isCurrent` reports the attempt was superseded while the check ran.
export const applyCustomRpc = (
  input: string,
  isCurrent: () => boolean,
): ResultAsync<void, CustomRpcError> =>
  validateRpcUrl(input)
    .asyncAndThen((url) =>
      ResultAsync.fromSafePromise(checkRpcEndpoint(url)).andThen((checked) =>
        checked.map(() => url),
      ),
    )
    .andThen(
      (url): ResultAsync<void, RpcStorageError> =>
        isCurrent() ? saveCustomRpcUrl(url) : okAsync(),
    )

export const describeRpcError = (
  error: CustomRpcError,
  input: string,
): string =>
  match(error)
    .with(
      { _tag: 'CustomRpc/InvalidUrl' },
      ({ reason }) => INVALID_MESSAGES[reason],
    )
    .with(
      { _tag: 'CustomRpc/CheckFailed', reason: 'wrong-chain' },
      () => 'This RPC is on a different network.',
    )
    .with({ _tag: 'CustomRpc/CheckFailed', reason: 'unreachable' }, () =>
      isPlaintextRemote(input)
        ? 'Could not reach this RPC. Plain http/ws is blocked on remote hosts; use https/wss.'
        : 'Could not reach this RPC.',
    )
    .with(
      { _tag: 'CustomRpc/StorageFailed' },
      () => 'Your browser blocked saving this setting.',
    )
    .exhaustive()
