import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { toFunctionSelector } from 'viem'
import { publicClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia] as Record<string, { address: `0x${string}` }>
console.log('--- ensjs sepolia contract keys ---')
for (const [k, v] of Object.entries(c)) console.log(`${k.padEnd(38)} ${v?.address}`)

const OURS = '0xF42dF26c1b222bee5a6B78cBB8bbfaa0Ba07786a' as const
const sigs = [
  'function register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) payable',
  'function register(string,address,uint256,bytes32,address,bytes[],bool,uint16) payable',
  'function register(string,address,uint256,bytes32,address,bytes[],uint8,uint16) payable',
]
const sels = sigs.map((s) => ({ s, sel: toFunctionSelector(s) }))
console.log('\n--- register selectors ---')
for (const { s, sel } of sels) console.log(sel, s.slice(0, 78))

const candidates = new Set<string>([OURS])
for (const [k, v] of Object.entries(c)) if (/controller/i.test(k) && v?.address) candidates.add(v.address)

console.log('\n--- which selectors each controller actually implements ---')
for (const addr of candidates) {
  const code = await publicClient.getCode({ address: addr as `0x${string}` })
  if (!code || code === '0x') { console.log(`${addr}  NO CODE`); continue }
  const present = sels.filter(({ sel }) => code.includes(sel.slice(2))).map(({ sel }) => sel)
  console.log(`${addr}  codeSize=${(code.length - 2) / 2}  has=[${present.join(' ')}]${addr === OURS ? '   <-- fixture uses this' : ''}`)
}
