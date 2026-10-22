import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ethRegistrarCommitmentMadeEventSnippet,
  ethRegistrarMakeCommitmentSnippet,
  ethRegistrarNameRegisteredEventSnippet,
  ethRegistrarNameRenewedEventSnippet,
  ethRegistrarRegisterSnippet,
} from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  type Hex,
  parseAbiParameters,
  toEventSelector,
  zeroAddress,
  zeroHash,
} from 'viem'
import {
  type EventLog,
  expectedReferrer,
  main,
  registrationInputs,
  verifyCommitment,
  verifyRecordedReferrers,
} from './referrer-qa'

const REGISTRAR = '0x1111111111111111111111111111111111111111'
const OWNER = '0x2222222222222222222222222222222222222222'
const RESOLVER = '0x3333333333333333333333333333333333333333'
const TOKEN = '0x4444444444444444444444444444444444444444'
const REFERRER = `0x${'0'.repeat(60)}1234` as const
const COMMITMENT = `0x${'ab'.repeat(32)}` as const
const SECRET = `0x${'cd'.repeat(32)}` as const
const TX = `0x${'01'.repeat(32)}`
const COMMIT_TX = `0x${'02'.repeat(32)}`
const DURATION = 31_536_000n

function registered(referrer: Hex = REFERRER): EventLog {
  return {
    address: REGISTRAR,
    topics: encodeEventTopics({
      abi: [ethRegistrarNameRegisteredEventSnippet],
      eventName: 'NameRegistered',
      args: { tokenId: 1n, referrer },
    }) as Hex[],
    data: encodeAbiParameters(
      parseAbiParameters(
        'string,address,address,address,uint64,address,uint256,uint256',
      ),
      ['alice', OWNER, zeroAddress, RESOLVER, DURATION, TOKEN, 1n, 0n],
    ),
  }
}
function renewed(label: string, referrer: Hex = REFERRER): EventLog {
  return {
    address: REGISTRAR,
    topics: encodeEventTopics({
      abi: [ethRegistrarNameRenewedEventSnippet],
      eventName: 'NameRenewed',
      args: { tokenId: 1n, referrer },
    }) as Hex[],
    data: encodeAbiParameters(
      parseAbiParameters('string,uint64,uint64,address,uint256'),
      [label, DURATION, 2_000_000_000n, TOKEN, 1n],
    ),
  }
}
const revealInput = encodeFunctionData({
  abi: ethRegistrarRegisterSnippet,
  functionName: 'register',
  args: [
    'alice',
    OWNER,
    SECRET,
    zeroAddress,
    RESOLVER,
    DURATION,
    TOKEN,
    REFERRER,
  ],
})
const commitmentData = encodeFunctionData({
  abi: ethRegistrarMakeCommitmentSnippet,
  functionName: 'makeCommitment',
  args: ['alice', OWNER, SECRET, zeroAddress, RESOLVER, DURATION, REFERRER],
})
const commitmentLog: EventLog = {
  address: REGISTRAR,
  topics: [toEventSelector(ethRegistrarCommitmentMadeEventSnippet)],
  data: encodeAbiParameters(parseAbiParameters('bytes32'), [COMMITMENT]),
}

function rpcReceipt(
  logs: readonly EventLog[],
  blockNumber = '0xa',
  status = '0x1',
): object {
  return { status, blockNumber, transactionIndex: '0x0', logs }
}

test('normalizes independent expected values, including odd hex and invalid input', () => {
  assert.equal(expectedReferrer('0x1234'), REFERRER)
  assert.equal(expectedReferrer('0xF'), `0x${'0'.repeat(63)}f`)
  for (const input of [undefined, '0x', 'invalid', `0x${'1'.repeat(65)}`])
    assert.equal(expectedReferrer(input), zeroHash)
})
test('checks every named event, not just one occurrence of the referrer bytes', () => {
  const params: Parameters<typeof verifyRecordedReferrers>[0] = {
    logs: [renewed('alice'), renewed('bob')],
    contract: REGISTRAR,
    kind: 'renewal' as const,
    names: ['alice.eth', 'bob.eth'],
    expected: REFERRER,
  }
  assert.equal(verifyRecordedReferrers(params).length, 2)
  assert.throws(
    () =>
      verifyRecordedReferrers({
        ...params,
        logs: [renewed('alice'), renewed('bob', zeroHash)],
      }),
    /mismatch/,
  )
  assert.throws(
    () => verifyRecordedReferrers({ ...params, names: ['alice.eth'] }),
    /Expected 1/,
  )
  assert.throws(
    () =>
      verifyRecordedReferrers({ ...params, names: ['alice.eth', 'alice.eth'] }),
    /unique/,
  )
  assert.throws(
    () => verifyRecordedReferrers({ ...params, contract: OWNER }),
    /found 0/,
  )
})
test('requires the expected label and event kind from the specified contract', () => {
  const params: Parameters<typeof verifyRecordedReferrers>[0] = {
    logs: [registered()],
    contract: REGISTRAR,
    kind: 'registration' as const,
    names: ['alice.eth'],
    expected: REFERRER,
  }
  assert.equal(verifyRecordedReferrers(params).length, 1)
  assert.throws(
    () => verifyRecordedReferrers({ ...params, names: ['bob.eth'] }),
    /bob.eth/,
  )
  assert.throws(
    () => verifyRecordedReferrers({ ...params, kind: 'renewal' }),
    /found 0/,
  )
  assert.throws(
    () => verifyRecordedReferrers({ ...params, logs: [] }),
    /found 0/,
  )
})
test('finds nested register calls and ignores an entirely reverted subtree', () => {
  const call = { to: REGISTRAR, input: revealInput }
  assert.deepEqual(
    registrationInputs(
      { to: OWNER, calls: [call, { error: 'reverted', calls: [call] }] },
      REGISTRAR,
    ),
    [revealInput],
  )
  assert.deepEqual(
    registrationInputs({ error: 'reverted', calls: [call] }, REGISTRAR),
    [],
  )
})

