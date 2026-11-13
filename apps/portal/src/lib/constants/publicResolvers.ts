import {
  type SupportedL1ChainId,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'

// The PublicResolver ensjs listed before 5.3.0; names set up before then still use it.
export const PREVIOUS_V1_PUBLIC_RESOLVERS: Readonly<
  Record<SupportedL1ChainId, Address>
> = {
  [supportedL1Chains.mainnet]: '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
  [supportedL1Chains.sepolia]: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
}
