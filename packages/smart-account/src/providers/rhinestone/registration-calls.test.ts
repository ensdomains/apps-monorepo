// biome-ignore-all lint/suspicious/noExplicitAny: decoded ABI args need flexible typing in tests

import {
  permissionedResolverInitializeSnippet,
  permissionedResolverSetAddressSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import type { Address, Hex } from 'viem'
import {
  decodeFunctionData,
  encodeFunctionData,
  keccak256,
  parseAbi,
  toFunctionSelector,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import { computeResolverSalt, getDestinationContracts } from './manifest'
import {
  buildCommitCall,
  buildRevealBatch,
  computeResolverAddress,
} from './registration-calls'

const HCA = '0xaaaa000000000000000000000000000000000001' as const
const WALLET = '0x1111111111111111111111111111111111111111' as const
const RESOLVER = '0x3333333333333333333333333333333333333333' as const
const SECRET = `0x${'7'.repeat(64)}` as Hex
const C = getDestinationContracts(sepolia.id)

const ethRegistrarAbi = parseAbi([
  'function commit(bytes32 commitment)',
  'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer)',
])
/** ROLES.ALL from contracts-v2 deploy-constants: every nibble = 1. */
const EXPECTED_ROLES_ALL =
  0x1111111111111111111111111111111111111111111111111111111111111111n

describe('computeResolverAddress', () => {
  it('uses the pinned proxy logic to derive the exact CREATE2 address', () => {
    expect(computeResolverAddress({ chainId: sepolia.id, hca: HCA })).toBe(
      '0x3f30117Db553fc15aB3FFBD1287f4E8838D53C14',
    )
  })
})

describe('buildCommitCall', () => {
  it('targets the registrar with value 0', () => {
    const call = buildCommitCall({
      chainId: sepolia.id,
      commitment: `0x${'a'.repeat(64)}` as Hex,
    })
    expect(call.to.toLowerCase()).toBe(C.ethRegistrar.toLowerCase())
    expect(call.value).toBe(0n)
  })
})

describe('buildRevealBatch ordering', () => {
  const base = {
    chainId: sepolia.id,
    hca: HCA as Address,
    resolver: RESOLVER as Address,
    label: 'myname',
    wallet: WALLET as Address,
    secret: SECRET,
    price: 12_345n,
    duration: 28n * 86400n,
  }

  it('omits deployProxy when the resolver already exists; exact tail order', () => {
    const calls = buildRevealBatch({ ...base, resolverDeployed: true })
    // approve → register → setAddress
    expect(calls).toHaveLength(3)
    expect(calls[0].to.toLowerCase()).toBe(C.usdc.toLowerCase()) // approve
    expect(calls[1].to.toLowerCase()).toBe(C.ethRegistrar.toLowerCase()) // register
    expect(calls[2].to.toLowerCase()).toBe(RESOLVER.toLowerCase()) // setAddress
  })

  it('matches the deployed policy keccak for the deployProxy call', () => {
    // HCAResolverPolicyLib.checkDeployment requires grants of exactly
    // [(hca, ALL_ROLES), (owner, ALL_ROLES)], re-encodes the call around its
    // own PERMITTED_RESOLVER_IMPL and compares keccak hashes. Reproduced here
    // from the deployed validator's source (0x4bf64159, the build-info in
    // contracts-v2 `deployments/sepolia` @ 95de2ee0), so drift in the grants,
    // the encoding or the impl address fails here rather than on chain as an
    // opaque PolicyRuleFailed()/InvalidSignature().
    const calls = buildRevealBatch({ ...base, resolverDeployed: false })
    const salt = computeResolverSalt(HCA)

    const expectedInitData = encodeFunctionData({
      abi: permissionedResolverInitializeSnippet,
      functionName: 'initialize',
      args: [
        [
          { account: HCA, roleBitmap: EXPECTED_ROLES_ALL },
          { account: WALLET, roleBitmap: EXPECTED_ROLES_ALL },
        ],
        [],
      ],
    })
    const expectedCallData = encodeFunctionData({
      abi: verifiableFactoryDeployProxySnippet,
      functionName: 'deployProxy',
      args: [C.permissionedResolverImpl, salt, expectedInitData],
    })

    expect(keccak256(calls[0].data)).toBe(keccak256(expectedCallData))
  })

  it('never emits authorizeNameRoles — gone from resolver and policy alike', () => {
    for (const resolverDeployed of [true, false]) {
      const calls = buildRevealBatch({ ...base, resolverDeployed })
      // 0xbbd9abb5 is on neither PermissionedResolver nor the validator's
      // selector whitelist; the wallet is granted via initialize instead.
      expect(calls.some((c) => c.data.startsWith('0xbbd9abb5'))).toBe(false)
    }
  })

  it('prepends deployProxy with EMPTY initialize calls, records standalone', () => {
    const calls = buildRevealBatch({ ...base, resolverDeployed: false })
    expect(calls[0].to.toLowerCase()).toBe(C.verifiableFactory.toLowerCase())
    // deployProxy → approve → register → setAddress
    expect(calls).toHaveLength(4)

    // HCAOwnerAndSessionValidator rebuilds the expected deployProxy calldata
    // and compares keccak hashes, so the initializer must match byte for byte.
    const deploy = decodeFunctionData({
      abi: verifiableFactoryDeployProxySnippet,
      data: calls[0].data,
    })
    const initData = (deploy.args as any)[2] as Hex
    // `initialize(Grant[],bytes[])` — the deployed impl has no
    // `initialize(address,uint256,bytes[])`; encoding that hits the proxy
    // fallback and reverts with empty data.
    expect(toFunctionSelector(permissionedResolverInitializeSnippet[0])).toBe(
      '0x33cc44a0',
    )
    expect(initData.slice(0, 10)).toBe('0x33cc44a0')
    const init = decodeFunctionData({
      abi: permissionedResolverInitializeSnippet,
      data: initData,
    })
    expect(init.functionName).toBe('initialize')

    // HCAResolverPolicyLib.checkDeployment pins the grants exactly:
    //   grants.length == 2, [0] == (hca, ALL_ROLES), [1] == (owner, ALL_ROLES).
    // Anything else — including the single-grant form that predates the
    // wallet grant moving into initialize — reverts PolicyRuleFailed().
    const grants = (init.args as any)[0]
    expect(grants).toHaveLength(2)
    expect(grants[0].account.toLowerCase()).toBe(HCA.toLowerCase())
    expect(grants[0].roleBitmap).toBe(EXPECTED_ROLES_ALL)
    expect(grants[1].account.toLowerCase()).toBe(WALLET.toLowerCase())
    expect(grants[1].roleBitmap).toBe(EXPECTED_ROLES_ALL)
    expect((init.args as any)[1]).toHaveLength(0)

    // ...and the record write is a standalone, individually-checked call.
    // 0xb4436dde is `IAddressSetter.setAddress`, on the policy's record-setter
    // list; the v1 setAddr 0x8b95dd71 is on neither the resolver nor that list.
    const setAddressCalls = calls.filter(
      (c) =>
        c.to.toLowerCase() === RESOLVER.toLowerCase() &&
        c.data.startsWith('0xb4436dde'), // setAddress(bytes,uint256,bytes)
    )
    expect(setAddressCalls).toHaveLength(1)
    const setAddress = decodeFunctionData({
      abi: permissionedResolverSetAddressSnippet,
      data: setAddressCalls[0].data,
    })
    expect((setAddress.args as any)[0]).toBe(toHex(packetToBytes('myname.eth')))
    expect((setAddress.args as any)[1]).toBe(60n) // COIN_TYPE_ETH
    expect(((setAddress.args as any)[2] as string).toLowerCase()).toBe(
      WALLET.toLowerCase(),
    )
  })

  it('issues the record writes as standalone calls when the resolver already exists', () => {
    const calls = buildRevealBatch({ ...base, resolverDeployed: true })
    const setAddressCall = calls.find(
      (c) => c.to.toLowerCase() === RESOLVER.toLowerCase(),
    )
    expect(setAddressCall).toBeDefined()
    const decoded = decodeFunctionData({
      abi: permissionedResolverSetAddressSnippet,
      // biome-ignore lint/style/noNonNullAssertion: asserted above
      data: setAddressCall!.data,
    })
    expect(decoded.functionName).toBe('setAddress')
    expect(((decoded.args as any)[2] as string).toLowerCase()).toBe(
      WALLET.toLowerCase(),
    )
  })

  it('appends setNameWithHCA after the record writes when a primary name is set', () => {
    const calls = buildRevealBatch({
      ...base,
      resolverDeployed: true,
      setPrimaryName: 'myname.eth',
    })
    const adapterIdx = calls.findIndex(
      (c) =>
        c.to.toLowerCase() ===
        C.defaultReverseRegistrarHcaAdapter.toLowerCase(),
    )
    const lastRecordIdx = calls.reduce(
      (acc, c, i) => (c.data.startsWith('0xb4436dde') ? i : acc),
      -1,
    )
    expect(adapterIdx).toBeGreaterThan(-1)
    expect(adapterIdx).toBeGreaterThan(lastRecordIdx)
    // setNameWithHCA(address,string) — the only selector the validator accepts
    // on DEFAULT_REVERSE_REGISTRAR_HCA_ADAPTER
    expect(calls[adapterIdx].data.startsWith('0xab863445')).toBe(true)
  })

  it('registers the wallet (not the HCA) as owner and approves exactly the price', () => {
    const calls = buildRevealBatch({ ...base, resolverDeployed: true })
    const register = calls[1]
    const decoded = decodeFunctionData({
      abi: ethRegistrarAbi,
      data: register.data,
    })
    expect(decoded.functionName).toBe('register')
    expect((decoded.args as any)[1].toLowerCase()).toBe(WALLET.toLowerCase())
    expect((decoded.args as any)[6].toLowerCase()).toBe(C.usdc.toLowerCase())
  })

  it('sets value 0 on every inner call', () => {
    const calls = buildRevealBatch({ ...base, resolverDeployed: false })
    for (const c of calls) expect(c.value).toBe(0n)
  })
})
