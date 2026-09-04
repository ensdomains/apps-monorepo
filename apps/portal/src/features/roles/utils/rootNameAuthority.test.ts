import { describe, expect, it } from 'vitest'
import { rootNameAuthority } from './rootNameAuthority'

describe('rootNameAuthority', () => {
  it('reports nothing when no root role has a holder', () => {
    expect(rootNameAuthority({})).toEqual([])
    expect(rootNameAuthority(undefined)).toEqual([])
  })

  it('reports the roles that act on a name, with their holder counts', () => {
    // chakri.eth's subregistry root, as measured on Sepolia.
    expect(
      rootNameAuthority({
        ROLE_UNREGISTER: 1,
        ROLE_SET_RESOLVER: 1,
        ROLE_SET_SUBREGISTRY: 1,
        ROLE_RENEW: 1,
      }),
    ).toEqual([
      { role: 'ROLE_UNREGISTER', holders: 1 },
      { role: 'ROLE_SET_RESOLVER', holders: 1 },
      { role: 'ROLE_SET_SUBREGISTRY', holders: 1 },
    ])
  })

  it('says nothing for the .eth registry root', () => {
    // As measured: registrar, register-reserved, set-parent and set-uri govern
    // the registry, and renew can only extend an expiry. None of it is
    // authority against a 2LD's owner, so the section stays silent there.
    expect(
      rootNameAuthority({
        ROLE_REGISTRAR: 1,
        ROLE_REGISTRAR_ADMIN: 1,
        ROLE_REGISTER_RESERVED: 2,
        ROLE_SET_PARENT: 1,
        ROLE_SET_URI: 1,
        ROLE_RENEW: 2,
      }),
    ).toEqual([])
  })

  it('never reports transfer, which a root grant cannot authorise', () => {
    // contracts-v2 #433: the transfer gate is checked on the token's own
    // resource, so a root holder cannot move the name even though the registry
    // counts them and `hasRoles` answers true.
    expect(rootNameAuthority({ ROLE_CAN_TRANSFER_ADMIN: 1 })).toEqual([])
  })

  it('drops a role whose holders have all been revoked', () => {
    expect(
      rootNameAuthority({ ROLE_UNREGISTER: 0, ROLE_SET_RESOLVER: 1 }),
    ).toEqual([{ role: 'ROLE_SET_RESOLVER', holders: 1 }])
  })
})
