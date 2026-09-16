import {
  type Address,
  decodeFunctionData,
  type Hex,
  isAddress,
  parseAbi,
  zeroAddress,
} from 'viem'

const claimAbi = parseAbi(['function claim(bytes32[] proof)'])
const storagePrefix = 'ens:commemorative-nft:pending-claim:v1'

export type PendingNftClaimScope = {
  readonly ownerAddress: Address
  readonly chainId: number
  readonly contractAddress: Address
}

export type PendingNftClaim = PendingNftClaimScope & {
  readonly version: 1
  readonly hash: Hex
  readonly expectedClaimData: Hex
  readonly submittedAt: number
}

export type PendingNftClaimSnapshot =
  | { readonly status: 'empty'; readonly claim?: undefined }
  | { readonly status: 'pending'; readonly claim: PendingNftClaim }
  | { readonly status: 'unavailable'; readonly claim?: PendingNftClaim }

const validAddress = (value: unknown): value is Address =>
  typeof value === 'string' &&
  isAddress(value, { strict: false }) &&
  value.toLowerCase() !== zeroAddress

export const isPendingNftClaimScope = (scope: PendingNftClaimScope): boolean =>
  validAddress(scope.ownerAddress) &&
  validAddress(scope.contractAddress) &&
  Number.isSafeInteger(scope.chainId) &&
  scope.chainId > 0

const keyForScope = (scope: PendingNftClaimScope): string =>
  `${storagePrefix}:${scope.chainId}:${scope.contractAddress.toLowerCase()}:${scope.ownerAddress.toLowerCase()}`

export const isPendingNftClaim = (
  value: unknown,
  scope: PendingNftClaimScope,
): value is PendingNftClaim => {
  if (
    !isPendingNftClaimScope(scope) ||
    typeof value !== 'object' ||
    value === null
  )
    return false
  if (
    !('version' in value) ||
    value.version !== 1 ||
    !('ownerAddress' in value) ||
    !validAddress(value.ownerAddress) ||
    !('contractAddress' in value) ||
    !validAddress(value.contractAddress) ||
    !('chainId' in value) ||
    value.chainId !== scope.chainId ||
    value.ownerAddress.toLowerCase() !== scope.ownerAddress.toLowerCase() ||
    value.contractAddress.toLowerCase() !==
      scope.contractAddress.toLowerCase() ||
    !('hash' in value) ||
    typeof value.hash !== 'string' ||
    !/^0x[0-9a-f]{64}$/i.test(value.hash) ||
    !('expectedClaimData' in value) ||
    typeof value.expectedClaimData !== 'string' ||
    !/^0x(?:[0-9a-f]{2})+$/i.test(value.expectedClaimData) ||
    !('submittedAt' in value) ||
    typeof value.submittedAt !== 'number' ||
    !Number.isSafeInteger(value.submittedAt) ||
    value.submittedAt <= 0
  )
    return false
  try {
    const decoded = decodeFunctionData({
      abi: claimAbi,
      data: value.expectedClaimData as Hex,
    })
    return decoded.functionName === 'claim' && decoded.args[0].length > 0
  } catch {
    return false
  }
}

const listeners = new Set<() => void>()
let revision = 0
// Retain a broadcast hash for this session even if a later storage write fails.
type InMemoryPendingNftClaim = {
  readonly claim: PendingNftClaim
  readonly unsaved: boolean
}
const inMemoryClaims = new WeakMap<
  Storage,
  Map<string, InMemoryPendingNftClaim>
>()
const notify = () => {
  revision += 1
  for (const listener of listeners) listener()
}
export const pendingNftClaimRevision = (): number => revision
export const refreshPendingNftClaims = (): void => notify()
export const subscribePendingNftClaims = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(storagePrefix)) {
      if (event.storageArea) {
        if (event.key === null) inMemoryClaims.delete(event.storageArea)
        else inMemoryClaims.get(event.storageArea)?.delete(event.key)
      }
      notify()
    }
  }
  globalThis.addEventListener?.('storage', onStorage)
  return () => {
    listeners.delete(listener)
    globalThis.removeEventListener?.('storage', onStorage)
  }
}

export const readPendingNftClaim = (
  scope: PendingNftClaimScope,
): PendingNftClaimSnapshot => {
  if (!isPendingNftClaimScope(scope)) return { status: 'unavailable' }
  let memoryClaim: PendingNftClaim | undefined
  try {
    const storage = globalThis.localStorage
    const key = keyForScope(scope)
    const memory = inMemoryClaims.get(storage)?.get(key)
    memoryClaim = memory?.unsaved ? memory.claim : undefined
    const raw = storage.getItem(key)
    if (raw === null)
      return memoryClaim
        ? { status: 'pending', claim: memoryClaim }
        : { status: 'empty' }
    const value: unknown = JSON.parse(raw)
    if (!isPendingNftClaim(value, scope))
      return { status: 'unavailable', claim: memoryClaim }
    return { status: 'pending', claim: memoryClaim ?? value }
  } catch {
    return { status: 'unavailable', claim: memoryClaim }
  }
}

export const assertPendingNftClaimStorageReady = (
  scope: PendingNftClaimScope,
): void => {
  if (readPendingNftClaim(scope).status !== 'empty')
    throw new Error('Pending claim storage is not ready')
  const storage = globalThis.localStorage
  const probeKey = `${keyForScope(scope)}:probe`
  storage.setItem(probeKey, '1')
  storage.removeItem(probeKey)
}

export const savePendingNftClaim = (
  claim: PendingNftClaim,
  options: { readonly previousHash?: Hex } = {},
): void => {
  if (!isPendingNftClaim(claim, claim)) throw new Error('Invalid pending claim')
  const current = readPendingNftClaim(claim).claim
  if (
    options.previousHash &&
    current &&
    current.hash !== claim.hash &&
    current.hash !== options.previousHash
  )
    return
  try {
    const storage = globalThis.localStorage
    const key = keyForScope(claim)
    const records =
      inMemoryClaims.get(storage) ?? new Map<string, InMemoryPendingNftClaim>()
    records.set(key, { claim: { ...claim }, unsaved: true })
    inMemoryClaims.set(storage, records)
    storage.setItem(key, JSON.stringify(claim))
    records.set(key, { claim: { ...claim }, unsaved: false })
  } finally {
    notify()
  }
}

export const clearPendingNftClaim = (claim: PendingNftClaim): void => {
  const current = readPendingNftClaim(claim).claim
  if (!current || current.hash.toLowerCase() !== claim.hash.toLowerCase())
    return
  const storage = globalThis.localStorage
  storage.removeItem(keyForScope(claim))
  inMemoryClaims.get(storage)?.delete(keyForScope(claim))
  notify()
}
