import { SUPPORTED_TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import type { Address } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { isFeatureEnabled } from '@/utils/feature-flags'

/**
 * Cross-chain payment sources for ENS registration.
 *
 * The ENS `ETHRegistrar` only ever charges an **L1 (Sepolia) token**, pulled
 * from `_msgSender()` — which for an HCA unwraps to the owning EOA. A
 * "payment source" therefore describes *where the user pays from*, decoupled
 * from *what the registrar is charged*:
 *
 * - For L1 sources (Sepolia USDC/DAI) the source token == the destination
 *   token; no bridging happens.
 * - For L2 sources (Base Sepolia USDC) the user holds the stable on the L2.
 *   A standalone, EOA-signed Rhinestone intent bridges it to the
 *   **destination** L1 token on Sepolia, landing at the EOA owner, BEFORE the
 *   registration runs (Rhinestone requires an EOA-invoked, non-sponsored
 *   bridge — it cannot be batched into the HCA/session/sponsored registration
 *   intent, and needs a prior Permit2 approval on the source chain). Once the
 *   funds land, the existing same-chain owner-key registration runs unchanged.
 *   Pricing, the EOA permit, and the on-chain `register` call are all
 *   denominated in the destination L1 token and are unaffected by the source.
 *
 * Token addresses for L2 are manager-owned: ensjs only models L1, and the
 * routable addresses are dictated by the Rhinestone orchestrator's supported
 * token registry (verified against GET /chains).
 *
 * NOTE: this module is intentionally free of React/JSX so it can be imported
 * by the registration state machine (which is bundled for the Workers/SSR
 * runtime). Token/chain logos live in the UI-only `paymentSourceIcons` module.
 */

export interface PaymentSource {
  /** Stable identifier, also used as the React list key. */
  id: string
  /** Human-readable label, e.g. "USDC" or "USDC (Base)". */
  label: string
  /** Token symbol the registrar quotes/charges in (USDC or DAI). */
  symbol: 'USDC' | 'DAI'
  /** Decimals of BOTH the source and destination token (stables match here). */
  decimals: number
  /** Chain the user funds the payment from. */
  sourceChainId: number
  /** Token address on the source chain (what the user holds / we read balance of). */
  sourceTokenAddress: Address
  /**
   * L1 (Sepolia) token the registrar is actually charged with. For L1 sources
   * this equals `sourceTokenAddress`. For L2 sources this is the Sepolia token
   * Warp bridges into and the registrar pulls from the EOA.
   */
  destinationPaymentToken: Address
  /** Whether settling this source requires a cross-chain bridge. */
  isCrossChain: boolean
}

// Canonical Circle USDC on Sepolia (11155111). Confirmed routable as a Warp
// destination token for Base-Sepolia → Sepolia bridging, and accepted by the
// ENS rent oracle's `isPaymentToken`.
export const SEPOLIA_USDC_ADDRESS: Address =
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'

// Canonical Circle USDC on Base Sepolia (84532) — the L2 source token.
export const BASE_SEPOLIA_USDC_ADDRESS: Address =
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

export const SEPOLIA_CHAIN_ID = sepolia.id
export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id

/**
 * L1 sources mirror the app's existing mock USDC/DAI faucet tokens so they
 * stay aligned with what the faucet mints and the registrar charges today.
 */
const L1_PAYMENT_SOURCES: PaymentSource[] = [
  {
    id: 'usdc-sepolia',
    label: 'USDC',
    symbol: 'USDC',
    decimals: 6,
    sourceChainId: SEPOLIA_CHAIN_ID,
    sourceTokenAddress: SUPPORTED_TOKENS.USDC,
    destinationPaymentToken: SUPPORTED_TOKENS.USDC,
    isCrossChain: false,
  },
  {
    id: 'dai-sepolia',
    label: 'DAI',
    symbol: 'DAI',
    decimals: 18,
    sourceChainId: SEPOLIA_CHAIN_ID,
    sourceTokenAddress: SUPPORTED_TOKENS.DAI,
    destinationPaymentToken: SUPPORTED_TOKENS.DAI,
    isCrossChain: false,
  },
]

/**
 * L2 sources are gated behind the `L2_STABLES` feature flag. The destination
 * is Circle's real Sepolia USDC (the only Sepolia USDC Warp routes into), not
 * the mock — the registrar accepts both.
 */
const L2_PAYMENT_SOURCES: PaymentSource[] = [
  {
    id: 'usdc-base-sepolia',
    label: 'USDC (Base)',
    symbol: 'USDC',
    decimals: 6,
    sourceChainId: BASE_SEPOLIA_CHAIN_ID,
    sourceTokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
    destinationPaymentToken: SEPOLIA_USDC_ADDRESS,
    isCrossChain: true,
  },
]

/**
 * The payment sources available for the current build. L2 sources only appear
 * when the `L2_STABLES` flag is enabled.
 */
export function getPaymentSources(): PaymentSource[] {
  if (isFeatureEnabled('L2_STABLES')) {
    return [...L1_PAYMENT_SOURCES, ...L2_PAYMENT_SOURCES]
  }
  return L1_PAYMENT_SOURCES
}

export function getPaymentSourceById(id: string): PaymentSource | undefined {
  return getPaymentSources().find((source) => source.id === id)
}
