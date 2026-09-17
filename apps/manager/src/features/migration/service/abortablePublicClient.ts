import type { EIP1193RequestOptions, PublicClient } from 'viem'
import { call, readContract } from 'viem/actions'
import { withRequestDeadline } from './requestDeadline'

/**
 * Bind preflight actions to the caller's cancellation scope. Using the actions
 * against this client also guards their later RPC calls, instead of leaving
 * methods bound to the original client's uncancellable request function.
 */
export const abortablePublicClient = (
  publicClient: PublicClient,
  signal: AbortSignal,
): PublicClient => {
  const guarded = new Proxy(publicClient, {
    get(target, property, receiver) {
      if (property === 'request') {
        return (
          args: Parameters<PublicClient['request']>[0],
          options?: EIP1193RequestOptions,
        ) =>
          withRequestDeadline(
            () => target.request(args, { ...options, retryCount: 0 }),
            { signal },
          )
      }
      if (property === 'readContract') {
        return (args: Parameters<PublicClient['readContract']>[0]) =>
          withRequestDeadline(() => readContract(guarded, args), { signal })
      }
      if (property === 'call') {
        return (args: Parameters<PublicClient['call']>[0]) =>
          withRequestDeadline(() => call(guarded, args), { signal })
      }
      return Reflect.get(target, property, receiver)
    },
  })
  return guarded
}
