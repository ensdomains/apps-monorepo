import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { encode, toASCII } from 'punycode'
import { labelhash, namehash } from 'viem/ens'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Label } from '@/components/ui/label'
import { getWrapperDataQueryOptions } from '@/features/profile/hooks/useWrapperData'
import { useContractAddress } from '@/hooks/useContractAddress'

export const Route = createFileRoute('/$name/token')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name/token' })
  const nameWrapperAddress = useContractAddress({ contract: 'ensNameWrapper' })
  const registrarAddress = useContractAddress({
    contract: 'ensBaseRegistrarImplementation',
  })

  const isWrapped = useQuery(getWrapperDataQueryOptions({ name }))

  const contractAddress = isWrapped ? nameWrapperAddress : registrarAddress

  const hex = isWrapped ? namehash(name) : labelhash(name.split('.')[0])
  const tokenId = BigInt(hex).toString(10)

  const input = name
    .split('.')
    .flatMap((part, index, arr) =>
      index < arr.length - 1 ? [part, '.'] : [part],
    )

  const ascii = toASCII(name)
  const punycode = encode(name)

  return (
    <div className="p-6">
      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <header>
          <h1 className="text-[28px] font-medium">Token info</h1>
        </header>
        <div className="flex border border-gray-200 rounded-lg w-full p-6 gap-6 flex-wrap">
          <div className="flex flex-col gap-1">
            <Label>Contract</Label>
            <CopyableRecord value={contractAddress} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Token Standard</Label>
            <CopyableRecord
              value={
                contractAddress === nameWrapperAddress
                  ? 'NameWrapper (ERC-721)'
                  : 'ERC-721'
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Protocol version</Label>
            <CopyableRecord value="ENSv1" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Token ID</Label>
            <CopyableRecord value={tokenId} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Token ID (HEX)</Label>
            <CopyableRecord value={hex} />
          </div>
        </div>
        <div className="flex border border-gray-200 rounded-lg">
          <div className="flex flex-col w-full p-6 gap-6">
            <h2 className="font-medium text-2xl">Normalization</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-1">
                <Label>Input</Label>
                <div className="flex flex-row gap-1 flex-wrap min-w-[38px]">
                  {input.map((label) => (
                    <span
                      className="px-1 py-2 font-mono border border-gray-200 rounded-sm"
                      key={label}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1 ">
                <Label>Normalization</Label>
              </div>
              <div className="flex flex-col gap-1">
                <Label>ASCII</Label>
                <CopyableRecord value={ascii} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Punycode</Label>
                <CopyableRecord value={punycode} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
