import {
  encodeResolverRoleBitmap,
  type ResolverRole,
} from '@ensdomains/ensjs/utils/v2'
import { okAsync } from 'neverthrow'
import type { Address } from 'viem'
import {
  ContractFunctionExecutionError,
  ExecutionRevertedError,
  toFunctionSelector,
  zeroAddress,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasV2NameEntry, readNameResolver } from './changeResolver'
import { getProfileEthAddressSnapshot } from './profileEthAddress'

const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const OWNER = '0x1111111111111111111111111111111111111111' as Address
const V1_RESOLVER = '0x4444444444444444444444444444444444444444' as Address
const V2_RESOLVER = '0x5555555555555555555555555555555555555555' as Address
const FALLBACK_RESOLVER =
  '0x6666666666666666666666666666666666666666' as Address

const client = vi.hoisted(() => ({
  multicall: vi.fn(),
  call: vi.fn(),
  getCode: vi.fn(async () => '0x6000'),
  readContract: vi.fn(),
}))

vi.mock('@/lib/wagmi', () => ({ publicClient: client }))
vi.mock('./changeResolver', () => ({
  resolveNameRegistry: vi.fn(async () => ({
    label: 'leon',
    registryAddress: RESOLVER,
  })),
  readNameResolver: vi.fn(
    async () => '0x0000000000000000000000000000000000000000',
  ),
  hasV2NameEntry: vi.fn(async () => false),
  NameRegistryNotFoundError: class extends Error {},
}))

vi.mock('./profileEthAddress', async () => {
  const { okAsync } = await import('neverthrow')
  return {
    getProfileEthAddressSnapshot: vi.fn(() =>
      okAsync({ resolverAddress: RESOLVER, ethAddress: null }),
    ),
  }
})

const { getProfileRecordAccess, getResolverWriteState } = await import(
  './resolverWriteAccess'
)

const ALL_EDITABLE = {
  text: true,
  address: true,
  contentHash: true,
  abi: true,
}

const supportsNameSetters = (supported: boolean) =>
  client.multicall.mockResolvedValue([{ status: 'success', result: supported }])

const RECORD_ROLES = [
  'ROLE_SET_ADDRESS',
  'ROLE_SET_TEXT',
  'ROLE_SET_CONTENTHASH',
  'ROLE_SET_ABI',
] as const satisfies readonly ResolverRole[]

// The V1 registry read keeps returning no resolver.
const grantRootRoles = (roles: readonly ResolverRole[]) =>
  client.readContract.mockImplementation(
    async ({ functionName }: { functionName: string }) =>
      functionName === 'roles' ? encodeResolverRoleBitmap(roles) : zeroAddress,
  )

const probedSelector = () => {
  const call = client.call.mock.calls[0]
  if (!call) throw new Error('expected the resolver to be probed via call')
  return (call[0] as { data: string }).data.slice(0, 10)
}

beforeEach(() => {
  vi.mocked(hasV2NameEntry).mockResolvedValue(false)
  vi.mocked(readNameResolver).mockResolvedValue(zeroAddress)
  client.multicall.mockReset()
  client.call.mockReset()
  client.readContract.mockReset()
  client.readContract.mockResolvedValue(zeroAddress)
})

