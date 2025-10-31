import { getChainContractAddress } from 'viem'
import { useClient } from 'wagmi'
import type { ChainType } from '@/lib/wagmi'

export const useContractAddress = <
  TContractName extends keyof ChainType['contracts'],
>({
  contract,
  blockNumber,
}: {
  contract: TContractName
  blockNumber?: bigint
}) => {
  const client = useClient()

  return getChainContractAddress({
    chain: client?.chain as ChainType,
    contract,
    blockNumber,
  })
}
