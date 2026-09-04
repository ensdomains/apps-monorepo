import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  decodeFunctionData,
  getAddress,
  labelhash,
  namehash,
  parseAbi,
} from 'viem'
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
      ]),
      data: intent.request.data ?? '0x',
    }),
  }
}

describe('buildTransferStepIntent (v1)', () => {
  it('reclaims on the BaseRegistrar for the recipient', () => {
    expect(call(buildTransferStepIntent('reclaim', ctx))).toEqual({
      to: REGISTRAR,
      functionName: 'reclaim',
      args: [BigInt(labelhash('alice')), RECIPIENT],
    })
  })

  it('moves the 721 from the sender to the recipient', () => {
    const { to, functionName, args } = call(
      buildTransferStepIntent('transfer-erc721', ctx),
    )
    expect(to).toBe(REGISTRAR)
    expect(functionName).toBe('safeTransferFrom')
    expect(args?.slice(0, 2)).toEqual([ME, RECIPIENT])
  })

  it('moves a wrapped name on the NameWrapper by namehash', () => {
    const intent = buildTransferStepIntent('transfer-erc1155', {
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
    })
    expect(call(intent)).toEqual({
      to: NAME_WRAPPER,
      functionName: 'safeTransferFrom',
      args: [ME, RECIPIENT, BigInt(namehash('alice.eth')), 1n, '0x'],
    })
  })

  // The ensjs `ensRegistry` key is the V2 root on Sepolia; V1 registry writes
  // must hit the legacy registry.
  it('sets the owner on the legacy registry, not the V2 root', () => {
    const intent = buildTransferStepIntent('set-registry-owner', {
      ...ctx,
      name: 'sub.alice.eth',
      subject: { kind: 'v1-registry', owner: ME },
    })
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
    expect(call(buildTransferStepIntent('detach-resolver', ctx))).toMatchObject(
      { to: LEGACY_REGISTRY, functionName: 'setResolver' },
    )
  })

  it('writes the ETH record on the name’s own resolver', () => {
    expect(call(buildTransferStepIntent('set-eth-addr', ctx))).toMatchObject({
      to: RESOLVER,
      functionName: 'setAddr',
    })
  })

  it('refuses the ETH step when the name has no resolver of its own', () => {
    expect(() =>
      buildTransferStepIntent('set-eth-addr', {
        ...ctx,
        resolverAddress: null,
      }),
    ).toThrow(/no resolver/)
  })

  it('refuses a step the plan should never produce for the subject', () => {
    expect(() => buildTransferStepIntent('transfer-erc1155', ctx)).toThrow(
      /does not apply/,
    )
  })
})
