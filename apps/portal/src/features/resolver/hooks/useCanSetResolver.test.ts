// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireResourceIdForName } from '@/lib/resource/resourceId'

const OWNER ='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const REGISTRANT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const STRANGER = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const V2_REGISTRY = '0xdddddddddddddddddddddddddddddddddddddddd' as Address

type QueryStub = { readonly data: unknown; readonly isLoading: boolean }

const idle = (): QueryStub => ({ data: undefined, isLoading: false })
const settled = (data: unknown): QueryStub => ({ data, isLoading: false })
const loading = (): QueryStub => ({ data: undefined, isLoading: true })

let connectedAddress: Address | undefined = OWNER
let ownerQuery: QueryStub = idle()
let registriesQuery: QueryStub = idle()
let roleQuery: QueryStub = idle()
let v1Query: QueryStub = idle()

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ address: connectedAddress }),
}))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: ({
      queryKey,
      enabled,
    }: {
      queryKey: readonly unknown[]
      enabled?: boolean
    }) => {
      const stub = match(queryKey[0])
        .with('get-ens-owner', () => ownerQuery)
        .with('nameRegistries', () => registriesQuery)
        .with('hasRoles', () => roleQuery)
        .with('transfer-v1-name-state', () => v1Query)
        .otherwise(idle)

      return enabled === false ? { ...stub, isLoading: false } : stub
    },
  }
})

const { useCanSetResolver } = await import('./useCanSetResolver')

const render = (name: string) =>
  renderHook(() => useCanSetResolver({ name })).result.current

/** An imported DNS name: a plain legacy-registry node. */
const asV1Registry = (owner: Address) => {
  ownerQuery = settled({ owner, protocolVersion: 'ENSv1' })
  v1Query = settled({ subject: { kind: 'v1-registry', owner } })
}

describe('useCanSetResolver', () => {
  beforeEach(() => {
    connectedAddress = OWNER
    ownerQuery = idle()
    registriesQuery = idle()
    roleQuery = idle()
    v1Query = idle()
  })

  it('lets the registry owner of a V1 name set its resolver', () => {
    // The regression: asking a PermissionedRegistry for ROLE_SET_RESOLVER on a
    // legacy name reverts, and the falsy answer hid the button from its owner.
    asV1Registry(OWNER)

    const result = render('jobintime.xyz')

    expect(result.canSet).toBe(true)
    expect(result.target).toEqual({ protocol: 'ENSv1', isWrapped: false })
  })

  it('never consults V2 roles for a V1 name', () => {
    asV1Registry(OWNER)
    roleQuery = settled(false)

    expect(render('jobintime.xyz').canSet).toBe(true)
  })

  it('refuses a stranger on a V1 name', () => {
    asV1Registry(OWNER)
    connectedAddress = STRANGER

    expect(render('jobintime.xyz').canSet).toBe(false)
  })

  it('refuses the registrant of an unwrapped 2LD, who holds no registry slot', () => {
    // `setResolver` is a registry-slot write, so the controller holds it.
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv1' })
    v1Query = settled({
      subject: {
        kind: 'v1-registrar',
        registrant: REGISTRANT,
        controller: OWNER,
      },
    })
    connectedAddress = REGISTRANT

    expect(render('legacy.eth').canSet).toBe(false)
  })

  it('refuses a wrapped name whose CANNOT_SET_RESOLVER fuse is burned', () => {
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv1' })
    v1Query = settled({
      subject: {
        kind: 'v1-wrapped',
        owner: OWNER,
        fuses: { cannotSetResolver: true },
      },
    })

    const result = render('wrapped.eth')

    expect(result.canSet).toBe(false)
    expect(result.target).toEqual({ protocol: 'ENSv1', isWrapped: true })
  })

  it('uses the role for a V2 name', () => {
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv2' })
    registriesQuery = settled([undefined, V2_REGISTRY])
    roleQuery = settled(true)

    const result = render('modern.eth')

    expect(result.canSet).toBe(true)
    expect(result.target).toEqual({
      protocol: 'ENSv2',
      registryAddress: V2_REGISTRY,
      resourceId: requireResourceIdForName('modern.eth'),
    })
  })

  it('has no V2 target for a name whose id cannot be established', () => {
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv2' })
    registriesQuery = settled([undefined, V2_REGISTRY])
    roleQuery = settled(true)

    // An encoded label: `labelhash` returns the digits verbatim rather than
    // hashing them, so no id can be trusted and the write has nowhere to go.
    const result = render(`[${'0'.repeat(64)}].eth`)

    expect(result.target).toBeNull()
  })

  it('refuses a V2 name without the role, whoever is asking', () => {
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv2' })
    registriesQuery = settled([undefined, V2_REGISTRY])
    roleQuery = settled(false)

    expect(render('modern.eth').canSet).toBe(false)
  })

  it('reports no target when no registry holds the name', () => {
    // A gasless DNS name: resolvable from its zone, absent from both registries.
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv1' })
    v1Query = settled({ subject: null })

    const result = render('gasless.xyz')

    expect(result.target).toBeNull()
    expect(result.canSet).toBe(false)
  })

  it('stays loading while the V1 state is in flight', () => {
    ownerQuery = settled({ owner: OWNER, protocolVersion: 'ENSv1' })
    v1Query = loading()

    expect(render('jobintime.xyz').isLoading).toBe(true)
  })

  it('refuses when no wallet is connected', () => {
    asV1Registry(OWNER)
    connectedAddress = undefined

    expect(render('jobintime.xyz').canSet).toBe(false)
  })
})
