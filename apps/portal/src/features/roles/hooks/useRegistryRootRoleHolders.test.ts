import { BignameError } from '@ens-apps/bigname'
import {
  mockPermissionsDiscoveredRegistryRoot,
  mockPermissionsRegistryRoot,
} from '@ens-apps/bigname/postV041.mock'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/utils/queryClient'

const REGISTRY: Address = '0xd4ebcbBDf463c9C45784603DB0ddD499BC44A8b4'
const HOLDER = getAddress('0x84d3a426d4e12e955d1df95db0b24fe26afe39d3')
const OTHER = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

const listPermissions = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { listPermissions } }))

const mockGetLogs = vi.fn()
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

const { getRegistryRootRoles } = await import('./useRegistryRootRoleHolders')

/** What v0.4.1 answers for `registry=`. */
const unknownRegistryParam = () =>
  new BignameError({
    status: 400,
    code: 'invalid_input',
    message: 'unknown query parameter: registry',
  })

const overloaded = () =>
  new BignameError({ status: 503, code: 'overloaded', message: 'overloaded' })

const log = (account: Address, newRoleBitmap: bigint) => ({
  address: REGISTRY,
  blockNumber: 10n,
  transactionHash: `0x${'1'.repeat(64)}`,
  args: { resource: 0n, account, oldRoleBitmap: 0n, newRoleBitmap },
})

const run = () => getRegistryRootRoles({ registryAddress: REGISTRY })

describe('getRegistryRootRoles', () => {
  beforeEach(() => {
    queryClient.clear()
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
        registry: { chain_id: 11155111, address: REGISTRY.toLowerCase() },
        page_size: 200,
        cursor: undefined,
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

    it('gives the roles the log scan gives: admin variants as their own role, in the same order', async () => {
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

      queryClient.clear()
      listPermissions.mockRejectedValue(unknownRegistryParam())
      mockGetLogs.mockResolvedValue([
        log(
          HOLDER,
          registryRoles.ROLE_RENEW |
            registryRoles.ROLE_RENEW_ADMIN |
            registryRoles.ROLE_CAN_TRANSFER_ADMIN |
            registryRoles.ROLE_UPGRADE_ADMIN,
        ),
      ])
      const fromLogs = (await run())._unsafeUnwrap().holders

      expect(fromBigname).toEqual(fromLogs)
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

    it('asks whether bigname serves them once, not on every read', async () => {
      listPermissions.mockResolvedValue(mockPermissionsRegistryRoot)

      await run()
      await run()

      // One probe, then one page per read.
      expect(listPermissions).toHaveBeenCalledTimes(3)
    })
  })

  describe('against bigname v0.4.1', () => {
    beforeEach(() => {
      listPermissions.mockRejectedValue(unknownRegistryParam())
    })

    it('falls back to the log scan when `registry` is an unknown parameter', async () => {
      mockGetLogs.mockResolvedValue([
        log(HOLDER, registryRoles.ROLE_REGISTRAR),
        log(OTHER, registryRoles.ROLE_RENEW),
        log(OTHER, 0n),
      ])

      expect((await run())._unsafeUnwrap()).toEqual({
        holders: [{ account: HOLDER, roles: ['ROLE_REGISTRAR'] }],
        areOperatorRolesUnlisted: false,
      })
    })

    it('remembers the answer instead of asking before every scan', async () => {
      await run()
      await run()

      expect(listPermissions).toHaveBeenCalledTimes(1)
      expect(mockGetLogs).toHaveBeenCalledTimes(2)
    })
  })

  describe('on any other bigname error', () => {
    it.each([
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

    it('errors when the holders read fails after the probe passed', async () => {
      listPermissions
        .mockResolvedValueOnce(mockPermissionsRegistryRoot)
        .mockRejectedValueOnce(overloaded())

      const result = await run()

      expect(result.isErr()).toBe(true)
      expect(mockGetLogs).not.toHaveBeenCalled()
    })

    it('does not remember a failed probe', async () => {
      listPermissions.mockRejectedValueOnce(overloaded())
      listPermissions.mockResolvedValue(mockPermissionsRegistryRoot)

      expect((await run()).isErr()).toBe(true)
      expect((await run()).isOk()).toBe(true)
    })
  })
})
