import { ens_normalize, ens_split, ens_tokenize } from '@adraffy/ens-normalize'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { cx } from 'class-variance-authority'
import { CheckCircleIcon } from 'lucide-react'
import { labelhash, namehash } from 'viem/ens'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getWrapperDataQueryOptions } from '@/features/profile/hooks/useWrapperData'
import { useContractAddress } from '@/hooks/useContractAddress'
import { dnsEncodeName } from '@/utils/dnsEncodeName'

export const Route = createFileRoute('/$name/token')({
  component: RouteComponent,
})

function escapeUnicode(name: string) {
  const tokens = ens_tokenize(name)
  return tokens
    .map((tok) => {
      const cps = tok.cps || (tok.cp !== undefined ? [tok.cp] : [])
      return cps
        .map((cp) => {
          if (cp > 0x7f) {
            // anything beyond ASCII
            return `\\u{${cp.toString(16).toUpperCase()}}`
          }
          return String.fromCodePoint(cp)
        })
        .join('')
    })
    .join('')
}

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

  const parts = ens_split(name)

  const dnsEncode = dnsEncodeName(name)

  const ascii = new URL(`https://${name}`).hostname

  const hash = namehash(ascii)

  const isNormalized = ens_normalize(name) === name

  const hasEmoji = Boolean(parts.find((part) => part.emoji))

  const labels = parts.map((label) => String.fromCodePoint(...label.input))

  return (
    <div className="p-6">
      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
        <header>
          <h1 className="text-[28px] font-medium">Token info</h1>
        </header>
        <div className="flex border border-gray-200 rounded-lg w-full p-6 gap-6 flex-wrap">
          <div className="flex flex-col gap-1 w-full max-w-full lg:w-max">
            <Label>Contract</Label>
            <CopyableRecord value={contractAddress} />
          </div>
          <div className="flex flex-col gap-1 w-full max-w-full lg:w-max">
            <Label>Token Standard</Label>
            <CopyableRecord
              value={
                contractAddress === nameWrapperAddress
                  ? 'NameWrapper (ERC-721)'
                  : 'ERC-721'
              }
            />
          </div>
          <div className="flex flex-col gap-1 w-full max-w-full lg:w-max">
            <Label>Protocol version</Label>
            <CopyableRecord value="ENSv1" />
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
                    className={cx(
                      'p-2 pr-4 rounded-[99px] w-max flex flex-row items-center gap-1',
                      isNormalized ? 'bg-green-200' : 'bg-red-200',
                    )}
                  >
                    <CheckCircleIcon width={16} height={16} />
                    <div>{isNormalized ? 'Normalized' : 'Not Normalized'}</div>
                  </div>
                  <div>
                    {hasEmoji
                      ? `${parts.map((part) => part.type).join(' + ')} + Emoji`
                      : parts.map((part) => part.type).join(' + ')}
                  </div>
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
                <CopyableRecord value={dnsEncode} />
              </div>
              <div className="flex flex-col gap-1 w-full max-w-full">
                <Label>Namehash</Label>
                <CopyableRecord value={hash} className="max-w-full" />
              </div>
            </div>
          </div>
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
                    <CopyableRecord value={part.type as 'ASCII'} />
                  </div>
                  <div className="flex flex-col gap-1 col-span-full">
                    <Label>Labelhash</Label>
                    <CopyableRecord value={labelhash(label)} />
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        </div>
      </div>
    </div>
  )
}
