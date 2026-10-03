/**
 * Fold the fork's logs into the subgraph's entity model.
 *
 * Incremental, from a cursor, because the suite seeds names continuously and a
 * query must never answer from a stale world — an indexer parked behind the
 * chain returns real-looking rows for names that have since changed, which is
 * the failure mode the e2e harness has a dedicated guard for.
 *
 * The scan range is small by construction: an Anvil fork starts at a recent
 * block, so "all of local history" is the few hundred blocks this session has
 * produced. Nothing pre-fork is visible, and nothing pre-fork is ours.
 */

import {
  type Address,
  createPublicClient,
  decodeEventLog,
  http,
  keccak256,
  labelhash,
  namehash,
  toHex,
} from 'viem'
import {
  CONTROLLER_EVENTS,
  REGISTRAR_EVENTS,
  REGISTRY_EVENTS,
  RESOLVER_EVENTS,
  WRAPPER_EVENTS,
} from './abis.ts'
import { type Store, ZERO_ADDRESS } from './store.ts'

export type Contracts = {
  registry: Address
  registrar: Address
  controller: Address
  nameWrapper: Address
}

const ETH_NODE = namehash('eth')

/** `0x03sub0670arent03eth00` → `sub.parent.eth`. */
const decodeDnsName = (encoded: string): string | null => {
  const bytes = Buffer.from(encoded.replace(/^0x/, ''), 'hex')
  const labels: string[] = []
  let offset = 0
  while (offset < bytes.length) {
    const length = bytes[offset] as number
    if (length === 0) break
    offset += 1
    if (offset + length > bytes.length) return null
    labels.push(bytes.subarray(offset, offset + length).toString('utf8'))
    offset += length
  }
  return labels.length > 0 ? labels.join('.') : null
}

const subnode = (parent: string, label: string): string =>
  keccak256(`0x${parent.slice(2)}${label.slice(2)}` as `0x${string}`)

const tokenIdToLabelhash = (id: bigint): string =>
  toHex(id, { size: 32 }).toLowerCase()

export class Indexer {
  private cursor: bigint | null = null
  private readonly client: ReturnType<typeof createPublicClient>
  private readonly contracts: Contracts
  private readonly store: Store

  // Plain fields, not constructor parameter properties: Node runs this file by
  // stripping types, and a parameter property needs code generated rather than
  // erased, so it fails at startup.
  constructor(rpcUrl: string, contracts: Contracts, store: Store) {
    this.client = createPublicClient({ transport: http(rpcUrl) })
    this.contracts = contracts
    this.store = store
    this.seedRoot()
  }

  /**
   * The root and `.eth`, which no local log can supply.
   *
   * `eth` was registered on Sepolia long before the fork point, so its
   * `NewOwner` is not in local history and its label can never be learned from
   * the blocks this indexer reads. Without it every name resolves to null,
   * because a name is only known once every ancestor label is — which is the
   * correct rule, applied to a chain that is missing its first link. These two
   * are protocol constants, not fork state, so seeding them asserts nothing
   * about the world under test.
   */
  private seedRoot(): void {
    const root = this.store.domain(namehash(''))
    root.name = ''
    root.labelName = null
    const eth = this.store.domain(ETH_NODE)
    eth.parentId = namehash('')
    eth.labelhash = labelhash('eth')
    this.store.domain(namehash('')).subdomainIds.add(ETH_NODE.toLowerCase())
    this.store.learnLabel(labelhash('eth'), 'eth')
  }

  /** The block the shim has folded in — exposed so callers can report staleness. */
  get indexedHead(): number {
    return Number(this.cursor ?? 0n)
  }

  /**
   * Bring the store up to the chain head.
   *
   * Cheap enough to call on every request: after the first pass it only ever
   * reads the blocks added since, and a fork produces those a handful at a
   * time. That is what keeps "the shim is behind" from becoming a class of bug
   * anyone has to debug.
   */
  async sync(): Promise<void> {
    const head = await this.client.getBlockNumber()
    if (this.cursor === null) {
      this.cursor = await this.forkBlock()
      await this.scan(this.cursor + 1n, head)
    } else if (head > this.cursor) {
      await this.scan(this.cursor + 1n, head)
    }
    this.cursor = head
    this.store.renameAll()
  }