for (const nested of [false, true]) {
  test(`CLI verifies a successful ${nested ? 'nested HCA' : 'direct EOA'} registration and its commitment using only read RPCs`, async (t) => {
    const previous = process.env.QA_RPC_URL
    process.env.QA_RPC_URL = 'https://rpc.invalid/private-endpoint'
    t.after(() => {
      if (previous === undefined) delete process.env.QA_RPC_URL
      else process.env.QA_RPC_URL = previous
    })
    const output: string[] = []
    t.mock.method(console, 'log', (value: string) => {
      output.push(value)
    })
    const methods: string[] = []
    t.mock.method(
      globalThis,
      'fetch',
      async (_input: unknown, init?: RequestInit): Promise<Response> => {
        const { method, params } = JSON.parse(String(init?.body))
        methods.push(method)
        const result = (() => {
          switch (method) {
            case 'eth_chainId':
              return '0xaa36a7'
            case 'eth_getTransactionReceipt':
              return params[0] === COMMIT_TX
                ? rpcReceipt([commitmentLog], '0x9')
                : rpcReceipt([
                    registered(),
                    { address: OWNER, topics: [], data: '0x' },
                  ])
            case 'eth_getTransactionByHash':
              return {
                to: nested ? OWNER : REGISTRAR,
                input: nested ? '0x' : revealInput,
              }
            case 'debug_traceTransaction':
              return {
                to: OWNER,
                calls: [{ to: REGISTRAR, input: revealInput }],
              }
            case 'eth_call':
              assert.equal(params[0].data, commitmentData)
              assert.equal(params[1], '0xa')
              return COMMITMENT
            default:
              throw new Error(`Unexpected RPC method: ${method}`)
          }
        })()
        return Response.json({ jsonrpc: '2.0', id: 1, result })
      },
    )
    await main([
      '--chain-id',
      '11155111',
      '--contract',
      REGISTRAR,
      '--tx',
      TX,
      '--kind',
      'registration',
      '--names',
      'alice.eth',
      '--referrer',
      '0x1234',
      '--commit-tx',
      COMMIT_TX,
    ])
    assert(output.some((line) => line.includes('Commitment matches')))
    assert(output.at(-1)?.startsWith('PASS:'))
    assert.equal(methods.includes('debug_traceTransaction'), nested)
  })
}

test('CLI refuses reverted transactions and wrong networks', async (t) => {
  const previous = process.env.QA_RPC_URL
  process.env.QA_RPC_URL = 'https://rpc.invalid'
  t.after(() => {
    if (previous === undefined) delete process.env.QA_RPC_URL
    else process.env.QA_RPC_URL = previous
  })
  let chain = '0x1'
  t.mock.method(
    globalThis,
    'fetch',
    async (_input: unknown, init?: RequestInit): Promise<Response> => {
      const { method } = JSON.parse(String(init?.body))
      return Response.json({
        result:
          method === 'eth_chainId'
            ? chain
            : rpcReceipt([registered()], '0xa', '0x0'),
      })
    },
  )
  const args = [
    '--chain-id',
    '11155111',
    '--contract',
    REGISTRAR,
    '--tx',
    TX,
    '--kind',
    'registration',
    '--names',
    'alice.eth',
    '--referrer',
    '0x1234',
  ]
  await assert.rejects(main(args), /chain ID/)
  chain = '0xaa36a7'
  await assert.rejects(main(args), /reverted/)
})

test('commitment verification fails for a wrong commit, late commit, or changed referrer', async () => {
  const reveal = {
    blockNumber: '0xa' as const,
    transactionIndex: '0x0' as const,
    logs: [registered()],
  }
  const commit = {
    blockNumber: '0x9' as const,
    transactionIndex: '0x0' as const,
    logs: [commitmentLog],
  }
  const params: Parameters<typeof verifyCommitment>[0] = {
    rpc: async () => COMMITMENT,
    reveal,
    commit,
    contract: REGISTRAR,
    input: revealInput,
    name: 'alice.eth',
    expected: REFERRER,
  }
  assert.equal(await verifyCommitment(params), COMMITMENT)
  await assert.rejects(
    verifyCommitment({ ...params, rpc: async () => zeroHash }),
    /does not match/,
  )
  await assert.rejects(
    verifyCommitment({ ...params, commit: { ...commit, blockNumber: '0xb' } }),
    /precede/,
  )
  await assert.rejects(
    verifyCommitment({ ...params, expected: zeroHash }),
    /different name or referrer/,
  )
})
