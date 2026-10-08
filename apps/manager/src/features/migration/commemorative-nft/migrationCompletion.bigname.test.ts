import type { LookupRecord, WrapperFuses } from '@ens-apps/indexer/bigname'
import { Storage } from 'happy-dom'
import { ok } from 'neverthrow'
import { type Address, namehash, zeroAddress } from 'viem'
import { multicall } from 'viem/actions'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'

const mocks = vi.hoisted(() => ({ names: vi.fn(), publicClient: vi.fn() }))
vi.mock('@/lib/bigname', () => ({ bigname: {} }))
vi.mock('@wagmi/core', () => ({ getPublicClient: mocks.publicClient }))
vi.mock('../service/v1Names', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service/v1Names')>()),
  getV1NamesForAddress: mocks.names,
}))
vi.mock('../service/getMigratedNamesCount', () => ({
  getMigratedNamesCount: async () => ok(1),
}))
vi.mock('./config', () => ({
  getCommemorativeNftContractAddress: () =>
    '0x2222222222222222222222222222222222222222',
}))
vi.mock('./diagnostics', () => ({ trackNftEvent: vi.fn() }))
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  multicall: vi.fn(),
}))

import { toV1Domain } from '../service/v1Names'
import { fetchCommemorativeNftMigrationCompletion } from './migrationCompletion'

const OWNER: Address = '0x1111111111111111111111111111111111111111'
const MANAGER: Address = '0x2222222222222222222222222222222222222222'
const HCA: Address = '0x3333333333333333333333333333333333333333'
const WRAPPER = '0x0635513f179d50a207757e05759cbd106d7dfce8'
const FUTURE = '4102444800'
const flags: WrapperFuses = {
  fuses: 196608,
  cannot_unwrap: false,
  cannot_burn_fuses: false,
  cannot_transfer: false,
  cannot_set_resolver: false,
  cannot_set_ttl: false,
  cannot_create_subdomain: false,
  cannot_approve: false,
  parent_cannot_control: true,
  is_dot_eth: true,
  can_extend_expiry: false,
}
const row: LookupRecord = {
  name: 'unwrapped.eth',
  display_name: 'unwrapped.eth',
  namespace: 'ens',
  namehash: namehash('unwrapped.eth'),
  owner: OWNER,
  manager: MANAGER,
  authority: 'ens_v1',
  registration_status: 'active',
  status: 'ok',
  ens_v1: {
    expires_at: FUTURE,
    wrapper_state: 'emancipated',
    wrapper_fuses: flags,
  },
}
const publicClient = { chain: envConfig.chain }
const params = {
  ownerAddress: OWNER,
  hcaAddress: HCA,
  chainId: envConfig.chain.id,
  wagmiConfig: {} as Parameters<
    typeof fetchCommemorativeNftMigrationCompletion
  >[0]['wagmiConfig'],
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new Storage())
  vi.clearAllMocks()
  mocks.publicClient.mockReturnValue(publicClient)
  vi.mocked(multicall).mockImplementation(async (_client, parameters) =>
    parameters.contracts.map((contract) => {
      if (
        typeof contract !== 'object' ||
        contract === null ||
        !('functionName' in contract)
      ) {
        throw new Error('Expected a contract read')
      }
      const success = (result: unknown) => ({
        status: 'success' as const,
        result,
      })
      switch (contract.functionName) {
        case 'getData':
          return success([zeroAddress, 196608, BigInt(FUTURE)])
        case 'ownerOf':
          return success(OWNER)
        case 'getStatus':
          return success(1)
        case 'owner':
        case 'getApproved':
          return success(zeroAddress)
        default:
          throw new Error('Unexpected contract read')
      }
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('Bigname migration completion', () => {
  it('keeps NFT minting blocked while a previously unwrapped name remains', async () => {
    const domain = toV1Domain(row, new Map(), WRAPPER)
    mocks.names.mockResolvedValue(ok([domain]))

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      status: 'incomplete',
      isComplete: false,
      remainingNameCount: 1,
      migratedNameCount: 1,
    })
  })
})