  /**
   * The block the fork diverged at — the start of local history.
   *
   * Scanning from 0 instead makes Anvil proxy every pre-fork block to the
   * upstream archive node, which simply times out: measured, the first sync
   * never returned. It would also be pointless. A forked chain keeps Sepolia's
   * numbering, so blocks at or below this height are Sepolia's own and the real
   * subgraph already knows them; everything this shim exists to serve was
   * produced after it.
   */
  private async forkBlock(): Promise<bigint> {
    try {
      const info = (await this.client.request({
        method: 'anvil_nodeInfo' as never,
        params: [] as never,
      })) as { forkConfig?: { forkBlockNumber?: number | string | null } }
      const at = info?.forkConfig?.forkBlockNumber
      if (at !== null && at !== undefined) return BigInt(at)
    } catch {
      // Not Anvil, or the method is gone: fall through to a full scan, which is
      // correct on a non-forked chain and merely slow on a short one.
    }
    return 0n
  }

  private async scan(from: bigint, to: bigint): Promise<void> {
    const logs = await this.client.getLogs({ fromBlock: from, toBlock: to })
    const ordered = [...logs].sort(
      (a, b) =>
        Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) ||
        (a.logIndex ?? 0) - (b.logIndex ?? 0),
    )
    for (const log of ordered) this.apply(log)
  }

  private apply(log: {
    address: string
    topics: readonly string[]
    data: string
    blockNumber: bigint | null
    transactionHash: string | null
    logIndex: number | null
  }): void {
    const address = log.address.toLowerCase()
    const at = {
      blockNumber: Number(log.blockNumber ?? 0n),
      transactionID: log.transactionHash ?? '0x',
      logIndex: log.logIndex ?? 0,
    }
    const known = {
      [this.contracts.registry.toLowerCase()]: REGISTRY_EVENTS,
      [this.contracts.registrar.toLowerCase()]: REGISTRAR_EVENTS,
      [this.contracts.controller.toLowerCase()]: CONTROLLER_EVENTS,
      [this.contracts.nameWrapper.toLowerCase()]: WRAPPER_EVENTS,
    }

    const abi = known[address] ?? RESOLVER_EVENTS
    let decoded: { eventName: string; args: Record<string, unknown> }
    try {
      decoded = decodeEventLog({
        abi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      }) as { eventName: string; args: Record<string, unknown> }
    } catch {
      // Not an event this shim models. The fork carries every contract on
      // Sepolia, so this is the common case and must stay silent.
      return
    }

    if (address === this.contracts.registry.toLowerCase()) {
      this.applyRegistry(decoded, at)
    } else if (address === this.contracts.registrar.toLowerCase()) {
      this.applyRegistrar(decoded, at)
    } else if (address === this.contracts.controller.toLowerCase()) {
      this.applyController(decoded, at)
    } else if (address === this.contracts.nameWrapper.toLowerCase()) {
      this.applyWrapper(decoded, at)
    } else {
      this.applyResolver(address as Address, decoded, at)
    }
  }

  private applyRegistry(
    { eventName, args }: { eventName: string; args: Record<string, unknown> },
    at: { blockNumber: number; transactionID: string; logIndex: number },
  ): void {
    const store = this.store
    if (eventName === 'NewOwner') {
      const parent = String(args.node).toLowerCase()
      const label = String(args.label).toLowerCase()
      const node = subnode(parent, label).toLowerCase()
      const domain = store.domain(node)
      domain.parentId = parent
      domain.labelhash = label
      domain.owner = { id: String(args.owner).toLowerCase() }
      if (domain.createdAt === '0') domain.createdAt = String(at.blockNumber)
      store.domain(parent).subdomainIds.add(node)
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'NewOwner',
        scope: 'domain',
        node,
        ...at,
        data: {
          owner: { id: String(args.owner).toLowerCase() },
          parentDomain: { id: parent },
        },
      })
      return
    }
    if (eventName === 'Transfer') {
      const node = String(args.node).toLowerCase()
      store.domain(node).owner = { id: String(args.owner).toLowerCase() }
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'Transfer',
        scope: 'domain',
        node,
        ...at,
        data: { owner: { id: String(args.owner).toLowerCase() } },
      })
      return
    }
    if (eventName === 'NewResolver') {
      const node = String(args.node).toLowerCase()
      const resolverAddress = String(args.resolver).toLowerCase() as Address
      const domain = store.domain(node)
      domain.resolverId =
        resolverAddress === ZERO_ADDRESS
          ? null
          : store.resolver(resolverAddress, node).id
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'NewResolver',
        scope: 'domain',
        node,
        ...at,
        data: { resolver: { id: `${resolverAddress}-${node}` } },
      })
      return
    }
    if (eventName === 'NewTTL') {
      const node = String(args.node).toLowerCase()
      store.domain(node).ttl = String(args.ttl)
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'NewTTL',
        scope: 'domain',
        node,
        ...at,
        data: { ttl: String(args.ttl) },
      })
    }
  }

  private applyRegistrar(
    { eventName, args }: { eventName: string; args: Record<string, unknown> },
    at: { blockNumber: number; transactionID: string; logIndex: number },
  ): void {
    const store = this.store
    if (eventName === 'NameRegistered' || eventName === 'NameRenewed') {
      const label = tokenIdToLabelhash(BigInt(String(args.id)))
      const node = subnode(ETH_NODE, label).toLowerCase()
      store.registrationNodeByLabelhash.set(label, node)
      const existing = store.registrations.get(node)
      const registration = existing ?? {
        id: label,
        labelName: store.labels.get(label) ?? null,
        registrationDate: String(at.blockNumber),
        expiryDate: String(args.expires),
        cost: null,
        registrant: { id: String(args.owner ?? ZERO_ADDRESS).toLowerCase() },
      }
      registration.expiryDate = String(args.expires)
      if (eventName === 'NameRegistered' && args.owner) {
        registration.registrant = { id: String(args.owner).toLowerCase() }
        store.domain(node).registrantId = String(args.owner).toLowerCase()
      }
      store.registrations.set(node, registration)
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: eventName,
        scope: 'registration',
        node,
        ...at,
        data:
          eventName === 'NameRegistered'
            ? {
                registrant: { id: String(args.owner).toLowerCase() },
                expiryDate: String(args.expires),
              }
            : { expiryDate: String(args.expires) },
      })
      return
    }
    if (eventName === 'Transfer') {
      const label = tokenIdToLabelhash(BigInt(String(args.tokenId)))
      const node = store.registrationNodeByLabelhash.get(label)
      if (!node) return
      const to = String(args.to).toLowerCase()
      store.domain(node).registrantId = to
      const registration = store.registrations.get(node)
      if (registration) registration.registrant = { id: to }
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'NameTransferred',
        scope: 'registration',
        node,
        ...at,
        data: { newOwner: { id: to } },
      })
    }
  }

  private applyController(
    { eventName, args }: { eventName: string; args: Record<string, unknown> },
    at: { blockNumber: number; transactionID: string; logIndex: number },
  ): void {
    // The one place a 2LD's plaintext label is on chain.
    const label = String(args.name)
    this.store.learnLabel(labelhash(label), label)
    const node = subnode(ETH_NODE, labelhash(label)).toLowerCase()
    const registration = this.store.registrations.get(node)
    if (registration) {
      registration.labelName = label
      if (eventName === 'NameRegistered') {
        registration.cost = String(
          BigInt(String(args.baseCost ?? 0)) +
            BigInt(String(args.premium ?? 0)),
        )
      } else if (args.cost !== undefined) {
        registration.cost = String(args.cost)
      }
    }
    void at
  }

  private applyWrapper(
    { eventName, args }: { eventName: string; args: Record<string, unknown> },
    at: { blockNumber: number; transactionID: string; logIndex: number },
  ): void {
    const store = this.store
    if (eventName === 'NameWrapped') {
      const node = String(args.node).toLowerCase()
      const full = decodeDnsName(String(args.name))
      if (full) {
        // Every label in the DNS-encoded name, which is how a wrapped subname
        // at any depth becomes nameable without a rainbow table.
        for (const part of full.split('.')) {
          if (part) store.learnLabel(labelhash(part), part)
        }
      }
      store.wrapped.set(node, {
        id: node,
        expiryDate: String(args.expiry),
        fuses: Number(args.fuses),
        owner: { id: String(args.owner).toLowerCase() },
        name: full,
      })
      store.domain(node).wrappedOwnerId = String(args.owner).toLowerCase()
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'NameWrapped',
        scope: 'domain',
        node,
        ...at,
        data: {
          name: full,
          fuses: Number(args.fuses),
          owner: { id: String(args.owner).toLowerCase() },
          expiryDate: String(args.expiry),
        },
      })
      return
    }
    if (eventName === 'NameUnwrapped') {
      const node = String(args.node).toLowerCase()
      store.wrapped.delete(node)
      store.domain(node).wrappedOwnerId = null
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'NameUnwrapped',
        scope: 'domain',
        node,
        ...at,
        data: { owner: { id: String(args.owner).toLowerCase() } },
      })
      return
    }
    if (eventName === 'FusesSet') {
      const node = String(args.node).toLowerCase()
      const wrapped = store.wrapped.get(node)
      if (wrapped) wrapped.fuses = Number(args.fuses)
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'FusesSet',
        scope: 'domain',
        node,
        ...at,
        data: { fuses: Number(args.fuses) },
      })
      return
    }
    if (eventName === 'ExpiryExtended') {
      const node = String(args.node).toLowerCase()
      const wrapped = store.wrapped.get(node)
      if (wrapped) wrapped.expiryDate = String(args.expiry)
      store.addEvent({
        id: `${at.transactionID}-${at.logIndex}`,
        kind: 'ExpiryExtended',
        scope: 'domain',
        node,
        ...at,
        data: { expiryDate: String(args.expiry) },
      })
      return
    }
    if (eventName === 'TransferSingle' || eventName === 'TransferBatch') {
      const ids =
        eventName === 'TransferSingle'
          ? [BigInt(String(args.id))]
          : (args.ids as bigint[]).map((v) => BigInt(String(v)))
      const to = String(args.to).toLowerCase()
      for (const id of ids) {
        const node = toHex(id, { size: 32 }).toLowerCase()
        const wrapped = store.wrapped.get(node)
        if (wrapped) wrapped.owner = { id: to }
        store.domain(node).wrappedOwnerId = to === ZERO_ADDRESS ? null : to
        store.addEvent({
          id: `${at.transactionID}-${at.logIndex}`,
          kind: 'WrappedTransfer',
          scope: 'domain',
          node,
          ...at,
          data: { owner: { id: to } },
        })
      }
    }
  }

  private applyResolver(
    address: Address,
    { eventName, args }: { eventName: string; args: Record<string, unknown> },
    at: { blockNumber: number; transactionID: string; logIndex: number },
  ): void {
    const node = String(args.node ?? '').toLowerCase()
    if (!node || !node.startsWith('0x')) return
    const store = this.store
    const resolver = store.resolver(address, node)
    const base = {
      id: `${at.transactionID}-${at.logIndex}`,
      scope: 'resolver' as const,
      node,
      resolverId: resolver.id,
      ...at,
    }

    switch (eventName) {
      case 'TextChanged': {
        const key = String(args.key)
        const value = args.value === undefined ? null : String(args.value)
        // The subgraph keeps the key once set and drops it when cleared, which
        // is exactly the list the app uses to decide what to read on chain.
        if (value === null || value === '') {
          resolver.texts = resolver.texts.filter((k) => k !== key)
        } else if (!resolver.texts.includes(key)) {
          resolver.texts.push(key)
        }
        store.addEvent({ ...base, kind: 'TextChanged', data: { key, value } })
        return
      }
      case 'AddressChanged': {
        const coinType = String(args.coinType)
        const value = String(args.newAddress ?? '0x')
        const empty = value === '0x' || /^0x0*$/.test(value)
        if (empty) {
          resolver.coinTypes = resolver.coinTypes.filter((c) => c !== coinType)
        } else if (!resolver.coinTypes.includes(coinType)) {
          resolver.coinTypes.push(coinType)
        }
        store.addEvent({
          ...base,
          kind: 'MulticoinAddrChanged',
          data: { coinType, addr: value },
        })
        return
      }
      case 'AddrChanged': {
        const addr = String(args.a).toLowerCase()
        resolver.addr = addr === ZERO_ADDRESS ? null : (addr as Address)
        if (!resolver.coinTypes.includes('60')) resolver.coinTypes.push('60')
        store.domain(node).resolvedAddress = addr === ZERO_ADDRESS ? null : addr
        store.addEvent({
          ...base,
          kind: 'AddrChanged',
          data: { addr: { id: addr } },
        })
        return
      }
      case 'NameChanged': {
        store.addEvent({
          ...base,
          kind: 'NameChanged',
          data: { name: String(args.name) },
        })
        return
      }
      case 'ContenthashChanged': {
        resolver.contentHash = String(args.hash)
        store.addEvent({
          ...base,
          kind: 'ContenthashChanged',
          data: { hash: String(args.hash) },
        })
        return
      }
      case 'ABIChanged': {
        const contentType = String(args.contentType)
        if (!resolver.abis.includes(contentType))
          resolver.abis.push(contentType)
        store.addEvent({
          ...base,
          kind: 'AbiChanged',
          data: { contentType },
        })
      }
    }
  }
}
