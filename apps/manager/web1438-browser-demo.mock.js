import { decodeFunctionData, decodeFunctionResult, encodeFunctionResult, encodeAbiParameters, multicall3Abi, namehash, parseAbi, toHex } from 'viem'
import { packetToBytes } from 'viem/ens'
const multicallSnippet = parseAbi(['function multicall(bytes[] data) view returns (bytes[] results)'])
const universalResolverResolveSnippet = parseAbi(['function resolve(bytes name, bytes data) view returns (bytes data, address resolver)'])
const universalResolverResolveWithGatewaysSnippet = parseAbi(['function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes data, address resolver)'])
const publicResolverMultiAddrSnippet = parseAbi(['function addr(bytes32 node, uint256 coinType) view returns (bytes)'])
const publicResolverTextSnippet = parseAbi(['function text(bytes32 node, string key) view returns (string)'])

const targetName = 'alnila.eth'
const targetNode = namehash(targetName)
const targetDns = toHex(packetToBytes(targetName))
const rawZen = `0x2089${'11'.repeat(131072 - 2)}`
const zenResult = encodeAbiParameters([{ type: 'bytes' }], [rawZen])
const resolverAbi = [...publicResolverMultiAddrSnippet, ...publicResolverTextSnippet]
const universalAbi = [...universalResolverResolveSnippet, ...universalResolverResolveWithGatewaysSnippet]
const stats = { targetName, bytes: 131072, injected: 0, requests: [], errors: [] }

function transformResolverCall(data) {
  try {
    const call = decodeFunctionData({ abi: resolverAbi, data })
    if (call.args[0] !== targetNode) return null
    const label = call.functionName === 'text' ? `text:${call.args[1]}` : `coin:${call.args[1]}`
    stats.requests.push(label)
    if (call.functionName === 'addr' && call.args[1] === 121n) {
      return () => {
        stats.injected++
        console.info('[WEB-1438 local demo] Injected 131072-byte ZEN response for alnila.eth. No blockchain write.')
        return zenResult
      }
    }
  } catch {}
  return null
}

function transformUniversalCall(data) {
  try {
    const call = decodeFunctionData({ abi: universalAbi, data })
    if (!['resolve', 'resolveWithGateways'].includes(call.functionName) || call.args[0] !== targetDns) return null
    let rewrite
    try {
      const inner = decodeFunctionData({ abi: multicallSnippet, data: call.args[1] })
      const transformers = inner.args[0].map(transformResolverCall)
      if (!transformers.some(Boolean)) return null
      rewrite = value => {
        const outputs = decodeFunctionResult({ abi: multicallSnippet, functionName: 'multicall', data: value })
        return encodeFunctionResult({ abi: multicallSnippet, functionName: 'multicall', result: outputs.map((item, i) => transformers[i] ? transformers[i](item) : item) })
      }
    } catch {
      rewrite = transformResolverCall(call.args[1])
      if (!rewrite) return null
    }
    return value => {
      const [resolved, resolver] = decodeFunctionResult({ abi: universalAbi, functionName: call.functionName, data: value })
      return encodeFunctionResult({ abi: universalAbi, functionName: call.functionName, result: [rewrite(resolved), resolver] })
    }
  } catch {}
  return null
}

function makeTransformer(data) {
  const direct = transformUniversalCall(data)
  if (direct) return direct
  try {
    const call = decodeFunctionData({ abi: multicall3Abi, data })
    if (call.functionName !== 'aggregate3') return null
    const transformers = call.args[0].map(item => transformUniversalCall(item.callData))
    if (!transformers.some(Boolean)) return null
    return value => {
      const outputs = decodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', data: value })
      return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: outputs.map((item, i) => item.success && transformers[i] ? { ...item, returnData: transformers[i](item.returnData) } : item) })
    }
  } catch {}
  return null
}

export function install(originalFetch) {
  if (location.hostname !== 'localhost') throw new Error('Local demo only')
  window.__web1438Demo = stats
  window.fetch = async (...args) => {
    let rpc
    let transforms
    try {
      rpc = JSON.parse(args[1]?.body)
      transforms = (Array.isArray(rpc) ? rpc : [rpc]).map(item => item.method === 'eth_call' ? makeTransformer(item.params[0].data) : null)
    } catch {}
    const response = await originalFetch(...args)
    if (!transforms?.some(Boolean) || !response.ok) return response
    try {
      const json = await response.clone().json()
      const requests = Array.isArray(rpc) ? rpc : [rpc]
      const outputs = (Array.isArray(json) ? json : [json]).map(item => {
        const index = requests.findIndex(request => request.id === item.id)
        return item.result && transforms[index] ? { ...item, result: transforms[index](item.result) } : item
      })
      const headers = new Headers(response.headers)
      headers.delete('content-length')
      headers.delete('content-encoding')
      return new Response(JSON.stringify(Array.isArray(json) ? outputs : outputs[0]), { status: response.status, headers })
    } catch (error) {
      stats.errors.push(String(error))
      throw error
    }
  }
  console.info('[WEB-1438 local demo] Browser response override enabled for alnila.eth only.')
}
