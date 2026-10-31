import {
  decodeAbiParameters,
  type Hex,
  keccak256,
  labelhash,
  namehash,
  parseAbiParameters,
  stringToHex,
  zeroAddress,
} from 'viem'

type Event = {
  address: Hex
  transactionHash: Hex
  blockNumber: string
  logIndex: number
  topics: Hex[]
  data: Hex
}
type Row = {
  type: string
  transaction_hash: Hex | null
  block_number: number
  log_index: number
  contract_address?: Hex | null
  data?: Record<string, unknown>
}
const sig = (s: string) => keccak256(stringToHex(s))
const address = (word: Hex) => `0x${word.slice(-40)}`.toLowerCase()
const textEvent = sig('TextUpdated(uint256,string,string,string)')
const roleEvent = sig('EACRolesChanged(uint256,address,uint256,uint256)')
const transferEvent = sig(
  'TransferSingle(address,address,address,uint256,uint256)',
)
const tokenEvents = new Set(
  [
    'LabelRegistered(uint256,bytes32,string,address,uint64,address)',
    'LabelUnregistered(uint256,address)',
    'ExpiryUpdated(uint256,uint64,address)',
    'SubregistryUpdated(uint256,address,address)',
    'ResolverUpdated(uint256,address,address)',
    'TokenRegenerated(uint256,uint256)',
    'EACRolesChanged(uint256,address,uint256,uint256)',
  ].map(sig),
)
const recordEvents = new Set(
  [
    'AddressUpdated(uint256,uint256,bytes)',
    'ContenthashUpdated(uint256,bytes)',
    'ABIUpdated(uint256,uint256)',
    'InterfaceUpdated(uint256,bytes4,address)',
    'TextUpdated(uint256,string,string,string)',
    'DataUpdated(uint256,string,string,bytes)',
    'NameUpdated(uint256,string)',
  ].map(sig),
)

/** Exact user actions after the baseline. Root-wide resolver grants and
 * migration label presentation have separate requirements; neither is
 * silently treated as a per-name event here. ABI signatures are pinned by
 * the Sepolia 2026-10-01 protocol manifests, not learned from API results. */
export function postActivityChecks(
  name: string,
  saved: any,
  rows: Row[],
  phase: 'before' | 'after' = 'after',
) {
  const all = saved.afterActivity.events as Event[]
  const inPhase = all.filter((e) =>
    phase === 'after'
      ? BigInt(e.blockNumber) > BigInt(saved.beforeActivity.toBlock)
      : BigInt(e.blockNumber) <= BigInt(saved.beforeActivity.toBlock),
  )
  const node = namehash(name).toLowerCase()
  const resolverRecords = new Set(
    all
      .filter(
        (e) =>
          e.topics[0] === sig('Linked(uint256,bytes32,bytes)') &&
          e.topics[2]?.toLowerCase() === node,
      )
      .map((e) => `${e.address.toLowerCase()}:${BigInt(e.topics[1])}`),
  )
  const state =
    name === saved.subject
      ? saved.afterState
      : name === saved.names?.[0]
        ? saved.afterRoot
        : saved.afterTreeStates?.find((entry: any) => entry.name === name)
            ?.state
  const registry = state?.registry?.toLowerCase()
  const key = BigInt(labelhash(name.split('.')[0])) >> 32n
  const selected: Event[] = []
  for (const e of inPhase) {
    if (
      recordEvents.has(e.topics[0]) &&
      resolverRecords.has(`${e.address.toLowerCase()}:${BigInt(e.topics[1])}`)
    )
      selected.push(e)
    else if (registry && e.address.toLowerCase() === registry) {
      if (tokenEvents.has(e.topics[0]) && BigInt(e.topics[1]) >> 32n === key)
        selected.push(e)
      if (e.topics[0] === transferEvent) {
        const [id] = decodeAbiParameters(
          parseAbiParameters('uint256,uint256'),
          e.data,
        )
        // Mint/burn can be one registration/release activity. Ordinary holder
        // transfers must retain their exact independent transaction/log.
        if (
          id >> 32n === key &&
          address(e.topics[2]) !== zeroAddress &&
          address(e.topics[3]) !== zeroAddress
        )
          selected.push(e)
      }
    }
  }
  const exact = (e: Event) =>
    rows.filter(
      (r) =>
        r.transaction_hash?.toLowerCase() === e.transactionHash.toLowerCase() &&
        String(r.block_number) === e.blockNumber &&
        r.log_index === e.logIndex &&
        r.contract_address?.toLowerCase() === e.address.toLowerCase(),
    )
  const missing = selected.filter((e) => !exact(e).length)
  const wrong: unknown[] = []
  for (const e of selected) {
    const matches = exact(e)
    if (!matches.length) continue
    if (e.topics[0] === textEvent) {
      const [key, value] = decodeAbiParameters(
        parseAbiParameters('string,string'),
        e.data,
      )
      if (
        !matches.some(
          (r) =>
            r.type === 'record' &&
            r.data?.key === `text:${key}` &&
            r.data?.value === value,
        )
      )
        wrong.push({ event: e, expected: { key, value }, actual: matches })
    } else if (e.topics[0] === roleEvent) {
      const [oldRoles, newRoles] = decodeAbiParameters(
        parseAbiParameters('uint256,uint256'),
        e.data,
      )
      const expected = {
        address: address(e.topics[2]),
        old_role_bitmap: oldRoles.toString(),
        new_role_bitmap: newRoles.toString(),
      }
      if (
        !matches.some(
          (r) =>
            r.type === 'permission' &&
            Object.entries(expected).every(
              ([key, value]) => String(r.data?.[key]).toLowerCase() === value,
            ),
        )
      )
        wrong.push({ event: e, expected, actual: matches })
    } else if (e.topics[0] === transferEvent) {
      const expected = {
        operator: address(e.topics[1]),
        from: address(e.topics[2]),
        to: address(e.topics[3]),
      }
      if (
        !matches.some(
          (r) =>
            r.type === 'transfer' &&
            Object.entries(expected).every(
              ([key, value]) => String(r.data?.[key]).toLowerCase() === value,
            ),
        )
      )
        wrong.push({ event: e, expected, actual: matches })
    }
  }
  return {
    expectedEvents: selected,
    missing,
    wrongDetails: wrong,
    registryBindingKnown: Boolean(registry),
    resolverBindings: [...resolverRecords],
    scope: `Actual per-name V2 record writes, registry role changes, resolver/subregistry changes, expiry/registration actions and non-mint holder transfers ${phase === 'before' ? 'at or before' : 'after'} the saved baseline. Every expected event must keep its exact transaction, block, log and contract identity; text values and role/transfer wallets are also compared.`,
  }
}
