export type WithTimestamp<T> = T & {
  timestamp?: bigint
}

export type EnsNetworkName = 'sepolia' | 'namechainSepolia'

export type WithEnsNetwork<T> = T & {
  network: EnsNetworkName
}

export type ProtocolVersion = 'ENSv1' | 'ENSv2'