describe('getResolverWriteState', () => {
  // The probe must dry-run the same calldata the write sends; otherwise a
  // resolver passes the check and the save reverts.
  it('probes a PermissionedResolver with the name-based setter', async () => {
    supportsNameSetters(true)
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(true)
    expect(client.call).toHaveBeenCalledWith(
      expect.objectContaining({ account: OWNER, to: RESOLVER }),
    )
    expect(probedSelector()).toBe(
      toFunctionSelector('setAddress(bytes,uint256,bytes)'),
    )
  })

  it('probes a public or legacy resolver with the node-based setter', async () => {
    supportsNameSetters(false)
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(true)
    expect(probedSelector()).toBe(
      toFunctionSelector('setAddr(bytes32,uint256,bytes)'),
    )
  })

  it('reports no access when the dry run reverts', async () => {
    supportsNameSetters(false)
    client.call.mockRejectedValue(
      new ContractFunctionExecutionError(new ExecutionRevertedError(), {
        abi: [],
        functionName: 'setAddr',
      }),
    )

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(false)
  })

  it('surfaces a non-revert failure instead of reporting no access', async () => {
    supportsNameSetters(true)
    client.call.mockRejectedValue(new Error('rpc down'))

    const result = await getResolverWriteState('leon.eth', OWNER)

    expect(result.isErr()).toBe(true)
  })
  it('reports no resolver as not writable with no address', async () => {
    vi.mocked(getProfileEthAddressSnapshot).mockReturnValueOnce(
      okAsync({ resolverAddress: undefined, ethAddress: undefined }),
    )

    const result = await getResolverWriteState('pookie.eth', OWNER)

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: undefined,
      canWrite: false,
    })
    expect(client.call).not.toHaveBeenCalled()
  })

  it('reports the resolver address alongside a successful probe', async () => {
    client.multicall.mockResolvedValue([{ status: 'success', result: false }])
    client.call.mockResolvedValue({ data: '0x' })

    const result = await getResolverWriteState('pookie.eth', OWNER)

    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: RESOLVER,
      canWrite: true,
    })
  })

  it.each([
    { case: 'ENSv1 subname', isRegisteredInV2: false, expected: V1_RESOLVER },
    {
      case: 'ENSv1 .eth name the v2 registry falls back for',
      isRegisteredInV2: false,
      v2Resolver: FALLBACK_RESOLVER,
      expected: V1_RESOLVER,
    },
    {
      case: 'registered ENSv2 name',
      isRegisteredInV2: true,
      v2Resolver: V2_RESOLVER,
      expected: V2_RESOLVER,
    },
  ])(
    'probes the resolver that holds the records of an $case',
    async ({ isRegisteredInV2, v2Resolver, expected }) => {
      vi.mocked(hasV2NameEntry).mockResolvedValue(isRegisteredInV2)
      if (v2Resolver) vi.mocked(readNameResolver).mockResolvedValue(v2Resolver)
      client.readContract.mockResolvedValue(V1_RESOLVER)
      supportsNameSetters(false)
      client.call.mockResolvedValue({ data: '0x' })

      const result = await getResolverWriteState('2.testname1234.eth', OWNER)

      expect(result._unsafeUnwrap()).toEqual({
        resolverAddress: expected,
        canWrite: true,
      })
      expect(client.call).toHaveBeenCalledWith(
        expect.objectContaining({ to: expected }),
      )
    },
  )

  // A resolver can lock the address record while the owner keeps text roles.
  it.each([
    { access: 'eth-address', canWrite: false },
    { access: 'profile', canWrite: true },
  ] as const)(
    'reports $access access as $canWrite on a PermissionedResolver without ROLE_SET_ADDRESS',
    async ({ access, canWrite }) => {
      supportsNameSetters(true)
      grantRootRoles(['ROLE_SET_TEXT', 'ROLE_SET_CONTENTHASH', 'ROLE_SET_ABI'])
      client.call.mockRejectedValue(
        new ContractFunctionExecutionError(new ExecutionRevertedError(), {
          abi: [],
          functionName: 'setAddress',
        }),
      )

      const result = await getResolverWriteState('leon.eth', OWNER, access)

      expect(result._unsafeUnwrap().canWrite).toBe(canWrite)
    },
  )

  it.each([
    { type: 'address', role: 'ROLE_SET_ADDRESS' },
    { type: 'text', role: 'ROLE_SET_TEXT' },
    { type: 'contentHash', role: 'ROLE_SET_CONTENTHASH' },
    { type: 'abi', role: 'ROLE_SET_ABI' },
  ] as const)(
    'reports only $type as locked when the owner lacks the root $role',
    async ({ type, role }) => {
      supportsNameSetters(true)
      grantRootRoles(RECORD_ROLES.filter((granted) => granted !== role))

      const result = await getProfileRecordAccess('leon.eth', OWNER)

      expect(result._unsafeUnwrap()).toEqual({
        resolverAddress: RESOLVER,
        canWrite: true,
        editableTypes: { ...ALL_EDITABLE, [type]: false },
      })
      expect(client.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: RESOLVER,
          functionName: 'roles',
          args: [0n, OWNER],
        }),
      )
      expect(client.call).not.toHaveBeenCalled()
    },
  )

  it('reports no profile access when the owner holds no record roles', async () => {
    supportsNameSetters(true)
    grantRootRoles(['ROLE_SET_NAME'])

    const result = await getResolverWriteState('leon.eth', OWNER, 'profile')

    expect(result._unsafeUnwrap().canWrite).toBe(false)
  })

  // Node-based resolvers authorize every setter alike.
  it.each([
    { case: 'succeeds', reverts: false },
    { case: 'reverts', reverts: true },
  ])(
    'applies one ETH address dry run to every record type when it $case',
    async ({ reverts }) => {
      supportsNameSetters(false)
      if (reverts)
        client.call.mockRejectedValue(
          new ContractFunctionExecutionError(new ExecutionRevertedError(), {
            abi: [],
            functionName: 'setAddr',
          }),
        )
      else client.call.mockResolvedValue({ data: '0x' })

      const result = await getProfileRecordAccess('leon.eth', OWNER)

      expect(result._unsafeUnwrap().editableTypes).toEqual({
        text: !reverts,
        address: !reverts,
        contentHash: !reverts,
        abi: !reverts,
      })
      expect(client.call).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps a name resolution cannot reach unwritable despite an ENSv1 registry resolver', async () => {
    client.readContract.mockResolvedValue(V1_RESOLVER)
    vi.mocked(getProfileEthAddressSnapshot).mockReturnValueOnce(
      okAsync({ resolverAddress: undefined, ethAddress: undefined }),
    )

    const result = await getResolverWriteState('1.qa-ens.eth', OWNER)

    expect(result._unsafeUnwrap().canWrite).toBe(false)
    expect(client.call).not.toHaveBeenCalled()
  })
})
