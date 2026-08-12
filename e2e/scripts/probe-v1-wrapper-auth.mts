import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { parseAbi } from 'viem'
import { publicClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia] as Record<string, { address: `0x${string}` }>
const CTRL = c.ensEthRegistrarController.address
const WRAPPER = c.ensNameWrapper.address
const BASE = c.ensBaseRegistrarImplementation.address
const FIXTURE_WRAPPER = '0xc7e033b8836e4bd55d069d113f018b98478cb091' as const
const FIXTURE_BASE = '0x6409609247722761b8ba96371485de92a6d7b83b' as const
const FIXTURE_CTRL = '0xF42dF26c1b222bee5a6B78cBB8bbfaa0Ba07786a' as const

const A = parseAbi([
  'function owner() view returns (address)',
  'function controllers(address) view returns (bool)',
  'function registrar() view returns (address)',
  'function ens() view returns (address)',
  'function upgradeContract() view returns (address)',
])
const g = async (a: `0x${string}`, fn: string, args: unknown[] = []) => {
  try { return await publicClient.readContract({ address: a, abi: A, functionName: fn as never, args: args as never }) }
  catch { return '—' }
}

console.log('=== the pair the APP reads ===')
console.log('base   ', BASE, 'owner', await g(BASE, 'owner'))
console.log('  controllers(ctrl)   ', await g(BASE, 'controllers', [CTRL]))
console.log('  controllers(wrapper)', await g(BASE, 'controllers', [WRAPPER]))
console.log('wrapper', WRAPPER, 'owner', await g(WRAPPER, 'owner'))
console.log('  registrar()         ', await g(WRAPPER, 'registrar'))
console.log('  ens()               ', await g(WRAPPER, 'ens'))
console.log('  controllers(ctrl)   ', await g(WRAPPER, 'controllers', [CTRL]))

console.log('\n=== the pair the FIXTURE uses (the working one) ===')
console.log('base   ', FIXTURE_BASE, 'owner', await g(FIXTURE_BASE, 'owner'))
console.log('  controllers(ctrl)   ', await g(FIXTURE_BASE, 'controllers', [FIXTURE_CTRL]))
console.log('  controllers(wrapper)', await g(FIXTURE_BASE, 'controllers', [FIXTURE_WRAPPER]))
console.log('wrapper', FIXTURE_WRAPPER, 'owner', await g(FIXTURE_WRAPPER, 'owner'))
console.log('  registrar()         ', await g(FIXTURE_WRAPPER, 'registrar'))
console.log('  ens()               ', await g(FIXTURE_WRAPPER, 'ens'))
console.log('  controllers(ctrl)   ', await g(FIXTURE_WRAPPER, 'controllers', [FIXTURE_CTRL]))
