import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getSubregistryHistory } from '@ensdomains/ensjs/public/v2'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address, GetLogsErrorType } from 'viem'
import { getBlockNumber } from 'viem/actions'
import { CopyableRecord } from '@/components/molecules/CopyableRecord'
import { LoadingSpinner } from '@/components/molecules/LoadingSpinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetRegistryHistoryError extends TaggedError(
  'GetRegistryHistoryError',
)<{
  cause: GetLogsErrorType
}> {}

type GetRegistryHistoryParameters = {
  registryAddress: Address
  label: string
}

type SubregistryHistoryEntry = {
  tokenId: bigint
  subregistry: Address
}

export const getRegistryHistory = ResultFn(async function* (
  params: GetRegistryHistoryParameters,
) {
  const client = yield* safeGetClient()

  const currentBlock = yield* await fromPromise(
    getBlockNumber(client),
    (e) => new GetRegistryHistoryError({ cause: e as GetLogsErrorType }),
  )

  const fromBlock: bigint = currentBlock > 100000n ? currentBlock - 100000n : 0n

  const history = yield* await fromPromise(
    getSubregistryHistory(client, {
      registryAddress: params.registryAddress,
      label: params.label,
      fromBlock,
      toBlock: currentBlock,
    }),
    (e) => new GetRegistryHistoryError({ cause: e as GetLogsErrorType }),
  )

  return ok(history as SubregistryHistoryEntry[])
})

export const getRegistryHistoryQueryKey = createQueryKey<
  'registryHistory',
  GetRegistryHistoryParameters
>('registryHistory')

export const getRegistryHistoryQueryOptions = (
  params: GetRegistryHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryHistory(params),
  })

interface RegistryHistoryProps {
  registryAddress: string
  label: string
}

export const RegistryHistory = ({
  registryAddress,
  label,
}: RegistryHistoryProps) => {
  const {
    data: historyResult,
    isLoading,
    error,
  } = useQuery(
    getRegistryHistoryQueryOptions({
      registryAddress: registryAddress as `0x${string}`,
      label,
    }),
  )

  if (isLoading) return <LoadingSpinner title="Loading history..." />

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error loading history: {error.cause?.message}
      </div>
    )
  }

  const history: SubregistryHistoryEntry[] = historyResult ?? []

  if (history.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1 p-6 border border-secondary rounded-lg w-full">
      <div>
        <h2 className="text-[26px] font-medium">Subregistry History</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Token ID</TableHead>
            <TableHead>Subregistry Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((entry: SubregistryHistoryEntry) => (
            <TableRow key={`${entry.tokenId}-${entry.subregistry}`}>
              <TableCell className="font-mono text-sm">
                {entry.tokenId.toString()}
              </TableCell>
              <TableCell>
                <CopyableRecord
                  value={entry.subregistry}
                  href={`https://sepolia.etherscan.io/address/${entry.subregistry}`}
                  className="text-xs"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
