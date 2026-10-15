import type { V1Domain } from '@ens-apps/migration'
import type { Address } from 'viem'

export const OWNER: Address = '0x0000000000000000000000000000000000000001'
export const OTHER: Address = '0x0000000000000000000000000000000000000002'
export const DEFAULT_RESOLVER: Address =
  '0x000000000000000000000000000000000000dddd'

export const ok = <T>(result: T) => ({ status: 'success' as const, result })
export const fail = () => ({
  status: 'failure' as const,
  error: new Error('reverted'),
  result: undefined,
})

export type DomainOverrides = {
  id?: string
  name?: string
  labelName?: string | null
  labelhash?: string
  parentName?: string | null
  parentFuses?: bigint | null
  registrantId?: string | null
  wrappedOwnerId?: string | null
  ownerId?: string
  fuses?: bigint
  resolverAddress?: string | null
  registrationExpiry?: string | null
  wrappedExpiry?: string | null
  isWrapped?: boolean
}

const parentFor = (o: DomainOverrides): V1Domain['parent'] =>
  o.parentName === null
    ? null
    : {
        name: o.parentName ?? 'eth',
        wrappedDomain:
          o.parentFuses == null ? null : { fuses: Number(o.parentFuses) },
      }

const wrappedOwnerFor = (
  o: DomainOverrides,
  isWrapped: boolean,
): V1Domain['wrappedOwner'] => {
  if (o.wrappedOwnerId === null || !isWrapped) return null
  return { id: o.wrappedOwnerId ?? OWNER }
}

export const makeDomain = (o: DomainOverrides = {}): V1Domain => {
  const isWrapped = o.isWrapped ?? false
  return {
    id: o.id ?? '0xabc',
    labelName: o.labelName === undefined ? 'alice' : o.labelName,
    labelhash:
      o.labelhash ??
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    name: o.name ?? 'alice.eth',
    resolver:
      o.resolverAddress === null
        ? null
        : { address: o.resolverAddress ?? DEFAULT_RESOLVER },
    owner: { id: o.ownerId ?? OWNER },
    registrant:
      o.registrantId === null ? null : { id: o.registrantId ?? OWNER },
    wrappedOwner: wrappedOwnerFor(o, isWrapped),
    parent: parentFor(o),
    registration: o.registrationExpiry
      ? { expiryDate: o.registrationExpiry }
      : null,
    wrappedDomain: isWrapped
      ? {
          expiryDate: o.wrappedExpiry ?? '99999999999',
          fuses: Number(o.fuses ?? 0n),
        }
      : null,
  }
}

/**
 * The classified-name factory lives with the classifier it builds for, so a new
 * `ClassifiedName` field cannot compile in one package and fail in the other.
 * Mirrors `service/classifyNames.ts`, which is likewise a re-export barrel.
 */
export {
  type ClassifiedOverrides,
  makeClassified,
} from '@ens-apps/migration/test-fixtures'

export const jsonResponse = <T>(body: T, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response

type QueryMock = { mockReturnValueOnce: (v: never) => unknown }

export const mockIndexerQuery = (
  queryMock: QueryMock,
  response: { data?: unknown; error?: unknown },
): void => {
  queryMock.mockReturnValueOnce({
    toPromise: () => Promise.resolve(response),
  } as never)
}
