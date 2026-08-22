/** Out-of-band V1 reclaim: moves the live registry manager WITHOUT telling the dev panel. */
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  namehash,
  parseAbi,
  toHex,
} from 'viem'

const label = process.argv[2]
const NEW_MANAGER = (process.argv[3] ??
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') as Address
const REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address
const BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as Address
const RPC = 'http://127.0.0.1:8545'

const pub = createPublicClient({ transport: http(RPC) })
const wallet = createWalletClient({ transport: http(RPC) })
const regAbi = parseAbi(['function owner(bytes32 node) view returns (address)'])
const brAbi = parseAbi([
  'function reclaim(uint256 id, address owner)',
  'function ownerOf(uint256 id) view returns (address)',
])
const node = namehash(`${label}.eth`)
const tokenId = BigInt(keccak256(toHex(label)))

const registrant = await pub.readContract({
  address: BASE_REGISTRAR,
  abi: brAbi,
  functionName: 'ownerOf',
  args: [tokenId],
})
const before = await pub.readContract({
  address: REGISTRY,
  abi: regAbi,
  functionName: 'owner',
  args: [node],
})
console.log(`registrant (NFT holder) : ${registrant}`)
console.log(`live manager BEFORE     : ${before}`)

await fetch(RPC, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'anvil_impersonateAccount',
    params: [registrant],
  }),
})

const hash = await wallet.sendTransaction({
  account: registrant,
  chain: null,
  to: BASE_REGISTRAR,
  data: encodeFunctionData({
    abi: brAbi,
    functionName: 'reclaim',
    args: [tokenId, NEW_MANAGER],
  }),
})
await pub.waitForTransactionReceipt({ hash })

const after = await pub.readContract({
  address: REGISTRY,
  abi: regAbi,
  functionName: 'owner',
  args: [node],
})
console.log(`live manager AFTER      : ${after}`)
console.log(
  after.toLowerCase() === NEW_MANAGER.toLowerCase()
    ? '✅ reclaimed'
    : '❌ unchanged',
)
