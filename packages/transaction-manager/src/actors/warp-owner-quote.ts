import type { RhinestoneAccount } from '@rhinestone/sdk'
import { err, ok, ResultAsync } from 'neverthrow'
import type { Chain } from 'viem'
import type { RhinestoneTransactionRequest } from '../types/transaction.types'
import {
  checkOwnerIntentRoute,
  OwnerIntentValidationError,
} from './warp-owner-intent'

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
    const error = checkOwnerIntentRoute({
      request: input.request,
      intentRoute: prepared.intentRoute,
    })
    return error ? err(error) : ok(undefined)
  })
