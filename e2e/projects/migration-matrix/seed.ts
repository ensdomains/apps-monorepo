import { randomUUID } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { migrationHelperMigrateSnippet } from '@ensdomains/ensjs-abi/v2/migrationHelper'
import {
  type Address,
  bytesToHex,
  encodeFunctionData,
  type Hex,
  labelhash,
  namehash,
  parseAbi,
  stringToHex,
  zeroAddress,
} from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import {
  reserveInV2,
  V1_BASE_REGISTRAR,
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from '../../fixtures/makeV1Name.js'
import { makeV1Subname } from '../../fixtures/makeV1Subname.js'
import {
  APP_V1_CONTROLLER,
  ensureV1ControllersAuthorised,
} from '../../fixtures/v1-controller-auth.js'
import { setV1RecordsOn, type V1Records } from '../../fixtures/v1-records.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../helpers/anvil-client.js'
import { fundTestUsdc } from '../../helpers/fund-test-usdc.js'
import { localReceipt } from '../../helpers/local-receipt.js'
import type { MockV1Name } from '../../helpers/record-audit-inventory.js'
import { dnsEncode } from '../../helpers/resolve-records.js'

export type Configuration = {
  config_id: string
  level: string
  wrapping: string
  lock: string
  root_type: string
  parent_type: string
  root_lifecycle: string
  root_lifecycle_version: string
  name_expiry: string
  parent_migrated: string
  root_owner: string
  root_manager: string
  parent_controller: string
  name_holder: string
  name_manager: string
  retain_manager: string
  recreation_flag: string
  expected_migration: string
  actors: {
    case_id: string
    actor: string
    actor_role: string
    actor_parent_role: string
  }[]
}
const hdAccount = (id: string) =>
  mnemonicToAccount(
    'test test test test test test test test test test test junk',
    {
      addressIndex: id.startsWith('W')
        ? Number(id.slice(1)) - 1
        : ({ Operator: 4, 'Resolver delegate': 5, Unrelated: 6 }[id] ?? 7),
    },
  )
export const accountKey = (id: string) =>
  bytesToHex(hdAccount(id).getHdKey().privateKey!)
export const account = (id: string) => privateKeyToAccount(accountKey(id))
const contracts = ensL1Contracts[supportedL1Chains.sepolia]
const baseABI = parseAbi([
  'function register(uint256 id,address owner,uint256 duration) returns(uint256)',
  'function nameExpires(uint256 id) view returns(uint256)',
  'function setApprovalForAll(address operator,bool approved)',
  'function approve(address operator,uint256 id)',
])
const wrapperABI = parseAbi([
  'function wrapETH2LD(string label,address owner,uint16 fuses,address resolver)',
  'function unwrapETH2LD(bytes32 label,address registrant,address controller)',
  'function unwrap(bytes32 parent,bytes32 label,address controller)',
  'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)',
  'function setApprovalForAll(address operator,bool approved)',
  'function isApprovedForAll(address owner,address operator) view returns(bool)',
])
const registryABI = parseAbi([
  'function owner(bytes32 node) view returns(address)',
  'function resolver(bytes32 node) view returns(address)',
])
const resolverABI = parseAbi([
  'function approve(bytes32 node,address delegate,bool approved)',
])

export const send = async (
  signer: ReturnType<typeof account> | Address,
  to: Address,
  data: Hex,
  value = 0n,
) => {
  const hash = await walletClient.sendTransaction({
    account: signer,
    to,
    data,
    value,
    gas: 5_000_000n,
  })
  const receipt = await localReceipt(hash)
  if (receipt.status !== 'success')
    throw new Error(`Fixture transaction reverted: ${hash}`)
  return receipt
}

export function recordBundle(id: string): V1Records {
  const extended = process.env.MATRIX_RECORD_PROFILE === 'extended'
  return {
    texts: [
      { key: 'url', value: `https://example.com/${encodeURIComponent(id)}` },
      { key: 'description', value: `${id} — retained ✓` },
      ...(extended
        ? [
            { key: 'name', value: `Record test ${id}` },
            { key: 'email', value: 'qa@example.com' },
            { key: 'avatar', value: 'https://example.com/avatar.png' },
            { key: 'com.example.custom', value: `custom-${id}` },
            { key: 'qa.测试', value: '保存 ✓ — åäö' },
            { key: 'qa.empty', value: '' },
          ]
        : []),
    ],
    addresses: [
      { coinType: 60, value: account('W1').address },
      { coinType: 2147483658, value: account('W2').address },
      ...(extended
        ? [{ coinType: 0, value: `0x76a914${'11'.repeat(20)}88ac` as Hex }]
        : []),
    ],
    contenthash:
      '0xe30101701220b4b78f5e39d72872c0b0fe1d684c185c0ee3c4d783abdd452c8a9271def0e668',
    abis: [
      {
        contentType: 1,
        data: stringToHex(
          '[{"type":"function","name":"read","inputs":[],"outputs":[],"stateMutability":"view"}]',
        ),
      },
      ...(extended
        ? [
            {
              contentType: 2,
              data: bytesToHex(
                deflateSync(
                  '[{"type":"function","name":"compressed","inputs":[],"outputs":[],"stateMutability":"view"}]',
                ),
              ),
            },
            { contentType: 4, data: '0x80' as Hex },
            {
              contentType: 8,
              data: stringToHex('https://example.com/contract-abi.json'),
            },
          ]
        : []),
    ],
    interfaces: [
      { interfaceId: '0x12345678', implementer: account('W1').address },
      ...(extended
        ? [
            {
              interfaceId: '0x87654321' as Hex,
              implementer: account('W2').address,
            },
          ]
        : []),
    ],
  }
}

/** Fresh names and approvals for every configuration; no previous test state is consumed. */
export async function seedConfiguration(c: Configuration) {
  if (process.env.MATRIX_MAX_LEVEL === '3' && c.level === '4LD')
    throw new Error('4LD fixtures are excluded from this campaign')
  const startBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
  const historySeed: {
    name: string
    action: string
    transactionHash: Hex
    blockNumber: bigint
  }[] = []
  const remember = (
    name: string,
    action: string,
    receipt: Awaited<ReturnType<typeof send>>,
  ) =>
    historySeed.push({
      name,
      action,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    })
  const label = `mx-${c.config_id.toLowerCase()}-${randomUUID().slice(0, 8)}`
  const root = `${label}.eth`
  const child = `child.${root}`
  const leaf =
    c.level === '2LD' ? root : c.level === '3LD' ? child : `leaf.${child}`
  const rootOwner = account(c.root_owner)
  const rootManager = account(c.root_manager)
  const leafHolderId = c.name_holder.startsWith('W')
    ? c.name_holder
    : c.name_manager
  const leafHolder = account(leafHolderId)
  const parentHolder =
    c.level === '4LD' ? account(c.parent_controller) : rootOwner
  const native =
    c.root_type === 'Locked' &&
    c.lock !== 'N/A' &&
    !c.lock.startsWith('Not locked') &&
    c.level !== '2LD'
  const recordsFor = (name: string) => recordBundle(`${c.config_id}/${name}`)
  const records = recordsFor(leaf)
  for (const id of [
    'W1',
    'W2',
    'W3',
    'W4',
    'Operator',
    'Resolver delegate',
    'Unrelated',
  ]) {
    if (process.env.MATRIX_PRESERVE_WALLET_CODE !== '1')
      await testClient.setCode({ address: account(id).address, bytecode: '0x' })
    await testClient.setBalance({
      address: account(id).address,
      value: 10n ** 22n,
    })
    await fundTestUsdc(account(id).address)
  }
  // The fixture's explicit operator grant must not be inherited from an earlier
  // configuration using the same local wallet. Names are fresh, but a wrapper
  // operator approval is global rather than per name.
  for (const id of ['W1', 'W2', 'W3', 'W4']) {
    const signer = account(id)
    if (
      await publicClient.readContract({
        address: V1_NAME_WRAPPER,
        abi: wrapperABI,
        functionName: 'isApprovedForAll',
        args: [signer.address, account('Operator').address],
      })
    )
      await send(
        signer,
        V1_NAME_WRAPPER,
        encodeFunctionData({
          abi: wrapperABI,
          functionName: 'setApprovalForAll',
          args: [account('Operator').address, false],
        }),
      )
  }
  await ensureV1ControllersAuthorised()
  await testClient.impersonateAccount({ address: APP_V1_CONTROLLER })
  await testClient.setBalance({ address: APP_V1_CONTROLLER, value: 10n ** 20n })
  try {
    const graceDuration = BigInt(
      process.env.MATRIX_GRACE_REGISTRATION_DURATION ?? '86400',
    )
    await send(
      APP_V1_CONTROLLER,
      V1_BASE_REGISTRAR,
      encodeFunctionData({
        abi: baseABI,
        functionName: 'register',
        args: [
          BigInt(labelhash(label)),
          rootOwner.address,
          c.root_lifecycle === 'Grace' ? graceDuration : 31_536_000n,
        ],
      }),
    )
  } finally {
    await testClient.stopImpersonatingAccount({ address: APP_V1_CONTROLLER })
  }
  if (process.env.MATRIX_HISTORY_RICH === '1') {
    const abi = parseAbi([
      'function rentPrice(string label,uint256 duration) view returns(uint256 base,uint256 premium)',
      'function renew(string label,uint256 duration,bytes32 referrer) payable',
    ])
    const [price] = await publicClient.readContract({
      address: APP_V1_CONTROLLER,
      abi,
      functionName: 'rentPrice',
      args: [label, 86400n],
    })
    remember(
      root,
      'V1 renewal paid by owner before premigration snapshot',
      await send(
        rootOwner,
        APP_V1_CONTROLLER,
        encodeFunctionData({
          abi,
          functionName: 'renew',
          args: [label, 86400n, `0x${'00'.repeat(32)}`],
        }),
        price * 2n + 1n,
      ),
    )
  }
  const expiry = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: baseABI,
    functionName: 'nameExpires',
    args: [BigInt(labelhash(label))],
  })
  // Initial premigration snapshot bonus: 62 days exactly (renewal adds the separate extra second).
  await reserveInV2(label, expiry + 62n * 86_400n)
  // Temporarily wrap roots to build all valid child ownership/expiry arrangements via the wrapper.
  await send(
    rootOwner,
    V1_BASE_REGISTRAR,
    encodeFunctionData({
      abi: baseABI,
      functionName: 'setApprovalForAll',
      args: [V1_NAME_WRAPPER, true],
    }),
  )
  await send(
    rootOwner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: wrapperABI,
      functionName: 'wrapETH2LD',
      args: [
        label,
        rootOwner.address,
        c.root_type === 'Locked' ? 1 : 0,
        V1_PUBLIC_RESOLVER,
      ],
    }),
  )
  const names = [root]
  const seedTime = (await publicClient.getBlock()).timestamp
  const expireChild = c.name_expiry.startsWith('Expired')
  const childExpiry = expireChild ? seedTime + 3600n : expiry + 80n * 86_400n
  if (c.level !== '2LD') {
    await makeV1Subname({
      parentName: label,
      childLabel: 'child',
      ownerAddress: (c.level === '3LD' ? leafHolder : parentHolder).address,
      parentOwnerAccount: rootOwner,
      fuses: native
        ? c.level === '4LD' || c.lock === 'Locked'
          ? 65537
          : 65536
        : 0,
      expiry: c.level === '3LD' ? childExpiry : expiry + 80n * 86_400n,
    })
    names.push(child)
    if (c.level === '4LD') {
      await makeV1Subname({
        parentName: `child.${label}`,
        childLabel: 'leaf',
        ownerAddress: leafHolder.address,
        parentOwnerAccount: parentHolder,
        fuses: native ? (c.lock === 'Locked' ? 65537 : 65536) : 0,
        expiry: childExpiry,
      })
      names.push(leaf)
    }
    if (c.wrapping === 'Unwrapped') {
      const parent = leaf.split('.').slice(1).join('.')
      await send(
        leafHolder,
        V1_NAME_WRAPPER,
        encodeFunctionData({
          abi: wrapperABI,
          functionName: 'unwrap',
          args: [
            namehash(parent),
            labelhash(leaf.split('.')[0]),
            leafHolder.address,
          ],
        }),
      )
    }
    if (c.level === '4LD' && c.parent_type.startsWith('Unwrapped'))
      await send(
        parentHolder,
        V1_NAME_WRAPPER,
        encodeFunctionData({
          abi: wrapperABI,
          functionName: 'unwrap',
          args: [namehash(root), labelhash('child'), parentHolder.address],
        }),
      )
  }
  if (c.root_type === 'Unwrapped')
    await send(
      rootOwner,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: wrapperABI,
        functionName: 'unwrapETH2LD',
        args: [labelhash(label), rootOwner.address, rootManager.address],
      }),
    )

  const holderFor = (name: string) =>
    name === root
      ? c.root_type === 'Unwrapped'
        ? rootManager
        : rootOwner
      : name === leaf
        ? leafHolder
        : parentHolder
  const wrappedFor = (name: string) =>
    name === root
      ? c.root_type !== 'Unwrapped'
      : name === leaf
        ? c.wrapping === 'Wrapped'
        : !c.parent_type.startsWith('Unwrapped')
  for (const name of names)
    await setV1RecordsOn(
      name,
      holderFor(name),
      wrappedFor(name),
      recordsFor(name),
    )
  if (process.env.MATRIX_HISTORY_RICH === '1') {
    // Real historical writes, restored before the test baseline. This seeds
    // activity categories; it does not claim an app-based transfer or renewal.
    const abi = parseAbi([
      'function setText(bytes32 node,string key,string value)',
      'function setResolver(bytes32 node,address resolver)',
      'function setOwner(bytes32 node,address owner)',
      'function transferFrom(address from,address to,uint256 id)',
      'function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)',
    ])
    for (const name of names) {
      const holder = holderFor(name),
        node = namehash(name),
        wrapped = wrappedFor(name)
      const text = recordsFor(name).texts![1].value
      for (const value of [text + ' — historical edit', text])
        remember(
          name,
          'V1 record edit',
          await send(
            holder,
            V1_PUBLIC_RESOLVER,
            encodeFunctionData({
              abi,
              functionName: 'setText',
              args: [node, 'description', value],
            }),
          ),
        )
      for (const resolver of [zeroAddress, V1_PUBLIC_RESOLVER])
        remember(
          name,
          'V1 resolver change',
          await send(
            holder,
            wrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
            encodeFunctionData({
              abi,
              functionName: 'setResolver',
              args: [node, resolver],
            }),
          ),
        )
      const owner = name === root && !wrapped ? rootOwner : holder
      for (const [from, to] of [
        [owner, account('Unrelated')],
        [account('Unrelated'), owner],
      ]) {
        const target = wrapped
          ? V1_NAME_WRAPPER
          : name === root
            ? V1_BASE_REGISTRAR
            : V1_ENS_REGISTRY
        const data = wrapped
          ? encodeFunctionData({
              abi,
              functionName: 'safeTransferFrom',
              args: [from.address, to.address, BigInt(node), 1n, '0x'],
            })
          : name === root
            ? encodeFunctionData({
                abi,
                functionName: 'transferFrom',
                args: [from.address, to.address, BigInt(labelhash(label))],
              })
            : encodeFunctionData({
                abi,
                functionName: 'setOwner',
                args: [node, to.address],
              })
        remember(name, 'V1 holder transfer', await send(from, target, data))
      }
    }
  }
  const targetWrapped = wrappedFor(leaf)
  if (c.level === '2LD' && c.root_type === 'Unwrapped')
    await send(
      rootOwner,
      V1_BASE_REGISTRAR,
      encodeFunctionData({
        abi: baseABI,
        functionName: 'approve',
        args: [account('Operator').address, BigInt(labelhash(label))],
      }),
    )
  else if (targetWrapped)
    await send(
      leafHolder,
      V1_NAME_WRAPPER,
      encodeFunctionData({
        abi: wrapperABI,
        functionName: 'setApprovalForAll',
        args: [account('Operator').address, true],
      }),
    )
  await send(
    holderFor(leaf),
    V1_PUBLIC_RESOLVER,
    encodeFunctionData({
      abi: resolverABI,
      functionName: 'approve',
      args: [namehash(leaf), account('Resolver delegate').address, true],
    }),
  )

  // Save the active fixture evidence before any expiry transition.
  const activeBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
  const advance = async () => {
    let target = expireChild ? childExpiry + 1n : 0n
    if (c.root_lifecycle === 'Grace')
      target =
        expiry + (c.root_lifecycle_version === 'V2' ? 62n * 86_400n : 0n) + 1n
    const latest = await publicClient.getBlock()
    if (target > latest.timestamp) {
      await testClient.setNextBlockTimestamp({ timestamp: target })
      await testClient.mine({ blocks: 1 })
    }
  }
  const metadata = async (): Promise<MockV1Name[]> =>
    Promise.all(
      names.map(async (name) => {
        const wrapped = wrappedFor(name)
        const records = recordsFor(name)
        const data = wrapped
          ? await publicClient.readContract({
              address: V1_NAME_WRAPPER,
              abi: wrapperABI,
              functionName: 'getData',
              args: [BigInt(namehash(name))],
            })
          : undefined
        const owner = wrapped
          ? data![0]
          : await publicClient.readContract({
              address: V1_ENS_REGISTRY,
              abi: registryABI,
              functionName: 'owner',
              args: [namehash(name)],
            })
        return {
          name,
          ownerAddress: owner,
          registrantAddress: name === root ? rootOwner.address : undefined,
          type: wrapped ? (data![1] & 1 ? 'locked' : 'wrapped') : 'unwrapped',
          fullFuses: data?.[1],
          wrapperExpiry: data ? Number(data[2]) : undefined,
          expiryDate:
            name === root
              ? Number(
                  await publicClient.readContract({
                    address: V1_BASE_REGISTRAR,
                    abi: parseAbi([
                      'function nameExpires(uint256 id) view returns(uint256)',
                    ]),
                    functionName: 'nameExpires',
                    args: [BigInt(labelhash(label))],
                  }),
                )
              : undefined,
          resolver: V1_PUBLIC_RESOLVER,
          records: {
            texts: [...records.texts!],
            addresses: [...records.addresses!],
            contentHash: records.contenthash,
            abiContentTypes: records.abis?.map((a) => a.contentType),
            interfaceIds: records.interfaces?.map((i) => i.interfaceId),
          },
        }
      }),
    )
  return {
    c,
    root,
    leaf,
    names,
    label,
    records,
    recordsFor,
    expiry,
    startBlock,
    activeBlock,
    metadata,
    holderFor,
    wrappedFor,
    native,
    advance,
    historySeed,
  }
}

/** Protocol-only ancestor setup, explicitly separate from the app migration being tested. */
export async function migrateLockedAncestor(
  name: string,
  owner: ReturnType<typeof account>,
) {
  await send(
    owner,
    V1_NAME_WRAPPER,
    encodeFunctionData({
      abi: wrapperABI,
      functionName: 'setApprovalForAll',
      args: [contracts.ensMigrationHelper.address, true],
    }),
  )
  const data = {
    label: name.split('.')[0],
    owner: owner.address,
    subregistry: zeroAddress,
    resolver: contracts.ensPublicResolver.address,
  }
  const args =
    name.split('.').length === 2
      ? [[], [], [[data]], []]
      : [
          [],
          [],
          [],
          [
            {
              parentName: dnsEncode(name.split('.').slice(1).join('.')),
              groups: [[data]],
            },
          ],
        ]
  return send(
    owner,
    contracts.ensMigrationHelper.address,
    encodeFunctionData({
      abi: migrationHelperMigrateSnippet,
      functionName: 'migrate',
      args: args as never,
    }),
  )
}
