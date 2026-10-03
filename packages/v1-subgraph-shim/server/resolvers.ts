/**
 * Resolvers over the in-memory store.
 *
 * The `where` dialect is implemented generically — `field_op` split on the last
 * underscore — rather than as a switch over the filters we happen to have seen.
 * A filter this shim does not understand must not be silently ignored: dropping
 * `parent_not` from a migration query would widen the result set and the app
 * would confidently render names it should never have been offered. Unknown
 * operators therefore throw.
 */

import { GraphQLError } from 'graphql'
import type { DomainEntity, Store, StoredEvent } from './store.ts'

type Ctx = { store: Store; indexedHead: () => number }

const ZERO = '0x0000000000000000000000000000000000000000'

const domainField = (
  domain: DomainEntity,
  store: Store,
  field: string,
): unknown => {
  switch (field) {
    case 'id':
      return domain.id
    case 'name':
      return domain.name
    case 'labelName':
      return domain.labelName
    case 'parent':
      return domain.parentId
    case 'owner':
      return domain.owner.id
    case 'registrant':
      return domain.registrantId
    case 'resolver':
      return domain.resolverId
    case 'resolvedAddress':
      return domain.resolvedAddress
    case 'createdAt':
      return domain.createdAt
    case 'expiryDate': {
      const wrapped = store.wrapped.get(domain.id)
      const registration = store.registrations.get(domain.id)
      return wrapped?.expiryDate ?? registration?.expiryDate ?? null
    }
    default:
      throw new GraphQLError(
        `[v1-subgraph-shim] filter on unknown field "${field}". Add it rather than ignoring it: a dropped filter widens the result set and the app renders names it was never offered.`,
      )
  }
}

const compare = (actual: unknown, op: string, expected: unknown): boolean => {
  const asString = (v: unknown) =>
    v === null || v === undefined ? null : String(v).toLowerCase()
  const asBig = (v: unknown) =>
    v === null || v === undefined ? null : BigInt(String(v))

  switch (op) {
    case '':
      return expected === null
        ? actual === null || actual === undefined
        : asString(actual) === asString(expected)
    case 'not':
      return expected === null
        ? actual !== null && actual !== undefined
        : asString(actual) !== asString(expected)
    case 'in':
      return (expected as unknown[]).some(
        (e) => asString(e) === asString(actual),
      )
    case 'not_in':
      return !(expected as unknown[]).some(
        (e) => asString(e) === asString(actual),
      )
    case 'gt': {
      const a = asBig(actual)
      return a !== null && a > (asBig(expected) as bigint)
    }
    case 'lt': {
      const a = asBig(actual)
      return a !== null && a < (asBig(expected) as bigint)
    }
    case 'gte': {
      const a = asBig(actual)
      return a !== null && a >= (asBig(expected) as bigint)
    }
    case 'lte': {
      const a = asBig(actual)
      return a !== null && a <= (asBig(expected) as bigint)
    }
    case 'contains':
    case 'contains_nocase':
      return (asString(actual) ?? '').includes(asString(expected) ?? '')
    default:
      throw new GraphQLError(
        `[v1-subgraph-shim] unsupported filter operator "${op}". Implement it rather than ignoring it.`,
      )
  }
}

const OPS = new Set([
  'not',
  'in',
  'not_in',
  'gt',
  'lt',
  'gte',
  'lte',
  'contains',
  'contains_nocase',
])

const splitField = (key: string): [string, string] => {
  for (const op of OPS) {
    if (key.endsWith(`_${op}`)) return [key.slice(0, -(op.length + 1)), op]
  }
  return [key, '']
}

const matches = (
  domain: DomainEntity,
  where: Record<string, unknown> | null | undefined,
  store: Store,
): boolean => {
  if (!where) return true
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue
    if (key === 'and') {
      const all = (expected as Record<string, unknown>[]) ?? []
      if (!all.every((w) => matches(domain, w, store))) return false
      continue
    }
    if (key === 'or') {
      const any = (expected as Record<string, unknown>[]) ?? []
      if (any.length > 0 && !any.some((w) => matches(domain, w, store)))
        return false
      continue
    }
    const [field, op] = splitField(key)
    if (!compare(domainField(domain, store, field), op, expected)) return false
  }
  return true
}

