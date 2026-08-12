import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { publicClient } from '../helpers/anvil-client.js'

const c = ensL1Contracts[supportedL1Chains.sepolia] as Record<string, { address: `0x${string}` }>
const ur = c.ensUniversalResolver?.address
console.log('universalResolver =', ur)

const addr = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`
try {
  console.log('reverse name =', await publicClient.getEnsName({ address: addr, universalResolverAddress: ur }))
} catch (e) { console.log('REV ERR:', String((e as Error).message).split('\n')[0]) }
try {
  console.log('forward rh-e2e-msprkerf.eth =', await publicClient.getEnsAddress({ name: 'rh-e2e-msprkerf.eth', universalResolverAddress: ur }))
} catch (e) { console.log('FWD ERR:', String((e as Error).message).split('\n')[0]) }
