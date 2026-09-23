import { config } from '@/config'

export type RenewalProtocol = 'v1' | 'v2'

export const getRenewerAddress = (protocol: RenewalProtocol) =>
  protocol === 'v1'
    ? config.chain.contracts.ensEthRenewerV1.address
    : config.chain.contracts.ensEthRegistrar.address

export const getRenewalRoute = (protocol: RenewalProtocol) =>
  protocol === 'v1' ? ('/renew-v1/$name' as const) : ('/renew/$name' as const)