const sortAndSlice = <T>(
  items: T[],
  key: (item: T) => string | number | null,
  args: { first?: number; skip?: number; orderDirection?: string },
): T[] => {
  const sorted = [...items].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (x === null) return 1
    if (y === null) return -1
    if (typeof x === 'number' && typeof y === 'number') return x - y
    return String(x).localeCompare(String(y))
  })
  if (args.orderDirection === 'desc') sorted.reverse()
  const skip = args.skip ?? 0
  const first = args.first ?? 100
  return sorted.slice(skip, skip + first)
}

const eventTypeName = (event: StoredEvent): string => event.kind

const shapeEvent = (event: StoredEvent, extra: Record<string, unknown>) => ({
  __typename: eventTypeName(event),
  id: event.id,
  blockNumber: event.blockNumber,
  transactionID: event.transactionID,
  ...event.data,
  ...extra,
})

const eventArgs = (args: {
  first?: number
  skip?: number
  orderDirection?: string
}) => args

export const makeResolvers = (ctx: Ctx) => {
  const { store } = ctx

  const domainRef = (id: string | null) =>
    id ? (store.domains.get(id.toLowerCase()) ?? { id }) : null

  const domainEvents = (
    domain: DomainEntity,
    args: { first?: number; skip?: number; orderDirection?: string },
  ) =>
    sortAndSlice(
      store.eventsFor(domain.id, 'domain'),
      (e) => e.blockNumber,
      eventArgs(args),
    ).map((e) => shapeEvent(e, { domain }))

  return {
    BigInt: undefined,

    Query: {
      domain: (_: unknown, { id }: { id: string }) =>
        store.domains.get(id.toLowerCase()) ?? null,

      domains: (
        _: unknown,
        args: {
          first?: number
          skip?: number
          orderBy?: string
          orderDirection?: string
          where?: Record<string, unknown>
        },
      ) => {
        const all = [...store.domains.values()].filter((d) =>
          matches(d, args.where, store),
        )
        return sortAndSlice(
          all,
          (d) => {
            const by = args.orderBy ?? 'id'
            const value = domainField(d, store, by)
            return value === null || value === undefined
              ? null
              : (String(value) as string)
          },
          args,
        )
      },

      resolver: (_: unknown, { id }: { id: string }) =>
        store.resolvers.get(id.toLowerCase()) ?? null,

      resolvers: (
        _: unknown,
        args: {
          first?: number
          skip?: number
          orderDirection?: string
          where?: { domain?: string; domain_in?: string[]; id_in?: string[] }
        },
      ) => {
        const where = args.where ?? {}
        const all = [...store.resolvers.values()].filter((r) => {
          if (where.domain && r.node !== where.domain.toLowerCase())
            return false
          if (
            where.domain_in &&
            !where.domain_in.some((d) => d.toLowerCase() === r.node)
          )
            return false
          if (where.id_in && !where.id_in.some((i) => i.toLowerCase() === r.id))
            return false
          return true
        })
        return sortAndSlice(all, (r) => r.id, args)
      },

      registration: (_: unknown, { id }: { id: string }) =>
        store.registrations.get(id.toLowerCase()) ?? null,

      registrations: (
        _: unknown,
        args: { first?: number; skip?: number; orderDirection?: string },
      ) => sortAndSlice([...store.registrations.values()], (r) => r.id, args),

      wrappedDomain: (_: unknown, { id }: { id: string }) =>
        store.wrapped.get(id.toLowerCase()) ?? null,

      _meta: () => ({
        block: { number: ctx.indexedHead(), hash: null },
        deployment: 'v1-subgraph-shim',
        hasIndexingErrors: false,
      }),
    },

    Domain: {
      labelhash: (d: DomainEntity) => d.labelhash,
      parent: (d: DomainEntity) => domainRef(d.parentId),
      subdomains: (
        d: DomainEntity,
        args: {
          first?: number
          skip?: number
          orderDirection?: string
          where?: Record<string, unknown>
        },
      ) => {
        const children = [...d.subdomainIds]
          .map((id) => store.domains.get(id))
          .filter((c): c is DomainEntity => !!c)
          // A node whose registry owner has gone to zero is deleted upstream,
          // not listed with a zero owner.
          .filter((c) => c.owner.id !== ZERO)
          .filter((c) => matches(c, args.where, store))
        return sortAndSlice(children, (c) => c.name ?? c.id, args)
      },
      subdomainCount: (d: DomainEntity) =>
        [...d.subdomainIds]
          .map((id) => store.domains.get(id))
          .filter((c) => c && c.owner.id !== ZERO).length,
      resolver: (d: DomainEntity) =>
        d.resolverId ? (store.resolvers.get(d.resolverId) ?? null) : null,
      resolvedAddress: (d: DomainEntity) =>
        d.resolvedAddress ? { id: d.resolvedAddress } : null,
      owner: (d: DomainEntity) => d.owner,
      registrant: (d: DomainEntity) =>
        d.registrantId ? { id: d.registrantId } : null,
      wrappedOwner: (d: DomainEntity) =>
        d.wrappedOwnerId ? { id: d.wrappedOwnerId } : null,
      registration: (d: DomainEntity) => store.registrations.get(d.id) ?? null,
      wrappedDomain: (d: DomainEntity) => store.wrapped.get(d.id) ?? null,
      expiryDate: (d: DomainEntity) => domainField(d, store, 'expiryDate'),
      events: domainEvents,
    },

    Registration: {
      domain: (r: { id: string }) => {
        for (const [node, reg] of store.registrations)
          if (reg === (r as never)) return store.domains.get(node) ?? null
        return null
      },
      events: (
        r: { id: string },
        args: { first?: number; skip?: number; orderDirection?: string },
      ) => {
        let node: string | null = null
        for (const [key, reg] of store.registrations)
          if (reg.id === r.id) node = key
        if (!node) return []
        return sortAndSlice(
          store.eventsFor(node, 'registration'),
          (e) => e.blockNumber,
          eventArgs(args),
        ).map((e) => shapeEvent(e, { registration: r }))
      },
    },

    WrappedDomain: {
      domain: (w: { id: string }) => store.domains.get(w.id) ?? null,
    },

    Resolver: {
      domain: (r: { node: string }) => store.domains.get(r.node) ?? null,
      addr: (r: { addr: string | null }) => (r.addr ? { id: r.addr } : null),
      coinTypes: (r: { coinTypes: string[] }) =>
        r.coinTypes.length > 0 ? r.coinTypes : null,
      texts: (r: { texts: string[] }) => (r.texts.length > 0 ? r.texts : null),
      events: (
        r: { id: string },
        args: { first?: number; skip?: number; orderDirection?: string },
      ) =>
        sortAndSlice(
          store.eventsForResolver(r.id),
          (e) => e.blockNumber,
          eventArgs(args),
        ).map((e) => shapeEvent(e, { resolver: r })),
      ...Object.fromEntries(
        (
          [
            ['addrChangeds', 'AddrChanged'],
            ['multicoinAddrChangeds', 'MulticoinAddrChanged'],
            ['nameChangeds', 'NameChanged'],
            ['textChangeds', 'TextChanged'],
            ['abiChangeds', 'AbiChanged'],
            ['contenthashChangeds', 'ContenthashChanged'],
          ] as const
        ).map(([field, kind]) => [
          field,
          (
            r: { id: string },
            args: { first?: number; skip?: number; orderDirection?: string },
          ) =>
            sortAndSlice(
              store.eventsForResolver(r.id).filter((e) => e.kind === kind),
              (e) => e.blockNumber,
              eventArgs(args),
            ).map((e) => shapeEvent(e, { resolver: r })),
        ]),
      ),
    },

    DomainEvent: { __resolveType: (e: { __typename: string }) => e.__typename },
    RegistrationEvent: {
      __resolveType: (e: { __typename: string }) => e.__typename,
    },
    ResolverEvent: {
      __resolveType: (e: { __typename: string }) => e.__typename,
    },
  }
}
