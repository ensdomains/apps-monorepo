/**
 * A local CCIP-Read (EIP-3668) gateway for `TestOffchainResolver`.
 *
 * The browser fetches it directly (viem follows `OffchainLookup` client-side),
 * so a spec controls exactly what an offchain resolver's provider answers:
 * records per name, plus the failures that broke offchain profiles in
 * production (#1575) — a batch URL rejected for its length (Namespace answers
 * ~4.2k-char GETs with a 500), a blanket 429/503, and individual keys that
 * fail. Every request is logged so a spec can bound the request count.
 *
 * URL template: `http://127.0.0.1:<port>/{sender}/{data}.json` (GET, as
 * Namespace uses). POST `{ sender, data }` to `/` is accepted too.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  type Hex,
  hexToBytes,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'

const RESOLVE_ABI = parseAbi([
  'function resolve(bytes name, bytes data) view returns (bytes)',
])

const RECORD_ABI = parseAbi([
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node) view returns (address)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function contenthash(bytes32 node) view returns (bytes)',
  'function ABI(bytes32 node, uint256 contentTypes) view returns (uint256, bytes)',
  'function name(bytes32 node) view returns (string)',
  'function multicall(bytes[] data) returns (bytes[] results)',
])

const ETH_COIN_TYPE = 60n

export type OffchainRecords = {
  texts?: Record<string, string>
  /** Coin type → raw address bytes (EVM coins: the 20-byte address). */
  coins?: Record<number, Hex>
  contenthash?: Hex
}

export type GatewayFaults = {
  /** A request URL longer than this gets a 500, like Namespace's batch limit. */
  maxUrlLength?: number
  /** Answer every request with this status (429, 503, 500…). */
  status?: number
  /** Text keys whose reads fail with a 500 — alone or inside a batch. */
  failKeys?: readonly string[]
}

export type GatewayRequest = {
  method: string
  urlLength: number
  status: number
  /** The read was a `multicall` batch rather than a single record. */
  isBatch: boolean
  /** Records asked for, e.g. `text:avatar`, `addr:60`, `contenthash`. */
  keys: string[]
}

export type CcipGateway = {
  /** The URL template to deploy `TestOffchainResolver` with. */
  url: string
  setRecords: (name: string, records: OffchainRecords) => void
  configure: (faults: GatewayFaults) => void
  /** Clears faults and the request log; records are kept. */
  reset: () => void
  requests: () => readonly GatewayRequest[]
  close: () => Promise<void>
}

/**
 * Records read per gateway request. A client that reads one record per
 * request (the pre-#1571 behaviour) scores 1.
 */
export const keysPerRequest = (requests: readonly GatewayRequest[]): number =>
  requests.length === 0
    ? 0
    : requests.reduce((sum, request) => sum + request.keys.length, 0) /
      requests.length

class GatewayFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Decodes a DNS wire-format name (`\x05alice\x03eth\x00`). */
const dnsDecode = (encoded: Hex): string => {
  const bytes = hexToBytes(encoded)
  const labels: string[] = []
  let offset = 0
  while (offset < bytes.length && bytes[offset] !== 0) {
    const length = bytes[offset]
    labels.push(
      new TextDecoder().decode(bytes.slice(offset + 1, offset + 1 + length)),
    )
    offset += length + 1
  }
  return labels.join('.')
}

const keysOf = (data: Hex): string[] => {
  const call = decodeFunctionData({ abi: RECORD_ABI, data })
  switch (call.functionName) {
    case 'multicall':
      return call.args[0].flatMap(keysOf)
    case 'text':
      return [`text:${call.args[1]}`]
    case 'addr':
      return [`addr:${call.args.length === 2 ? call.args[1] : ETH_COIN_TYPE}`]
    default:
      return [call.functionName]
  }
}

