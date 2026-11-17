// One EAC role per nybble, its admin 128 bits higher (ensjs `registryRoles`/`resolverRoles`), named as bigname names powers.

export type RoleContract = 'registry' | 'resolver'

const NYBBLES: Readonly<
  Record<RoleContract, Readonly<Record<number, string>>>
> = {
  registry: {
    0: 'registrar',
    1: 'register_reserved',
    2: 'set_parent',
    3: 'unregister',
    4: 'renew',
    5: 'set_subregistry',
    6: 'set_resolver',
    7: 'can_transfer',
    8: 'was_reserved',
    9: 'set_uri',
    30: 'can_name',
    31: 'upgrade',
  },
  resolver: {
    0: 'set_addr',
    1: 'set_text',
    2: 'set_contenthash',
    3: 'set_abi',
    4: 'set_interface',
    5: 'set_name',
    6: 'set_data',
    7: 'link',
    30: 'can_name',
    31: 'upgrade',
  },
}

const ADMIN_OFFSET = 32

// The transfer role exists only as an admin role, which bigname names by its contract constant.
const toAdminPower = (power: string) =>
  power === 'can_transfer' ? 'can_transfer_admin' : `admin_${power}`

/** The powers a role bitmap grants, in bigname's vocabulary; unknown bits are skipped. */
export const decodePowers = (
  bitmap: bigint,
  contract: RoleContract,
): readonly string[] =>
  Array.from({ length: 2 * ADMIN_OFFSET }, (_, nybble) => nybble).flatMap(
    (nybble) => {
      if (((bitmap >> BigInt(nybble * 4)) & 1n) === 0n) return []
      const isAdmin = nybble >= ADMIN_OFFSET
      const power = NYBBLES[contract][nybble % ADMIN_OFFSET]
      if (power === undefined) return []
      if (isAdmin) return [toAdminPower(power)]
      // A bare transfer bit carries no power; only its admin form does.
      return power === 'can_transfer' ? [] : [power]
    },
  )

/** Powers granted between two bitmaps, and those taken away. */
export const diffPowers = (
  before: bigint,
  after: bigint,
  contract: RoleContract,
) => ({
  powers: decodePowers(after, contract),
  addedPowers: decodePowers(after & ~before, contract),
  removedPowers: decodePowers(before & ~after, contract),
})

// zigens names roles after the contract constants, e.g. `SET_RESOLVER_ADMIN`.
const ZIGENS_RESOLVER_NAMES: Readonly<Record<string, string>> = {
  SET_ADDRESS: 'set_addr',
}

/** A zigens role name in bigname's vocabulary. */
export const toPowerName = (role: string): string => {
  if (role === 'CAN_TRANSFER_ADMIN' || role === 'CAN_TRANSFER')
    return 'can_transfer_admin'
  const isAdmin = role.endsWith('_ADMIN')
  const base = (isAdmin ? role.slice(0, -'_ADMIN'.length) : role).replace(
    /^ROLE_/,
    '',
  )
  const power = ZIGENS_RESOLVER_NAMES[base] ?? base.toLowerCase()
  return isAdmin ? `admin_${power}` : power
}
