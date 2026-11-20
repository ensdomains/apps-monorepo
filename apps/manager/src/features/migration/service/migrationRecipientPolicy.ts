import { type Address, getAddress, type Hash, type Hex } from 'viem'
import type { ClassifiedName } from './classifyNames'

// Exact non-proxy Cypher7702SwapExecutor runtime: no ERC1155 receiver or fallback.
// https://sourcify.dev/server/v2/contract/1/0xd5a7b2cecd76a34328e483a2258b615109b71dea?fields=compilation,sources,runtimeBytecode
const INCOMPATIBLE_DELEGATE_RUNTIME_HASHES: ReadonlySet<Hash> = new Set([
  '0xc674c708ae140044638fdde55cb6f788595177ccc35c17083d1d7cc02640c241',
])

export const getMigrationRecipientDelegate = (
  code: Hex | undefined,
): Address | null => {
  const target = code?.match(/^0xef0100([0-9a-f]{40})$/i)?.[1]
  return target ? getAddress(`0x${target}`) : null
}

/** Unknown implementations require the real migration simulation, never a dummy receipt. */
export const isKnownIncompatibleMigrationDelegate = (
  runtimeHash: Hash | null,
): boolean =>
  runtimeHash === null || INCOMPATIBLE_DELEGATE_RUNTIME_HASHES.has(runtimeHash)

export const getMigrationRecipientAddresses = (
  names: readonly ClassifiedName[],
  owner: Address,
): readonly Address[] => [
  ...new Map(
    names.map((name) => {
      const recipient = name.action === 'copy' ? name.tokenHolder : owner
      return [recipient.toLowerCase(), recipient] as const
    }),
  ).values(),
]
