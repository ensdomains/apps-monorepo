import { ens_split } from '@adraffy/ens-normalize'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightFromLineIcon,
  CheckCircleIcon,
  InfoIcon,
  XCircleIcon,
} from 'lucide-react'
import type { Address, Hex } from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataRow } from '@/components/DataRow'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getRegistryNameDataQueryOptions } from '@/features/registry/hooks/useRegistryNameData'
import { getWrapperDataQueryOptions } from '@/features/resolver/hooks/useWrapperData'
import { useContractAddress } from '@/hooks/useContractAddress'
import { cn } from '@/lib/utils'
import { asciiEncode } from '@/utils/token/ascii'
import { dnsEncodeName } from '@/utils/token/dnsEncodeName'
import { escapeUnicode } from '@/utils/token/escapeUnicode'
import { isNormalized } from '@/utils/token/isNormalized'

export const Route = createFileRoute('/$name/token')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

const TokenInfoCard = ({
  contractAddress,
  tokenId,
  hex,
  tokenStandard,
}: {
  contractAddress: Address
  tokenId: string
  hex: Hex
  tokenStandard: 'ERC-1155' | 'ERC-721'
}) => {
  return (
    <div className="flex border border-border rounded-2xl w-full p-6 flex-col gap-4">
      <DataRow label="Protocol" tooltip="The ENS protocol version">
        <span className="text-base">ENSv2</span>
      </DataRow>

      <DataRow label="Token Standard" tooltip="The token standard used">
        <CopyableRecord value={tokenStandard} />
      </DataRow>

      <DataRow label="Contract" tooltip="The smart contract address">
        <CopyableRecord value={contractAddress} />
      </DataRow>

      <DataRow label="Token ID" tooltip="The token identifier">
        <div className="flex items-center gap-4 justify-between w-full">
          <CopyableRecord value={tokenId} className="flex-1 min-w-0" />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1 shrink-0">
                <ArrowRightFromLineIcon className="size-4" />
                <span className="text-xs font-medium">More</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:max-w-2xl overflow-y-auto"
            >
              <SheetHeader className="px-8 pt-8">
                <SheetTitle className="text-[30px] font-medium leading-tight">
                  Token ID
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-8 py-6">
                <div className="flex flex-col gap-4">
                  <DataRow label="Hash" tooltip="The full token ID hash">
                    <CopyableRecord value={tokenId} />
                  </DataRow>

                  <DataRow label="HEX" tooltip="The token ID in hexadecimal">
                    <CopyableRecord value={hex} />
                  </DataRow>

                  <DataRow
                    label="Last changed"
                    tooltip="When the token ID was last updated"
                  >
                    <span className="font-mono text-base">—</span>
                  </DataRow>
                </div>

                <div className="bg-quartz-50 rounded-lg p-3 flex gap-2 items-start">
                  <InfoIcon className="size-6 text-quartz-500 shrink-0 mt-0.5" />
                  <p className="text-base">
                    The Token ID will change anytime the roles are updated.
                  </p>
                </div>

                <div>
                  <h3 className="text-2xl font-medium mb-4">History</h3>
                  <div className="border border-border rounded-2xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-2">
                          <TableHead className="px-3">Date</TableHead>
                          <TableHead className="px-3">Transaction</TableHead>
                          <TableHead className="px-3">Token ID Hash</TableHead>
                          <TableHead className="px-3">Token ID HEX</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center py-8 text-quartz-500"
                          >
                            No history available
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </DataRow>
    </div>
  )
}

const TokenV1Name = ({ name }: { name: string }) => {
  const nameWrapperAddress = useContractAddress({ contract: 'ensNameWrapper' })
  const registrarAddress = useContractAddress({
    contract: 'ensBaseRegistrarImplementation',
  })

  const {
    data: wrapperData,
    error: isWrappedError,
    isLoading,
  } = useQuery(getWrapperDataQueryOptions({ name }))

  if (isWrappedError)
    return (
      <ErrorMessage
        title="Error loading data"
        description={isWrappedError.cause?.message || isWrappedError.message}
      />
    )

  if (isLoading) return <LoadingMessage />

  const isWrapped = Boolean(wrapperData)

  const contractAddress = isWrapped ? nameWrapperAddress : registrarAddress

  const tokenStandard = isWrapped ? 'ERC-1155' : 'ERC-721'

  const hex = isWrapped ? namehash(name) : labelhash(name.split('.')[0])
  const tokenId = BigInt(hex).toString(10)

  return <TokenInfoCard {...{ contractAddress, tokenId, hex, tokenStandard }} />
}

const TokenV2Name = ({ name }: { name: string }) => {
  const label = name.split('.')[0]

  const hex = labelhash(label)

  const { data, error, isLoading } = useQuery(
    getRegistryNameDataQueryOptions({
      label,
      registryAddress: '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c',
    }),
  )

  if (error)
    return <div>Error loading registry data: {error.cause?.message}</div>

  if (isLoading) return <LoadingSpinner title="Loading owner data" />

  if (!data) return null

  return (
    <TokenInfoCard
      tokenStandard="ERC-1155"
      tokenId={data[0].toString(10)}
      hex={hex}
      contractAddress="0x5fb63bbd34de21688c8aa8131be1c3b4a477109c"
    />
  )
}

