import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  encodeRoleBitmap,
  labelToCanonicalId,
} from '@ensdomains/ensjs/utils/v2'
import {
  decodeFunctionData,
  getAddress,
  labelhash,
  namehash,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { WalletClientWithAccount } from '@/utils/types'
import type { V1TransferSubject } from '../types'
import { buildTransferStepIntent } from './buildTransferStepIntent'

// Checksummed: viem decodes calldata to checksummed addresses, and the address
// encoder behind `setAddr` rejects a non-checksummed mixed-case input.
const ME = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const RECIPIENT = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
const RESOLVER = getAddress('0x3333333333333333333333333333333333333333')
const OTHER = getAddress('0xcccccccccccccccccccccccccccccccccccccccc')

const REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensBaseRegistrarImplementation',
})
const NAME_WRAPPER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensNameWrapper',
})
const LEGACY_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

const registrar: V1TransferSubject = {
  kind: 'v1-registrar',
  registrant: ME,
  controller: ME,
}

const ctx = {
  name: 'alice.eth',
  subject: registrar,
  recipient: RECIPIENT,
  tokenId: null,
  resolverAddress: RESOLVER,
  isPermissionedResolver: false,
  previousEthAddress: null,
  walletClient: { account: { address: ME } } as WalletClientWithAccount,
  chainId: sepoliaWithEns.id,
}

/** The EOA call an intent would send: its target and decoded calldata. */
const call = (intent: CustomTransactionIntent) => {
  if (intent.request.type !== 'eoa') throw new Error('expected an EOA request')
  return {
    to: intent.request.to,
    ...decodeFunctionData({
      abi: parseAbi([
        'function reclaim(uint256 id, address owner)',
        'function safeTransferFrom(address from, address to, uint256 tokenId)',
        'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
        'function setOwner(bytes32 node, address owner)',
        'function setResolver(bytes32 node, address resolver)',
        'function setAddr(bytes32 node, uint256 coinType, bytes a)',
        'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
        'function setSubnodeOwner(bytes32 parentNode, string label, address owner, uint32 fuses, uint64 expiry)',
        'function setSubnodeOwner(bytes32 node, bytes32 label, address owner)',
        'function revokeRoles(uint256 resource, uint256 roleBitmap, address account)',
      ]),
      data: intent.request.data ?? '0x',
    }),
  }
}

