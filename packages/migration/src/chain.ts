import {
  extendChainWithEns,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import type { PreflightAddresses } from './preflight'

// The ENS apps currently target Sepolia, so the migration config lives here once
// rather than being re-derived in every consumer. Addresses come from ensjs's
// contract registry, so they match whatever chain object the apps build. When
// the apps go multi-chain, pass overrides at the call site instead.
const chain = extendChainWithEns(sepolia)

/**
 * Known public resolvers on the active chain. Names still pointing at one of
 * these are migrated onto an owned permissioned resolver in v2; anything else
 * keeps its v1 resolver.
 */
export const KNOWN_PUBLIC_RESOLVERS: readonly Address[] = [
  getChainContractAddress({ chain, contract: 'ensPublicResolver' }),
  '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d',
  '0xc30ba2bd21583605d815826c3807e8224e398e10',
  '0x1da022710dF5002339274AaDEe8D58218e9D6AB5',
  '0xDaaF96c344f63131acadD0Ea35170E7892d3dfBA',
  '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41',
  '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
  '0xF29100983E058B709F3D539b0c765937B804AC15',
]

/** Contract addresses the on-chain preflight checks read from. */
export const DEFAULT_PREFLIGHT_ADDRESSES: PreflightAddresses = {
  baseRegistrar: getChainContractAddress({
    chain,
    contract: 'ensBaseRegistrarImplementation',
  }),
  nameWrapper: getChainContractAddress({
    chain,
    contract: 'ensNameWrapper',
  }),
}