function RouteComponent() {
  const { name } = Route.useParams()

  const { data, isLoading, error } = useQuery(getEnsOwnerQueryOptions({ name }))

  if (error) return <div>Error loading owner: {error.cause?.message}</div>

  if (isLoading) return <LoadingSpinner title="Loading owner data" />

  const parts = ens_split(name)

  const dnsEncode = dnsEncodeName(name)

  const ascii = asciiEncode(name)

  const hash = namehash(ascii)

  const normalized = isNormalized(name)

  const hasEmoji = Boolean(parts.find((part) => part.emoji))

  const labels = parts.map((label) => String.fromCodePoint(...label.input))

  const encoding = parts.map((part) => part.type).join(' + ')

  return (
    <div className="flex flex-col gap-6 p-6 max-w-360 mx-auto w-full">
      <header>
        <h1 className="text-[30px] font-medium leading-tight">Token Info</h1>
      </header>

      {data?.network === 'sepolia' ? (
        <TokenV1Name name={name} />
      ) : (
        <TokenV2Name name={name} />
      )}

      {/* Normalization Section */}
      <h2 className="font-medium text-2xl">Normalization</h2>
      <div className="flex border border-border rounded-2xl flex-col">
        <div className="flex flex-col w-full p-6 gap-4">
          <DataRow label="Input" tooltip="The input name parts">
            <div className="flex flex-row gap-1 flex-wrap items-center">
              {parts.map((label, idx) => (
                <div
                  key={String.fromCodePoint(...label.input)}
                  className="contents"
                >
                  <span className="px-2 py-1 font-mono border border-border rounded">
                    {String.fromCodePoint(...label.input)}
                  </span>
                  {idx < parts.length - 1 && <span className="mx-0.5">.</span>}
                </div>
              ))}
            </div>
          </DataRow>

          <DataRow label="Normalization" tooltip="The normalization status">
            <div className="flex flex-row gap-2 items-center flex-wrap">
              <span className="font-mono">
                {hasEmoji ? `${encoding} + Emoji` : encoding}
              </span>
              <div
                className={cn(
                  'px-2 py-1 rounded-full flex flex-row items-center gap-1',
                  normalized ? 'bg-peridot-100' : 'bg-garnet-100',
                )}
              >
                {normalized ? (
                  <CheckCircleIcon className="size-4 text-success" />
                ) : (
                  <XCircleIcon className="size-4 text-danger" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    normalized ? 'text-success' : 'text-danger',
                  )}
                >
                  {normalized ? 'Normalized' : 'Not Normalized'}
                </span>
              </div>
            </div>
          </DataRow>

          <DataRow label="Unicode" tooltip="The Unicode representation">
            <CopyableRecord value={escapeUnicode(name)} />
          </DataRow>

          <DataRow label="ASCII" tooltip="The ASCII representation">
            <CopyableRecord value={ascii} />
          </DataRow>

          <DataRow label="DNS encoded" tooltip="The DNS-encoded representation">
            <CopyableRecord value={dnsEncode} className="max-w-full" />
          </DataRow>

          <DataRow label="Namehash" tooltip="The namehash of the name">
            <CopyableRecord value={hash} className="max-w-full" />
          </DataRow>
        </div>
      </div>

      {/* Labels Section */}
      <h2 className="font-medium text-2xl">Labels</h2>
      {labels[0] ? (
        <div className="border border-border rounded-2xl overflow-hidden">
          <Tabs defaultValue={labels[0]} className="gap-0">
            <div className="px-6 border-b border-border flex items-center gap-2">
              <TabsList>
                {labels.map((label, idx) => (
                  <div key={label} className="contents">
                    <TabsTrigger value={label}>{label}</TabsTrigger>
                    {idx < labels.length - 1 && (
                      <span className="font-medium">.</span>
                    )}
                  </div>
                ))}
              </TabsList>
            </div>
            {parts.map((part) => {
              const label = String.fromCodePoint(...part.input)
              const labelBytes = new TextEncoder().encode(label).length
              const labelChars = [...label].length
              return (
                <TabsContent
                  className="flex flex-col gap-4 m-0"
                  value={label}
                  key={label}
                >
                  <DataRow label="Input" tooltip="The label input">
                    <CopyableRecord value={escapeUnicode(label)} />
                  </DataRow>

                  <DataRow
                    label="Normalization"
                    tooltip="The normalization type"
                  >
                    <span>{part.type as string}</span>
                  </DataRow>

                  <DataRow label="Bytes" tooltip="The byte length of the label">
                    <CopyableRecord value={labelBytes} />
                  </DataRow>

                  <DataRow
                    label="Characters"
                    tooltip="The character count of the label"
                  >
                    <CopyableRecord value={labelChars} />
                  </DataRow>

                  <DataRow
                    label="Labelhash"
                    tooltip="The labelhash of this label"
                  >
                    <CopyableRecord value={labelhash(label)} />
                  </DataRow>
                </TabsContent>
              )
            })}
          </Tabs>
        </div>
      ) : (
        <div className="border border-border rounded-2xl p-6">
          Invalid name: no labels
        </div>
      )}
    </div>
  )
}
