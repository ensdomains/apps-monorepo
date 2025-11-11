import { ens_split } from '@adraffy/ens-normalize'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircleIcon } from 'lucide-react'
import { labelhash, namehash } from 'viem/ens'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getWrapperDataQueryOptions } from '@/features/resolver/hooks/useWrapperData'
import { useContractAddress } from '@/hooks/useContractAddress'
import { cn } from '@/lib/utils'
import { asciiEncode } from '@/utils/token/ascii'
import { dnsEncodeName } from '@/utils/token/dnsEncodeName'
import { escapeUnicode } from '@/utils/token/escapeUnicode'
import { isNormalized } from '@/utils/token/isNormalized'

export const Route = createFileRoute('/$name/token')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const nameWrapperAddress = useContractAddress({ contract: 'ensNameWrapper' })
  const registrarAddress = useContractAddress({
    contract: 'ensBaseRegistrarImplementation',
  })

  const {
    data: wrapperData,
    error: isWrappedError,
    isLoading,
  } = useQuery(getWrapperDataQueryOptions({ name }))

  if (isWrappedError) return <div>Error: {isWrappedError.message}</div>

  if (isLoading) return <div>Loading...</div>

  const isWrapped = Boolean(wrapperData)

  const contractAddress = isWrapped ? nameWrapperAddress : registrarAddress

  const hex = isWrapped ? namehash(name) : labelhash(name.split('.')[0])
  const tokenId = BigInt(hex).toString(10)

  const parts = ens_split(name)

  const dnsEncode = dnsEncodeName(name)

  const ascii = asciiEncode(name)

  const hash = namehash(ascii)

  const normalized = isNormalized(name)

  const hasEmoji = Boolean(parts.find((part) => part.emoji))

  const labels = parts.map((label) => String.fromCodePoint(...label.input))

  const encoding = parts.map((part) => part.type).join(' + ')

  return (
    <div className="p-6">
      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <header>
          <h1 className="text-[28px] font-medium">Token info</h1>
        </header>
        <div className="flex border border-gray-200 rounded-lg w-full p-6 gap-6 flex-wrap">
          <div className="flex flex-col gap-1 w-full max-w-full lg:w-max">
            <Label info="The address of the contract that owns the name">
              Contract
            </Label>
            <CopyableRecord value={contractAddress} />
          </div>
          <div className="flex flex-col gap-1 w-full max-w-full lg:w-max">
            <Label>Token Standard</Label>
            <CopyableRecord
              value={isWrapped ? 'NameWrapper' : 'Base Registrar'}
            />
          </div>
          <div className="flex flex-col gap-1 w-full max-w-full">
            <Label>Token ID</Label>
            <CopyableRecord value={tokenId} className="max-w-full" />
          </div>
          <div className="flex flex-col gap-1 w-full max-w-full lg:w-max">
            <Label>Token ID (HEX)</Label>
            <CopyableRecord value={hex} />
          </div>
        </div>
        <div className="flex border border-gray-200 rounded-lg flex-col">
          <div className="flex flex-col w-full p-6 gap-6">
            <h2 className="font-medium text-2xl">Normalization</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col gap-1">
                <Label>Input</Label>
                <div className="flex flex-row gap-1 flex-wrap min-w-[38px] items-end">
                  {parts.map((label, idx) => (
                    <>
                      <span
                        className="px-1 py-2 font-mono border border-gray-200 rounded-sm"
                        key={String.fromCodePoint(...label.input)}
                      >
                        {String.fromCodePoint(...label.input)}
                      </span>
                      {idx < parts.length - 1 && (
                        <span className="mx-1 py-2">·</span>
                      )}
                    </>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Normalization</Label>
                <div className="flex flex-row gap-4 items-center">
                  <div
                    className={cn(
                      'p-2 pr-4 rounded-[99px] w-max flex flex-row items-center gap-1',
                      normalized ? 'bg-green-200' : 'bg-red-200',
                    )}
                  >
                    <CheckCircleIcon className="size-4" />
                    <div>{normalized ? 'Normalized' : 'Not Normalized'}</div>
                  </div>
                  <div>{hasEmoji ? `${encoding} + Emoji` : encoding}</div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Unicode</Label>
                <CopyableRecord value={escapeUnicode(name)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>ASCII</Label>
                <CopyableRecord value={ascii} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>DNS-encoded</Label>
                <CopyableRecord value={dnsEncode} className="max-w-full" />
              </div>
              <div className="flex flex-col gap-1 w-full max-w-full">
                <Label>Namehash</Label>
                <CopyableRecord value={hash} className="max-w-full" />
              </div>
            </div>
          </div>
          {labels[0] ? (
            <Tabs defaultValue={labels[0]}>
              <div className="pl-6 border-b w-full border-b-gray-300">
                <span className="font-medium">Labels: </span>
                <TabsList>
                  {labels.map((label) => {
                    return (
                      <TabsTrigger key={label} value={label}>
                        {label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>
              {parts.map((part) => {
                const label = String.fromCodePoint(...part.input)
                return (
                  <TabsContent
                    className="grid grid-cols-2 gap-6"
                    value={label}
                    key={label}
                  >
                    <div className="flex flex-col gap-1">
                      <Label>Input</Label>
                      <CopyableRecord value={label} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Normalization</Label>
                      <CopyableRecord value={part.type as string} />
                    </div>
                    <div className="flex flex-col gap-1 col-span-full">
                      <Label>Labelhash</Label>
                      <CopyableRecord value={labelhash(label)} />
                    </div>
                  </TabsContent>
                )
              })}
            </Tabs>
          ) : (
            <div>Invalid name: no labels</div>
          )}
        </div>
      </div>
    </div>
  )
}