const answer = (
  data: Hex,
  records: OffchainRecords,
  node: Hex,
  failKeys: ReadonlySet<string>,
): Hex => {
  const call = decodeFunctionData({ abi: RECORD_ABI, data })
  if (call.functionName !== 'multicall' && call.args[0] !== node)
    throw new GatewayFailure(400, 'node does not match the resolved name')
  switch (call.functionName) {
    case 'multicall':
      return encodeFunctionResult({
        abi: RECORD_ABI,
        functionName: 'multicall',
        result: call.args[0].map((inner) =>
          answer(inner, records, node, failKeys),
        ),
      })
    case 'text': {
      if (failKeys.has(call.args[1]))
        throw new GatewayFailure(500, `text ${call.args[1]} failed`)
      return encodeAbiParameters(
        [{ type: 'string' }],
        [records.texts?.[call.args[1]] ?? ''],
      )
    }
    case 'addr': {
      const coinType = call.args.length === 2 ? call.args[1] : ETH_COIN_TYPE
      const value = records.coins?.[Number(coinType)] ?? '0x'
      if (call.args.length === 2)
        return encodeAbiParameters([{ type: 'bytes' }], [value])
      return encodeAbiParameters(
        [{ type: 'address' }],
        [value === '0x' ? zeroAddress : (value as Address)],
      )
    }
    case 'contenthash':
      return encodeAbiParameters(
        [{ type: 'bytes' }],
        [records.contenthash ?? '0x'],
      )
    case 'ABI':
      return encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'bytes' }],
        [0n, '0x'],
      )
    case 'name':
      return encodeAbiParameters([{ type: 'string' }], [''])
  }
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const callDataOf = async (request: IncomingMessage): Promise<Hex> => {
  if (request.method === 'POST')
    return (JSON.parse(await readBody(request)) as { data: Hex }).data
  const match = request.url?.match(/\/0x[0-9a-fA-F]{40}\/(0x[0-9a-fA-F]*)/)
  if (!match) throw new GatewayFailure(404, 'expected /{sender}/{data}.json')
  return match[1] as Hex
}

/** Answers one CCIP-Read request, filling in `entry` as it goes. */
const respond = async (
  request: IncomingMessage,
  entry: GatewayRequest,
  records: ReadonlyMap<string, OffchainRecords>,
  faults: GatewayFaults,
): Promise<Hex> => {
  if (faults.status)
    throw new GatewayFailure(faults.status, 'forced gateway status')
  const callData = await callDataOf(request)
  const { args } = decodeFunctionData({ abi: RESOLVE_ABI, data: callData })
  const [encodedName, data] = args
  const name = dnsDecode(encodedName)
  entry.keys = keysOf(data)
  entry.isBatch =
    decodeFunctionData({ abi: RECORD_ABI, data }).functionName === 'multicall'
  if (faults.maxUrlLength && entry.urlLength > faults.maxUrlLength)
    throw new GatewayFailure(500, 'request URL too long')
  return answer(
    data,
    records.get(name) ?? {},
    namehash(name),
    new Set(faults.failKeys),
  )
}

/** Starts the gateway; `port` 0 (the default) picks a free port. */
export async function startCcipGateway(port = 0): Promise<CcipGateway> {
  const records = new Map<string, OffchainRecords>()
  const log: GatewayRequest[] = []
  let faults: GatewayFaults = {}

  const server: Server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('access-control-allow-headers', 'content-type')
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }
    const entry: GatewayRequest = {
      method: request.method ?? 'GET',
      urlLength: request.url?.length ?? 0,
      status: 200,
      isBatch: false,
      keys: [],
    }
    log.push(entry)
    const reply = (status: number, body: object) => {
      entry.status = status
      response
        .writeHead(status, { 'content-type': 'application/json' })
        .end(JSON.stringify(body))
    }
    try {
      reply(200, { data: await respond(request, entry, records, faults) })
    } catch (error) {
      const status = error instanceof GatewayFailure ? error.status : 500
      reply(status, {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  )
  const { port: boundPort } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${boundPort}/{sender}/{data}.json`,
    setRecords: (name, value) => records.set(name, value),
    configure: (value) => {
      faults = value
    },
    reset: () => {
      faults = {}
      log.length = 0
    },
    requests: () => [...log],
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  }
}
