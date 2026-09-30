import {
  createFlowScope,
  scopeTransactionId,
} from '@ens-apps/transaction-manager'
import { computeResolverResource } from '@ensdomains/ensjs/utils/v2'
import {
  permissionedResolverRevokeRolesSnippet,
  permissionedResolverRevokeRootRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import {
  type Address,
  decodeFunctionData,
  type Hex,
  type WalletClient,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { IntentContext } from '@/features/transaction-manager/types'
import { ROOT_RESOURCE } from '@/lib/roles/resolverRoles'
import {
  buildResolverRolesTransactions,
  removeResolverUserTxId,
  SAVE_RESOLVER_ROLES_TX_ID,
} from './buildResolverRolesTransactions'

const resolverAddress = '0x1111111111111111111111111111111111111111' as Address
const account = '0x3333333333333333333333333333333333333333' as Address
const avatar = computeResolverResource({ kind: 'text', key: 'avatar' })

const ctx = {
  walletClient: {
    account: { address: '0x2222222222222222222222222222222222222222' },
    chain: { id: 11155111 },
  } as unknown as WalletClient,
  chainId: 11155111,
} as IntentContext

const makeHandlers = () => ({
  save: vi.fn(),
  revoke: vi.fn(),
  done: vi.fn(),
})

const decodeRevoke = (data: Hex | undefined) =>
  decodeFunctionData({
    abi: [
      ...permissionedResolverRevokeRootRolesSnippet,
      ...permissionedResolverRevokeRolesSnippet,
    ],
    data: data ?? '0x',
  })

const requestData = (step: {
  intent?: { prepare?: (c: IntentContext) => unknown }
}) => {
  const intent = step.intent?.prepare?.(ctx) as
    | { request: { data?: Hex } }
    | undefined
  return intent?.request.data
}

describe('buildResolverRolesTransactions', () => {
  it('has no steps while nothing is pending', () => {
    expect(
      buildResolverRolesTransactions(
        null,
        resolverAddress,
        makeHandlers(),
        null,
      ),
    ).toEqual([])
  })

  it('names the account and scope a save writes to', () => {
    const handlers = makeHandlers()
    const save = {
      type: 'save',
      resource: ROOT_RESOURCE,
      resourceLabel: 'All names',
      account,
      rolesToGrant: ['ROLE_SET_TEXT'],
      rolesToRevoke: [],
    } as const

    const [step, ...rest] = buildResolverRolesTransactions(
      save,
      resolverAddress,
      handlers,
      null,
    )

    expect(rest).toHaveLength(0)
    expect(step?.id).toBe(SAVE_RESOLVER_ROLES_TX_ID)
    expect(step?.transactionName).toBe(
      `Update roles for ${account} on All names`,
    )
    step?.onStart()
    expect(handlers.save).toHaveBeenCalledWith(save, SAVE_RESOLVER_ROLES_TX_ID)
    step?.onDone()
    expect(handlers.done).toHaveBeenCalledOnce()
  })

  // Immunefi #92605 / #92820: removal has to reach every resource, root
  // included, not only the row the sidebar was opened on.
  it('revokes each resource in its own chained step', () => {
    const handlers = makeHandlers()
    const root = {
      resource: ROOT_RESOURCE,
      resourceLabel: 'All names',
      roles: ['ROLE_SET_ADDRESS', 'ROLE_UPGRADE'],
    } as const
    const scoped = {
      resource: avatar,
      resourceLabel: 'text "avatar"',
      roles: ['ROLE_SET_TEXT'],
    } as const

    const steps = buildResolverRolesTransactions(
      { type: 'remove', account, revocations: [root, scoped] },
      resolverAddress,
      handlers,
      null,
    )

    expect(steps.map((step) => step.id)).toEqual([
      removeResolverUserTxId(account, ROOT_RESOURCE),
      removeResolverUserTxId(account, avatar),
    ])
    expect(steps.map((step) => step.title)).toEqual([
      'Remove roles on All names',
      'Remove roles on text "avatar"',
    ])

    // Each step's gas estimate is for its own resource.
    expect(decodeRevoke(requestData(steps[0] ?? {})).functionName).toBe(
      'revokeRootRoles',
    )
    expect(decodeRevoke(requestData(steps[1] ?? {}))).toMatchObject({
      functionName: 'revokeRoles',
      args: [avatar, expect.any(BigInt), account],
    })

    steps[0]?.onStart()
    expect(handlers.revoke).toHaveBeenLastCalledWith({
      account,
      revocation: root,
      id: removeResolverUserTxId(account, ROOT_RESOURCE),
    })

    // The first step finishing starts the second, not the end of the flow.
    steps[0]?.onDone()
    expect(handlers.revoke).toHaveBeenLastCalledWith({
      account,
      revocation: scoped,
      id: removeResolverUserTxId(account, avatar),
    })
    expect(handlers.done).not.toHaveBeenCalled()

    steps[1]?.onDone()
    expect(handlers.done).toHaveBeenCalledOnce()
  })

  // A finished actor stays in the manager under its id, so a second save or
  // removal in the same session with fixed ids would be matched to the first
  // one's receipt and never reach the wallet.
  it('names every step after the attempt, and passes that id on', () => {
    const scope = createFlowScope(account)
    const handlers = makeHandlers()
    const save = {
      type: 'save',
      resource: ROOT_RESOURCE,
      resourceLabel: 'All names',
      account,
      rolesToGrant: ['ROLE_SET_TEXT'],
      rolesToRevoke: [],
    } as const

    const [saveStep] = buildResolverRolesTransactions(
      save,
      resolverAddress,
      handlers,
      scope,
    )
    const saveId = scopeTransactionId(SAVE_RESOLVER_ROLES_TX_ID, scope)
    expect(saveStep?.id).toBe(saveId)
    saveStep?.onStart()
    expect(handlers.save).toHaveBeenCalledWith(save, saveId)

    const [removeStep] = buildResolverRolesTransactions(
      {
        type: 'remove',
        account,
        revocations: [
          {
            resource: ROOT_RESOURCE,
            resourceLabel: 'All names',
            roles: ['ROLE_SET_TEXT'],
          },
        ],
      },
      resolverAddress,
      handlers,
      scope,
    )
    const removeId = scopeTransactionId(
      removeResolverUserTxId(account, ROOT_RESOURCE),
      scope,
    )
    expect(removeStep?.id).toBe(removeId)
    removeStep?.onStart()
    expect(handlers.revoke).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: removeId }),
    )

    // A new attempt gets different ids.
    const [again] = buildResolverRolesTransactions(
      save,
      resolverAddress,
      handlers,
      createFlowScope(account),
    )
    expect(again?.id).not.toBe(saveId)
  })
})
