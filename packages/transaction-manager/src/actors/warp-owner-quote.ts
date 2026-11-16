import { fromSync } from '@ens-apps/utils/neverthrow'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { err, ok, ResultAsync } from 'neverthrow'
import type { Chain } from 'viem'
import type { RhinestoneTransactionRequest } from '../types/transaction.types'
import {
  checkOwnerIntentRoute,
  OwnerIntentValidationError,
} from './warp-owner-intent'

export const checkPreparedOwnerIntentRoute = (input: {
  readonly request: RhinestoneTransactionRequest
  readonly account: RhinestoneAccount
  readonly prepared: Parameters<RhinestoneAccount['getTransactionMessages']>[0]
}) => {
  const error = checkOwnerIntentRoute({
    request: input.request,
    intentRoute: input.prepared.intentRoute,
  })
  if (!error) return undefined
  // The mainnet planner includes unsigned legacy claim metadata. Accept it
  // only when the SDK's actual authorization hashes to the local setup.
  return fromSync(
    () => input.account.getTransactionMessages(input.prepared),
    (cause) => new OwnerIntentValidationError({ cause }),
  ).match(
    (signingMessages) =>
      checkOwnerIntentRoute({
        request: input.request,
        intentRoute: input.prepared.intentRoute,
        signingMessages,
      }),
    () => error,
  )
}

/** Refuse an unsupported setup before the wallet pays for its funding approval. */
export const preflightOwnerIntentQuote = (input: {
  readonly request: RhinestoneTransactionRequest
  readonly account: RhinestoneAccount
  readonly chain: Chain
}) =>
  ResultAsync.fromPromise(
    input.account.prepareTransaction({
      sourceChains: [input.chain],
      targetChain: input.chain,
      calls: [...input.request.rhinestoneParams.calls],
      sponsored: { gas: false, bridging: false, swaps: false },
      feeAsset: input.request.rhinestoneParams.feeAsset ?? 'USDC',
      ...(input.request.rhinestoneParams.paymentToken
        ? { sourceAssets: [input.request.rhinestoneParams.paymentToken] }
        : {}),
      tokenRequests: [],
      auxiliaryFunds: input.request.rhinestoneParams.auxiliaryFunds,
    }),
    (cause) =>
      new OwnerIntentValidationError({
        message:
          'The owner setup quote could not be checked before approval. No approval was requested.',
        cause,
      }),
  ).andThen((prepared) => {
    const error = checkPreparedOwnerIntentRoute({
      request: input.request,
      account: input.account,
      prepared,
    })
    return error ? err(error) : ok(undefined)
  })
