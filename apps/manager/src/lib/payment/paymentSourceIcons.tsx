import {
  BaseChainBadge,
  DAI,
  SepoliaChainBadge,
  USDCIcon,
} from '@/components/atoms/StableCoinsIcons'
import { BASE_SEPOLIA_CHAIN_ID, type PaymentSource } from './crossChainSources'

type IconComponent = (props: { className?: string }) => React.ReactElement

/**
 * UI-only icon mapping for payment sources. Kept separate from
 * `crossChainSources` (pure data) so the registration state machine — bundled
 * for the Workers/SSR runtime — never pulls React components into its module
 * graph.
 */

const TOKEN_ICONS: Record<PaymentSource['symbol'], IconComponent> = {
  USDC: USDCIcon,
  DAI,
}

export function getTokenIcon(source: PaymentSource): IconComponent {
  return TOKEN_ICONS[source.symbol] ?? USDCIcon
}

export function getChainBadge(source: PaymentSource): IconComponent {
  return source.sourceChainId === BASE_SEPOLIA_CHAIN_ID
    ? BaseChainBadge
    : SepoliaChainBadge
}
