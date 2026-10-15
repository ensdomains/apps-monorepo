// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const PARENT_OWNER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const PARENT_REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const TLD_REGISTRY = '0x2222222222222222222222222222222222222222' as Address

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

type QueryStub = {
  data: unknown
  isLoading: boolean
  isError: boolean
}

const idle = (): QueryStub => ({
  data: undefined,
  isLoading: false,
  isError: false,
})

let ownerQuery: QueryStub = idle()
const roleQueries: Record<string, QueryStub> = {
  ROLE_UNREGISTER: idle(),
  ROLE_REGISTRAR: idle(),
  ROLE_SET_SUBREGISTRY: idle(),
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQueries: ({
      queries,
    }: {
      queries: { queryKey: readonly unknown[]; enabled?: boolean }[]
    }) =>
      queries.map(({ queryKey, enabled }) => {
        // A disabled query never reports loading — mirror that, or the hook
        // would look permanently pending whenever a lookup is gated off.
        if (enabled === false) return idle()
        if (queryKey[0] === 'get-ens-owner') return ownerQuery
        if (queryKey[0] === 'hasRoles') {
          const { roles } = queryKey[1] as { roles: string[] }
          return roleQueries[roles[0]] ?? idle()
        }
        return idle()
      }),
  }
})

const { useParentAuthority } = await import('./useParentAuthority')

const render = (name: string, parentName: string | null) =>
  renderHook(() =>
    useParentAuthority({
      name,
      parentName,
      registryAddress: PARENT_REGISTRY,
      owner: OWNER,
    }),
  ).result.current

const parentOwnedBy = (owner: Address) => {
  ownerQuery = {
    data: { owner, registryAddress: TLD_REGISTRY },
    isLoading: false,
    isError: false,
  }
}

const holds = (...roles: string[]) => {
  for (const role of Object.keys(roleQueries))
    roleQueries[role] = {
      data: roles.includes(role),
      isLoading: false,
      isError: false,
    }
}

describe('useParentAuthority', () => {
  beforeEach(() => {
    ownerQuery = idle()
    for (const role of Object.keys(roleQueries)) roleQueries[role] = idle()
  })

  it('claims nothing for a name with no parent', () => {
    const authority = render('vayyari.eth', null)
    expect(authority.hasAnyAuthority).toBe(false)
    expect(authority.isLoading).toBe(false)
  })

  /**
   * SUB-F2 — a confirmed defect, recorded as `it.fails` rather than a red test.
   *
   * `it.fails` passes while the assertion below does NOT hold, so this stays
   * green in CI today and turns **red the moment somebody fixes the hook** —
   * which is the signal you want, and the prompt to convert it to a plain
   * `it`. A normal failing test would just make the portal package red for
   * everyone; deleting it would lose the evidence.
   *
   * Full write-up: e2e/docs/transfer-subname-web128-test-plan.md, SUB-F2.
   */
  it.fails('does not treat an unresolvable parent owner as "no authority"', () => {
    // The parent lookup succeeded but found nobody — an unowned or expired
    // parent, or one the resolver could not walk to. Every role query is then
    // gated off, so nothing is *known* about what the parent can do.
    //
    // The hook's own contract (see its `isError` comment) is that a failed
    // read is unknown, never safe. Silence here renders no alert at all, which
    // to the reader is indistinguishable from "the parent holds nothing" — the
    // one case where transferring really is final.
    ownerQuery = {
      data: { owner: ZERO_ADDRESS, registryAddress: TLD_REGISTRY },
      isLoading: false,
      isError: false,
    }
    holds('ROLE_UNREGISTER', 'ROLE_REGISTRAR', 'ROLE_SET_SUBREGISTRY')
    const authority = render('sub.vayyari.eth', 'vayyari.eth')
    expect(
      authority.isError,
      'an unresolvable parent owner must read as unknown, not as no authority',
    ).toBe(true)
  })

  it('reports no authority when the parent owner holds none of the roles', () => {
    // A subname issued from a registry its parent no longer controls really is
    // transferred for good — warning about it would be false.
    parentOwnedBy(PARENT_OWNER)
    holds()
    const authority = render('sub.vayyari.eth', 'vayyari.eth')
    expect(authority.hasAnyAuthority).toBe(false)
    expect(authority.canReclaimNow).toBe(false)
  })

  it('reports an immediate reclaim from ROLE_UNREGISTER alone', () => {
    // `unregister()` reverts *if* the name is expired, so this role is the
    // live-name path: no waiting for an expiry.
    parentOwnedBy(PARENT_OWNER)
    holds('ROLE_UNREGISTER')
    const authority = render('sub.vayyari.eth', 'vayyari.eth')
    expect(authority.canReclaimNow).toBe(true)
    expect(authority.canReissueAfterExpiry).toBe(false)
    expect(authority.hasAnyAuthority).toBe(true)
  })

  it('separates re-issue after expiry from an immediate reclaim', () => {
    parentOwnedBy(PARENT_OWNER)
    holds('ROLE_REGISTRAR')
    const authority = render('sub.vayyari.eth', 'vayyari.eth')
    expect(authority.canReissueAfterExpiry).toBe(true)
    expect(authority.canReclaimNow).toBe(false)
  })

  it('reports the registry repoint held on the parent’s own token', () => {
    parentOwnedBy(PARENT_OWNER)
    holds('ROLE_SET_SUBREGISTRY')
    const authority = render('sub.vayyari.eth', 'vayyari.eth')
    expect(authority.canRepointRegistry).toBe(true)
    expect(authority.hasAnyAuthority).toBe(true)
  })

  it('marks the parent as the sender when they own both', () => {
    parentOwnedBy(OWNER)
    holds('ROLE_UNREGISTER')
    expect(render('sub.vayyari.eth', 'vayyari.eth').parentIsSelf).toBe(true)
  })

  it('does not treat a failed lookup as "no authority"', () => {
    parentOwnedBy(PARENT_OWNER)
    holds()
    roleQueries.ROLE_UNREGISTER = {
      data: undefined,
      isLoading: false,
      isError: true,
    }
    const authority = render('sub.vayyari.eth', 'vayyari.eth')
    expect(authority.isError).toBe(true)
    expect(authority.hasAnyAuthority).toBe(false)
  })

  it('treats an unparseable label as unknown rather than safe', () => {
    parentOwnedBy(PARENT_OWNER)
    holds()
    // `getLabel` normalises and throws on a malformed name; roles cannot be
    // addressed for one, so the powers stay unchecked.
    expect(render('\u0000bad.vayyari.eth', 'vayyari.eth').isError).toBe(true)
  })

  it('stays loading while the parent owner is still resolving', () => {
    ownerQuery = { data: undefined, isLoading: true, isError: false }
    expect(render('sub.vayyari.eth', 'vayyari.eth').isLoading).toBe(true)
  })
})
