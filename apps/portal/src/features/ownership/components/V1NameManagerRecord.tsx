import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { namehash } from 'viem'
import { useReadContract } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { Owner } from '@/features/profile/components/Owner'
import { sepoliaWithEns } from '@/lib/wagmi'

const abi = [
  {
    constant: true,
    inputs: [
      {
        internalType: 'bytes32',
        name: 'node',
        type: 'bytes32',
      },
    ],
    name: 'owner',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ensRegistryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

export const V1NameManagerRecord = ({
  name,
  className,
  asRow,
}: {
  name: string
  className?: string
  asRow?: boolean
}) => {
  const {
    data: managerAddress,
    isLoading,
    error,
  } = useReadContract({
    abi,
    functionName: 'owner',
    args: [namehash(name)],
    address: ensRegistryAddress,
  })

  if (error)
    return <ErrorMessage title={error.name} description={error.message} />
  if (isLoading) return <LoadingMessage title="Loading manager" />

  return (
    <Owner
      label="Manager"
      owner={managerAddress}
      className={className}
      asRow={asRow}
    />
  )
}
