import type { ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import {
  type InvalidRpcUrlError,
  proposeCustomRpcUrl,
  type RpcCheckError,
  type RpcStorageError,
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

// Validates the URL and stores it as the candidate, then reloads so the page
// may reach its origin; useCustomRpcCandidateCheck checks it on that load.
export const applyCustomRpc = (
  input: string,
): ResultAsync<void, InvalidRpcUrlError | RpcStorageError> =>
  validateRpcUrl(input).asyncAndThen(proposeCustomRpcUrl)

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
