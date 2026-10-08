import { BignameError } from '@ens-apps/indexer/bigname'
import { ok, ResultAsync } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockPermissionsDiscoveredRegistryRoot,
  mockPermissionsRegistryRoot,
} from '@/test-utils/bigname/postV041.mock'

const REGISTRY: Address = '0xd4ebcbBDf463c9C45784603DB0ddD499BC44A8b4'
const HOLDER = getAddress('0x84d3a426d4e12e955d1df95db0b24fe26afe39d3')

const listPermissions = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    permissions: (...args: unknown[]) =>
      ResultAsync.fromPromise(listPermissions(...args), (e) => e),
  },
}))

const mockGetLogs = vi.fn()
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

const { getRegistryRootRoles } = await import('./useRegistryRootRoleHolders')

/** An unsupported deployment is an error, never a signal to scan RPC logs. */
const unknownRegistryParam = () =>
  new BignameError({
    status: 400,
    code: 'invalid_input',
    message: 'unknown query parameter: registry',
  })

const overloaded = () =>
  new BignameError({ status: 503, code: 'overloaded', message: 'overloaded' })

const run = () => getRegistryRootRoles({ registryAddress: REGISTRY })

describe('getRegistryRootRoles', () => {
  beforeEach(() => {
    listPermissions.mockReset()
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
  })

  describe('where bigname serves root roles', () => {
    it('lists a declared registry’s holders in full, without touching the node', async () => {
      listPermissions.mockResolvedValue(mockPermissionsRegistryRoot)

      const roles = (await run())._unsafeUnwrap()

      expect(roles).toEqual({
        holders: [
          {
            account: HOLDER,
            roles: ['ROLE_REGISTRAR', 'ROLE_REGISTRAR_ADMIN'],
          },
        ],
        areOperatorRolesUnlisted: false,
      })
      expect(listPermissions).toHaveBeenLastCalledWith({
        registry: `11155111:${REGISTRY.toLowerCase()}`,
        page_size: 200,
      })
      expect(mockGetLogs).not.toHaveBeenCalled()
    })

    it('says operator-held roles are unlisted for a discovered registry, on an empty page too', async () => {
      listPermissions.mockResolvedValue(mockPermissionsDiscoveredRegistryRoot)

      expect((await run())._unsafeUnwrap()).toEqual({
        holders: [],
        areOperatorRolesUnlisted: true,
      })
    })

    it('keeps admin variants as their own roles', async () => {
      listPermissions.mockResolvedValue({
        ...mockPermissionsRegistryRoot,
        data: [
          {
            ...mockPermissionsRegistryRoot.data[0],
            powers: [
              'admin_upgrade',
              'can_transfer_admin',
              'admin_renew',
              'renew',
            ],
          },
        ],
      })
      const fromBigname = (await run())._unsafeUnwrap().holders

      expect(fromBigname[0]?.roles).toHaveLength(4)
      expect(fromBigname[0]?.roles).toEqual(
        expect.arrayContaining([
          'ROLE_RENEW',
          'ROLE_RENEW_ADMIN',
          'ROLE_CAN_TRANSFER_ADMIN',
          'ROLE_UPGRADE_ADMIN',
        ]),
      )
    })

    it('drops a holder whose only powers have no ensjs role', async () => {
      listPermissions.mockResolvedValue({
        ...mockPermissionsRegistryRoot,
        data: [
          { ...mockPermissionsRegistryRoot.data[0], powers: ['can_name'] },
        ],
      })

      expect((await run())._unsafeUnwrap().holders).toEqual([])
    })

    it('reads root permissions directly without a capability probe', async () => {
      listPermissions.mockResolvedValue(mockPermissionsRegistryRoot)

      await run()
      await run()

      expect(listPermissions).toHaveBeenCalledTimes(2)
    })
  })

  describe('on any other bigname error', () => {
    it.each([
      ['an unsupported deployment', unknownRegistryParam()],
      [
        'a different 400',
        new BignameError({
          status: 400,
          code: 'invalid_input',
          message: 'registry is invalid',
        }),
      ],
      ['an outage', overloaded()],
    ])('errors on %s rather than falling back', async (_, error) => {
      listPermissions.mockRejectedValue(error)

      const result = await run()

      expect(result.isErr()).toBe(true)
      expect(mockGetLogs).not.toHaveBeenCalled()
    })

    it('can retry a failed permissions read', async () => {
      listPermissions.mockRejectedValueOnce(overloaded())
      listPermissions.mockResolvedValue(mockPermissionsRegistryRoot)

      expect((await run()).isErr()).toBe(true)
      expect((await run()).isOk()).toBe(true)
    })
  })
})
