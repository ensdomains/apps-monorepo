import { getChainContractAddress } from 'viem'
import { useClient } from 'wagmi'
import { sepoliaWithEns } from '@/lib/wagmi'

type SepoliaWithEns = typeof sepoliaWithEns
export const useContractAddress = <
  TContractName extends keyof SepoliaWithEns['contracts'],
>({
  contract,
  blockNumber,
}: {
  contract: TContractName
  blockNumber?: bigint
}) => {
  const client = useClient({ chainId: sepoliaWithEns.id })

  return getChainContractAddress({
    chain: client?.chain as SepoliaWithEns,
    contract,
    blockNumber,
  })
}
