import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { getAddress, zeroAddress } from 'viem'
import type {
  RegistryRepairName,
  RegistryRepairState,
} from './registryRepairState'

export const FACTORY = getAddress('0x00000000000000000000000000000000000000fa')
export const IMPLEMENTATION = getAddress(
  '0x00000000000000000000000000000000000001aa',
)
export const REPLACEMENT = getAddress(
  '0x00000000000000000000000000000000000002bb',
)
export const PARENT_REGISTRY = getAddress(
  '0x00000000000000000000000000000000000003cc',
)
export const CONTROLLER = getAddress(
  '0x0000000000000000000000000000000000000c01',
)
export const HCA = getAddress('0x0000000000000000000000000000000000000c02')
export const ALICE = getAddress('0x0000000000000000000000000000000000000a11')
export const BOB = getAddress('0x0000000000000000000000000000000000000b0b')
export const RESOLVER = getAddress('0x00000000000000000000000000000000000004dd')
export const CHILD_REGISTRY = getAddress(
  '0x00000000000000000000000000000000000005ee',
)
export const ALL = (1n << 256n) - 1n
export const SOME = 0x10n
export const REGISTRAR_AND_PARENT =
  registryRoles.ROLE_REGISTRAR | registryRoles.ROLE_SET_PARENT

export const makeName = (
  overrides: Partial<RegistryRepairName> = {},
): RegistryRepairName => ({
  label: 'alice',
  owner: ALICE,
  subregistry: zeroAddress,
  resolver: RESOLVER,
  expiry: 2_000_000_000n,
  roles: [{ account: ALICE, roleBitmap: ALL }],
  ...overrides,
})

export const makeState = (
  overrides: Partial<RegistryRepairState> = {},
): RegistryRepairState => ({
  parentRegistry: PARENT_REGISTRY,
  parentLabel: 'parent',
  parentTokenId: 42n,
  rootRoles: [
    { account: CONTROLLER, roleBitmap: ALL },
    { account: HCA, roleBitmap: ALL },
  ],
  names: [makeName()],
  expiredLabels: [],
  ...overrides,
})
