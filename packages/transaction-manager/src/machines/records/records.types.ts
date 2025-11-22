import type { Address } from 'viem'

export type ServiceRecordSnapshot = {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string }>
}

export type ServiceRecordText = ServiceRecordSnapshot['texts'][number]
export type ServiceRecordCoin = ServiceRecordSnapshot['coins'][number]

export type ResolverConfig = {
  resolverAddress?: Address
  isDedicatedResolver?: boolean
}
