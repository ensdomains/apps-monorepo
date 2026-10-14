import { getChainContractAddress } from 'viem'
import { useClient } from 'wagmi'
import type { ensChain } from '@/lib/wagmi'

type EnsChain = typeof ensChain
export const useContractAddress = <
  TContractName extends keyof EnsChain['contracts'],
>({
  contract,
  blockNumber,
}: {
  contract: TContractName
  blockNumber?: bigint
}) => {
  const client = useClient()

  return getChainContractAddress({
    chain: client?.chain as EnsChain,
    contract,
    blockNumber,
  })
}
