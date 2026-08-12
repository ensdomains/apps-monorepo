import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { parseAbi } from 'viem'
import { publicClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia] as Record<string, { address: `0x${string}` }>
const ENSJS_CTRL = c.ensEthRegistrarController.address
const OURS_CTRL = '0xF42dF26c1b222bee5a6B78cBB8bbfaa0Ba07786a' as const
const ENSJS_BASE = c.ensBaseRegistrarImplementation.address
const OURS_BASE = '0x640960927E1E28cC46f9c1F9F1C6cbf4c1bF0e2c' as const // from makeV1Name (V1_BASE_REGISTRAR)
const ENSJS_WRAPPER = c.ensNameWrapper.address

const CTRL = parseAbi([
  'function base() view returns (address)',
  'function nameWrapper() view returns (address)',
  'function prices() view returns (address)',
  'function minCommitmentAge() view returns (uint256)',
  'function maxCommitmentAge() view returns (uint256)',
  'function rentPrice(string name, uint256 duration) view returns (uint256 base, uint256 premium)',
])
const CONTROLLERS = parseAbi(['function controllers(address) view returns (bool)'])

const read = async (address: `0x${string}`, functionName: string, args: unknown[] = []) => {
  try { return await publicClient.readContract({ address, abi: CTRL, functionName: functionName as never, args: args as never }) }
  catch (e) { return `ERR ${String((e as Error).message).split('\n')[0].slice(0, 60)}` }
}

for (const [label, ctrl] of [['fixture  ' + OURS_CTRL, OURS_CTRL], ['ensjs    ' + ENSJS_CTRL, ENSJS_CTRL]] as const) {
  console.log(`\n=== ${label} ===`)
  console.log('  base()          =', await read(ctrl, 'base'))
  console.log('  nameWrapper()   =', await read(ctrl, 'nameWrapper'))
  console.log('  prices()        =', await read(ctrl, 'prices'))
  console.log('  minCommitmentAge=', await read(ctrl, 'minCommitmentAge'))
  console.log('  maxCommitmentAge=', await read(ctrl, 'maxCommitmentAge'))
  console.log('  rentPrice(x,1y) =', await read(ctrl, 'rentPrice', ['probe-abc-123', 31536000n]))
}

console.log('\n=== is each controller authorised on the registrar/wrapper the app reads? ===')
for (const [what, addr] of [['ensjs baseRegistrar ' + ENSJS_BASE, ENSJS_BASE], ['ensjs nameWrapper  ' + ENSJS_WRAPPER, ENSJS_WRAPPER], ['fixture baseRegistrar ' + OURS_BASE, OURS_BASE]] as const) {
  for (const [cl, ctrl] of [['fixture', OURS_CTRL], ['ensjs  ', ENSJS_CTRL]] as const) {
    try {
      const ok = await publicClient.readContract({ address: addr as `0x${string}`, abi: CONTROLLERS, functionName: 'controllers', args: [ctrl] })
      console.log(`  ${what} · controllers(${cl}) = ${ok}`)
    } catch (e) { console.log(`  ${what} · controllers(${cl}) ERR ${String((e as Error).message).split('\n')[0].slice(0, 50)}`) }
  }
}
