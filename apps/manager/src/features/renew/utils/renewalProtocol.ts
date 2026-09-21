import { ENS_CONTRACTS } from '@/lib/contracts'

export type RenewalProtocol = 'v1' | 'v2'

export const getRenewerAddress = (protocol: RenewalProtocol) =>
  protocol === 'v1' ? ENS_CONTRACTS.ETHRenewerV1 : ENS_CONTRACTS.ETHRegistrar

export const getRenewalRoute = (protocol: RenewalProtocol) =>
  protocol === 'v1' ? ('/renew-v1/$name' as const) : ('/renew/$name' as const)
