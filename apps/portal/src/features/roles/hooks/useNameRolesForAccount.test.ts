import { eacGrantRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryRolesSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { ok } from 'neverthrow'
import {
  type Address,
  decodeFunctionData,
  type Hex,
  keccak256,
  labelhash,
  toBytes,
  type WalletClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalResourceId,
  type ResourceId,
  requireResourceIdForName,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'

const readContract = vi.fn()
vi.mock('viem/actions', () => ({ readContract: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem/utils')>()
  return { ...actual, getAction: () => readContract }
})
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))

const { getNameRolesForAccountQueryOptions } = await import(
  './useNameRolesForAccount'
)
const { prepareGrantRolesTransaction } = await import('../helpers/grantRoles')

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const walletClient = {
  account: { address: ACCOUNT },
  chain: sepolia,
} as unknown as WalletClient

const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`

/** The id the permission read was asked about. */
const gateResource = async (resource: ResourceId): Promise<bigint> => {
  readContract.mockResolvedValue(0n)
  const options = getNameRolesForAccountQueryOptions({
    registryAddress: REGISTRY,
    resource,
    account: ACCOUNT,
  })
  await options.queryFn?.({} as never)
  return readContract.mock.calls.at(-1)?.[0].args[0] as bigint
}

/** The id the grant calldata was built for. */
const writeResource = (name: string, resource: ResourceId): bigint => {
  const intent = prepareGrantRolesTransaction({
    name,
    resourceId: resource,
    account: ACCOUNT,
    roles: ['ROLE_SET_RESOLVER'],
    walletClient,
    chainId: sepolia.id,
    registryAddress: REGISTRY,
  })
  if (intent.request.type !== 'eoa') throw new Error('expected an EOA request')
  const { args } = decodeFunctionData({
    abi: eacGrantRolesSnippet,
    data: intent.request.data as Hex,
  })
  return args[0] as bigint
}

beforeEach(() => {
  readContract.mockReset()
})

describe('the role gate and the role write address the same name', () => {
  it('agree for an ordinary label', async () => {
    const resource = requireResourceIdForName('vault.eth')

    expect(
      canonicalResourceId((await gateResource(resource)) as ResourceId),
    ).toBe(writeResource('vault.eth', resource))
  })

  // WEB-1458: the gate used to hash the displayed label, which for this string
  // is the digits inside the brackets — a different name than the write's.
  it('agree when an encoded label resolves to the literal reading', async () => {
    const resource = resourceIdFromChainValue(
      keccak256(toBytes(ENCODED_LABEL)),
    )._unsafeUnwrap()
    const name = `${ENCODED_LABEL}.eth`

    const asked = await gateResource(resource)

    expect(canonicalResourceId(asked as ResourceId)).toBe(
      writeResource(name, resource),
    )
    // Not the other reading, which is what a label-keyed gate would have used.
    expect(canonicalResourceId(asked as ResourceId)).not.toBe(
      canonicalResourceId(
        resourceIdFromChainValue(VAULT_LABELHASH)._unsafeUnwrap(),
      ),
    )
  })

  it('agree when an encoded label resolves to the decoded reading', async () => {
    const resource = resourceIdFromChainValue(VAULT_LABELHASH)._unsafeUnwrap()
    const name = `${ENCODED_LABEL}.eth`

    expect(
      canonicalResourceId((await gateResource(resource)) as ResourceId),
    ).toBe(writeResource(name, resource))
  })

  it('asks nothing and grants nothing without a resource', async () => {
    const options = getNameRolesForAccountQueryOptions({
      registryAddress: REGISTRY,
      resource: null,
      account: ACCOUNT,
    })

    const result = await options.queryFn?.({} as never)

    expect(result).toEqual({ decoded: [], raw: 0n })
    expect(readContract).not.toHaveBeenCalled()
  })

  it('reads the registry roles function, not a label-keyed one', async () => {
    await gateResource(requireResourceIdForName('vault.eth'))

    expect(readContract.mock.calls.at(-1)?.[0]).toMatchObject({
      address: REGISTRY,
      abi: permissionedRegistryRolesSnippet,
      functionName: 'roles',
    })
  })
})
