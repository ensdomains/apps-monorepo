import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { describe, expect, it } from 'vitest'
import { getRegistryRepairCase } from './registryRepairCase'

const { ROLE_REGISTRAR, ROLE_SET_PARENT } = registryRoles

describe('getRegistryRepairCase', () => {
  const run = (
    overrides: Partial<Parameters<typeof getRegistryRepairCase>[0]>,
  ) =>
    getRegistryRepairCase({
      isPendingUpgrade: true,
      isConnected: true,
      canSwitchParent: true,
      rootRoles: ROLE_REGISTRAR | ROLE_SET_PARENT,
      ...overrides,
    })

  it.each([
    ['an unaffected registry', { isPendingUpgrade: false }, 'unaffected'],
    ['an unchecked registry', { isPendingUpgrade: undefined }, 'unknown'],
    ['no connected wallet', { isConnected: false }, 'viewer'],
    [
      "an account that can't switch the name",
      { canSwitchParent: false },
      'viewer',
    ],
    ['unknown switch rights', { canSwitchParent: undefined }, 'unknown'],
    ['unread root roles', { rootRoles: undefined }, 'unknown'],
    ['every role the copy needs', {}, 'can-upgrade'],
    ['no registrar role', { rootRoles: ROLE_SET_PARENT }, 'viewer'],
    ['no set-parent role', { rootRoles: ROLE_REGISTRAR }, 'viewer'],
  ] as const)('with %s: %s', (_case, overrides, expected) => {
    expect(run(overrides)).toBe(expected)
  })
})
