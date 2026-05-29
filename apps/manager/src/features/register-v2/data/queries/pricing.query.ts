import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { l2EthRegistrarRentPriceSnippet } from '@ensdomains/ensjs/contracts'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address, ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'
import { buildMockedPricing, isTempPremiumMocked } from '../mocks/tempPremiumMock'

const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class GetPricingError extends TaggedError('GetPricingError')<{
  readonly cause: ReadContractErrorType
}> {}

export class MissingTokenError extends TaggedError('MissingTokenError')<
  Record<string, never>
> {}

export const getPricing = ResultFn(async function* (
  name: string,
  ownerAddress: Address,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) {
  if (!token) {
    return err(new MissingTokenError({}))
  }

  // Dev simulation: short-circuit the contract call for labels listed in
  // VITE_FF_MOCK_TEMP_PREMIUM_LABELS. The mocked result is reshaped to match
  // `rentPrice`'s output exactly, including bigints in token decimals, so
  // every downstream consumer (banner, cart total, ConfirmPurchase) sees a
  // realistic, time-varying premium. See mocks/tempPremiumMock.ts.
  if (isTempPremiumMocked(name)) {
    const mocked = yield* fromPromise(
      buildMockedPricing(durationInSeconds, token, name),
      (e) => new GetPricingError({ cause: e as ReadContractErrorType }),
    )
    return ok(mocked)
  }

  const tokenInfo = TOKENS[token]
  const [basePrice, premium] = yield* fromPromise(
    readContract(publicClient, {
      address: ETH_REGISTRAR,
      abi: l2EthRegistrarRentPriceSnippet,
      functionName: 'rentPrice',
      args: [
        name,
        ownerAddress,
        BigInt(Math.ceil(durationInSeconds)),
        tokenInfo.address,
      ],
    }),
    (e) => new GetPricingError({ cause: e as ReadContractErrorType }),
  )

  return ok({
    basePrice,
    premium,
    totalPrice: basePrice + premium,
    token,
    durationInSeconds,
  })
})

/**
 * Cadence for refetching the on-chain rentPrice.
 *
 * The contract computes the temporary premium from block.timestamp on every
 * call, so a name in its 21-day cooldown window has a price that decays
 * continuously. We poll on the same cadence as v3 (60s) so the cart total,
 * the premium pill in the cooldown banner, and the chart's `nowPoint` all
 * stay aligned with the chain. Between refetches the chart and banner pill
 * tick locally (see PriceCooldownBannerSection + useTickingNowMs).
 *
 * Dev override: set `VITE_FF_PRICING_REFETCH_MS=2000` in `.env.local` to
 * make every consumer of the pricing query (cart total, ConfirmPurchase,
 * DurationSelector presets) animate at a faster cadence. Useful when paired
 * with `VITE_FF_MOCK_TEMP_PREMIUM_LABELS` to watch the simulated premium
 * cool down in real time. Defaults to 60_000 in any environment if unset
 * or non-numeric.
 */
const PRICING_REFETCH_INTERVAL_MS: number = (() => {
  const raw = import.meta.env.VITE_FF_PRICING_REFETCH_MS
  const parsed = Number.parseInt(raw ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= 500) return parsed
  return 60_000
})()

export const getPricingQueryOptions = (
  name: string,
  ownerAddress: Address,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) => {
  return resultQueryOptions({
    queryKey: $qk({
      $action: 'get-pricing',
      name,
      ownerAddress,
      durationInSeconds,
      token,
    }),
    queryFn: () => getPricing(name, ownerAddress, durationInSeconds, token),
    refetchInterval: PRICING_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
}