describe('buildTransferStepIntent (v1)', () => {
  it('reclaims on the BaseRegistrar for the recipient', () => {
    expect(call(buildTransferStepIntent({ kind: 'reclaim' }, ctx))).toEqual({
      to: REGISTRAR,
      functionName: 'reclaim',
      args: [BigInt(labelhash('alice')), RECIPIENT],
    })
  })

  it('moves the 721 from the sender to the recipient', () => {
    const { to, functionName, args } = call(
      buildTransferStepIntent({ kind: 'transfer-erc721' }, ctx),
    )
    expect(to).toBe(REGISTRAR)
    expect(functionName).toBe('safeTransferFrom')
    expect(args?.slice(0, 2)).toEqual([ME, RECIPIENT])
  })

  it('moves a wrapped name on the NameWrapper by namehash', () => {
    const intent = buildTransferStepIntent(
      { kind: 'transfer-erc1155' },
      {
        ...ctx,
        subject: {
          kind: 'v1-wrapped',
          owner: ME,
          fuses: {
            cannotTransfer: false,
            cannotSetResolver: false,
            cannotUnwrap: false,
            parentCannotControl: true,
          },
          expiry: null,
        },
      },
    )
    expect(call(intent)).toEqual({
      to: NAME_WRAPPER,
      functionName: 'safeTransferFrom',
      args: [ME, RECIPIENT, BigInt(namehash('alice.eth')), 1n, '0x'],
    })
  })

  // The ensjs `ensRegistry` key is the V2 root on Sepolia; V1 registry writes
  // must hit the legacy registry.
  it('sets the owner on the legacy registry, not the V2 root', () => {
    const intent = buildTransferStepIntent(
      { kind: 'set-registry-owner' },
      {
        ...ctx,
        name: 'sub.alice.eth',
        subject: { kind: 'v1-registry', owner: ME },
      },
    )
    expect(LEGACY_REGISTRY).not.toBe(
      getChainContractAddress({
        chain: sepoliaWithEns,
        contract: 'ensRegistry',
      }),
    )
    expect(call(intent)).toEqual({
      to: LEGACY_REGISTRY,
      functionName: 'setOwner',
      args: [namehash('sub.alice.eth'), RECIPIENT],
    })
  })

  it('detaches an unwrapped name’s resolver on the legacy registry', () => {
    expect(
      call(buildTransferStepIntent({ kind: 'detach-resolver' }, ctx)),
    ).toMatchObject({ to: LEGACY_REGISTRY, functionName: 'setResolver' })
  })

  // A wrapped name's registry slot is owned by the NameWrapper, so the same
  // `setResolver` must go through the wrapper: on the registry it reverts.
  it('detaches a wrapped name’s resolver through the NameWrapper', () => {
    const intent = buildTransferStepIntent(
      { kind: 'detach-resolver' },
      {
        ...ctx,
        subject: {
          kind: 'v1-wrapped',
          owner: ME,
          fuses: {
            cannotTransfer: false,
            cannotSetResolver: false,
            cannotUnwrap: false,
            parentCannotControl: false,
          },
          expiry: null,
        },
      },
    )
    expect(call(intent)).toEqual({
      to: NAME_WRAPPER,
      functionName: 'setResolver',
      args: [namehash('alice.eth'), zeroAddress],
    })
  })

  it('writes the ETH record on the name’s own resolver', () => {
    expect(
      call(buildTransferStepIntent({ kind: 'set-eth-addr' }, ctx)),
    ).toMatchObject({
      to: RESOLVER,
      functionName: 'setAddr',
    })
  })

  // The V2 setter takes the DNS-encoded name; `setAddr(node, ...)` hits the
  // PermissionedResolver's fallback and reverts with empty data.
  it('writes the ETH record by name on a V2 PermissionedResolver', () => {
    expect(
      call(
        buildTransferStepIntent(
          { kind: 'set-eth-addr' },
          {
            ...ctx,
            isPermissionedResolver: true,
          },
        ),
      ),
    ).toEqual({
      to: RESOLVER,
      functionName: 'setAddress',
      args: [toHex(packetToBytes('alice.eth')), 60n, RECIPIENT.toLowerCase()],
    })
  })

  it('refuses the ETH step when the name has no resolver of its own', () => {
    expect(() =>
      buildTransferStepIntent(
        { kind: 'set-eth-addr' },
        {
          ...ctx,
          resolverAddress: null,
        },
      ),
    ).toThrow(/no resolver/)
  })

  it('refuses the ETH step when the resolver kind was never read', () => {
    expect(() =>
      buildTransferStepIntent(
        { kind: 'set-eth-addr' },
        {
          ...ctx,
          isPermissionedResolver: null,
        },
      ),
    ).toThrow(/what kind of resolver/)
  })

  // Recovery after a move that failed once the record had already landed.
  it('puts the ETH record back to what it was before the flow', () => {
    expect(
      call(
        buildTransferStepIntent(
          { kind: 'restore-eth-addr' },
          {
            ...ctx,
            isPermissionedResolver: true,
            previousEthAddress: ME,
          },
        ),
      ),
    ).toEqual({
      to: RESOLVER,
      functionName: 'setAddress',
      args: [toHex(packetToBytes('alice.eth')), 60n, ME.toLowerCase()],
    })
  })

  it('refuses to restore when there was no ETH record to restore', () => {
    expect(() =>
      buildTransferStepIntent({ kind: 'restore-eth-addr' }, ctx),
    ).toThrow(/no ETH address to restore/)
  })

  it('refuses a step the plan should never produce for the subject', () => {
    expect(() =>
      buildTransferStepIntent({ kind: 'transfer-erc1155' }, ctx),
    ).toThrow(/does not apply/)
  })

  // Same call the legacy app sends: zero fuses and expiry keep the subname's
  // own (`_updateName` ORs fuses; `_normaliseExpiry` never lowers expiry).
  it('reassigns a wrapped subname on the NameWrapper by parent node and label', () => {
    const intent = buildTransferStepIntent(
      { kind: 'set-subnode-owner' },
      {
        ...ctx,
        name: 'sub.alice.eth',
        subject: {
          kind: 'v1-wrapped',
          owner: OTHER,
          fuses: {
            cannotTransfer: false,
            cannotSetResolver: false,
            cannotUnwrap: false,
            parentCannotControl: false,
          },
          expiry: null,
        },
      },
    )
    expect(call(intent)).toEqual({
      to: NAME_WRAPPER,
      functionName: 'setSubnodeOwner',
      args: [namehash('alice.eth'), 'sub', RECIPIENT, 0, 0n],
    })
  })

  it('reassigns an unwrapped subname on the legacy registry by labelhash', () => {
    const intent = buildTransferStepIntent(
      { kind: 'set-subnode-owner' },
      {
        ...ctx,
        name: 'sub.alice.eth',
        subject: { kind: 'v1-registry', owner: OTHER },
      },
    )
    expect(call(intent)).toEqual({
      to: LEGACY_REGISTRY,
      functionName: 'setSubnodeOwner',
      args: [namehash('alice.eth'), labelhash('sub'), RECIPIENT],
    })
  })

  it('refuses the parent step for a 2LD, which has no parent to act', () => {
    expect(() =>
      buildTransferStepIntent({ kind: 'set-subnode-owner' }, ctx),
    ).toThrow(/does not apply/)
  })
})

describe('buildTransferStepIntent (role revocations)', () => {
  const REGISTRY = getAddress('0xdddddddddddddddddddddddddddddddddddddddd')
  const DELEGATE = getAddress('0x1111111111111111111111111111111111111111')

  const v2ctx = {
    ...ctx,
    subject: { kind: 'v2', registryAddress: REGISTRY } as const,
    walletClient: {
      account: { address: ME },
      chain: sepoliaWithEns,
    } as unknown as WalletClientWithAccount,
  }

  it('revokes the named account’s roles on the name’s own resource', () => {
    const { to, functionName, args } = call(
      buildTransferStepIntent(
        {
          kind: 'revoke-roles',
          grant: { account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] },
        },
        v2ctx,
      ),
    )

    expect(to).toBe(REGISTRY)
    expect(functionName).toBe('revokeRoles')
    expect(args?.[0]).toBe(labelToCanonicalId('alice'))
    expect(args?.[1]).toBe(encodeRoleBitmap(['ROLE_SET_RESOLVER']))
    expect(args?.[2]).toBe(DELEGATE)
  })

  // A V1 name has no EAC resource, so there is nothing the call could name.
  it('refuses a revoke for a v1 subject', () => {
    expect(() =>
      buildTransferStepIntent(
        {
          kind: 'revoke-roles',
          grant: { account: DELEGATE, roles: ['ROLE_SET_RESOLVER'] },
        },
        ctx,
      ),
    ).toThrow(/does not apply to a v1-registrar name/)
  })
})
