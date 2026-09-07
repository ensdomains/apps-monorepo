import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { rootNameAuthority } from './rootNameAuthority'

const ALICE: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const holder = (account: Address, ...roles: Role[]) => ({ account, roles })

describe('rootNameAuthority', () => {
  it('reports nobody when there are no root holders', () => {
    expect(rootNameAuthority([])).toEqual([])
    expect(rootNameAuthority(undefined)).toEqual([])
  })

  it('lists the powers a root holder can exercise over the name', () => {
    // chakri.eth's subregistry root, as measured on Sepolia.
    expect(
      rootNameAuthority([
        holder(
          ALICE,
          'ROLE_UNREGISTER',
          'ROLE_SET_RESOLVER',
          'ROLE_SET_SUBREGISTRY',
          'ROLE_RENEW',
          'ROLE_REGISTRAR',
        ),
      ]),
    ).toEqual([
      {
        account: ALICE,
        powers: [
          'ROLE_UNREGISTER',
          'ROLE_SET_RESOLVER',
          'ROLE_SET_SUBREGISTRY',
        ],
      },
    ])
  })

  it('counts an _ADMIN variant as the power itself', () => {
    // A root admin can grant itself the regular role at will, so the authority
    // is the same. Root holders are exempt from the registered-name rule that
    // only regular roles may be granted.
    expect(
      rootNameAuthority([holder(ALICE, 'ROLE_SET_RESOLVER_ADMIN')]),
    ).toEqual([{ account: ALICE, powers: ['ROLE_SET_RESOLVER'] }])
  })

  it('does not list the same power twice when both variants are held', () => {
    expect(
      rootNameAuthority([
        holder(ALICE, 'ROLE_UNREGISTER', 'ROLE_UNREGISTER_ADMIN'),
      ]),
    ).toEqual([{ account: ALICE, powers: ['ROLE_UNREGISTER'] }])
  })

  it('says nothing for the .eth registry root', () => {
    // As measured: registrar, register-reserved, set-parent and set-uri govern
    // the registry, and renew can only extend an expiry. None of it is
    // authority against a 2LD's owner, so the section stays silent there.
    expect(
      rootNameAuthority([
        holder(ALICE, 'ROLE_REGISTRAR', 'ROLE_REGISTRAR_ADMIN', 'ROLE_RENEW'),
        holder(
          BOB,
          'ROLE_REGISTER_RESERVED',
          'ROLE_SET_PARENT',
          'ROLE_SET_URI',
        ),
      ]),
    ).toEqual([])
  })

  it('never lists transfer, which a root grant cannot authorise', () => {
    // The transfer gate checks the role on the token's owner, and ERC-1155
    // still requires the caller to be that owner or approved, so a root holder
    // cannot move anyone else's name even though `hasRoles` answers true.
    expect(
      rootNameAuthority([holder(ALICE, 'ROLE_CAN_TRANSFER_ADMIN')]),
    ).toEqual([])
  })

  it('keeps only the holders with authority', () => {
    expect(
      rootNameAuthority([
        holder(ALICE, 'ROLE_RENEW'),
        holder(BOB, 'ROLE_UNREGISTER'),
      ]),
    ).toEqual([{ account: BOB, powers: ['ROLE_UNREGISTER'] }])
  })
})
